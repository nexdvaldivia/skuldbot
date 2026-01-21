import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { UsageBatch } from './usage-reporter.service';

/**
 * Usage Batch Processor
 *
 * Processes queued usage batches and sends them to Control-Plane.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Idempotency via batch IDs
 * - Graceful handling of Control-Plane outages
 */
@Processor('control-plane')
export class UsageBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(UsageBatchProcessor.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async process(job: Job<UsageBatch>): Promise<{ status: string; eventCount: number }> {
    const batch = job.data;
    this.logger.log(`Processing usage batch ${batch.batchId} with ${batch.events.length} events`);

    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');
    if (!controlPlaneUrl) {
      this.logger.warn('No CONTROL_PLANE_URL configured, batch will be retried');
      throw new Error('Control-Plane URL not configured');
    }

    try {
      const response = await fetch(`${controlPlaneUrl}/api/usage/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': this.configService.get<string>('LICENSE_KEY', ''),
          'X-Api-Key': this.configService.get<string>('CONTROL_PLANE_API_KEY', ''),
          'X-Orchestrator-Id': batch.orchestratorId,
          'X-Batch-Id': batch.batchId,
        },
        body: JSON.stringify({
          batchId: batch.batchId,
          tenantId: batch.tenantId,
          events: batch.events.map((e) => ({
            id: e.id,
            metric: e.metric,
            quantity: e.quantity,
            occurredAt: e.occurredAt,
            botId: e.botId,
            runId: e.runId,
            installationId: e.installationId,
            metadata: e.metadata,
          })),
          sentAt: batch.sentAt,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        this.logger.log(
          `Usage batch ${batch.batchId} sent successfully: ${result.processedCount || batch.events.length} events`,
        );
        return { status: 'success', eventCount: batch.events.length };
      }

      // Handle specific error codes
      if (response.status === 401 || response.status === 403) {
        this.logger.error(`Authentication failed for batch ${batch.batchId}`);
        throw new Error('Authentication failed - check license key');
      }

      if (response.status === 409) {
        // Duplicate batch - already processed
        this.logger.log(`Batch ${batch.batchId} already processed (duplicate)`);
        return { status: 'duplicate', eventCount: batch.events.length };
      }

      if (response.status >= 500) {
        // Server error - retry
        throw new Error(`Control-Plane server error: ${response.status}`);
      }

      // Other errors - log and fail
      const errorBody = await response.text();
      throw new Error(`Control-Plane error ${response.status}: ${errorBody}`);
    } catch (error) {
      this.logger.error(`Failed to send usage batch ${batch.batchId}: ${error}`);
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<UsageBatch>) {
    this.logger.log(`Usage batch ${job.data.batchId} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<UsageBatch>, error: Error) {
    this.logger.error(
      `Usage batch ${job.data.batchId} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }
}
