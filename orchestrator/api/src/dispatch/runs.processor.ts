import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Run, RunStatus } from '../runs/entities/run.entity';
import { BotVersion } from '../bots/entities/bot.entity';
import { RunnerGateway } from '../websocket/runner.gateway';
import { QUEUE_DEFAULT } from './dispatch.service';

/**
 * Job payload from queue
 */
interface RunJobPayload {
  runId: string;
  tenantId: string;
  botVersionId: string;
  planHash?: string;
  targetQueue: string;
}

/**
 * Runs Processor - BullMQ Worker for processing run jobs
 *
 * This processor:
 * 1. Receives jobs from the queue
 * 2. Fetches bot package URL and secrets
 * 3. Assigns job to available runner via WebSocket
 * 4. Monitors job progress and handles timeouts
 * 5. Updates run status based on results
 *
 * The actual execution happens on the runner - this processor
 * only orchestrates the job assignment.
 */
@Processor(QUEUE_DEFAULT)
export class RunsProcessor extends WorkerHost {
  private readonly logger = new Logger(RunsProcessor.name);

  // Track jobs waiting for runners
  private pendingAssignments = new Map<
    string,
    {
      jobId: string;
      runId: string;
      timeout: NodeJS.Timeout;
      resolve: (value: boolean) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
    @Inject(forwardRef(() => RunnerGateway))
    private readonly runnerGateway: RunnerGateway,
  ) {
    super();
  }

  /**
   * Process a run job
   */
  async process(job: Job<RunJobPayload>): Promise<{ status: string; runId: string }> {
    const { runId, tenantId, botVersionId } = job.data;
    this.logger.log(`Processing run job ${job.id} for run ${runId}`);

    try {
      // Update run status to RUNNING
      await this.runRepository.update(runId, {
        status: RunStatus.RUNNING,
        startedAt: new Date(),
      });

      // Get bot version with compiled plan
      const version = await this.versionRepository.findOne({
        where: { id: botVersionId },
        relations: ['bot'],
      });

      if (!version) {
        throw new Error(`Bot version ${botVersionId} not found`);
      }

      if (!version.compiledPlan) {
        throw new Error(`Bot version ${botVersionId} not compiled`);
      }

      // Get bot package URL
      const botPackageUrl = this.getBotPackageUrl(version);

      // Get run with inputs
      const run = await this.runRepository.findOne({
        where: { id: runId },
      });

      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }

      // Resolve secrets (fetch from vault)
      const secrets = await this.resolveSecrets(tenantId, version.compiledPlan);

      // Create job assignment for runner
      const jobAssignment = {
        jobId: job.id as string,
        runId,
        botId: version.botId,
        botPackageUrl,
        variables: run.inputs ?? {},
        secrets,
        priority: job.opts.priority ?? 0,
        timeout: (version.bot?.timeoutSeconds ?? 3600) * 1000, // Convert to ms, default 1 hour
        retryAttempt: job.attemptsMade,
      };

      // Try to assign to runner
      const assigned = this.runnerGateway.assignJob(jobAssignment);

      if (!assigned) {
        // No runner available, wait for one (with timeout)
        this.logger.log(`No runner available for run ${runId}, waiting...`);

        const waitResult = await this.waitForRunner(jobAssignment, 300000); // 5 min timeout

        if (!waitResult) {
          throw new Error('No runner available after timeout');
        }
      }

      // Job is assigned, wait for completion
      // The actual completion is handled by RunnerGateway events
      // This processor returns immediately after assignment
      // The run status will be updated by event handlers

      this.logger.log(`Run ${runId} assigned to runner successfully`);

      return { status: 'assigned', runId };
    } catch (error) {
      this.logger.error(`Run ${runId} failed: ${error}`);

      // Update run status to FAILED
      await this.runRepository.update(runId, {
        status: RunStatus.FAILED,
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'DISPATCH_ERROR',
      });

      throw error;
    }
  }

  /**
   * Wait for a runner to become available
   */
  private waitForRunner(
    jobAssignment: {
      jobId: string;
      runId: string;
      botId: string;
      botPackageUrl: string;
      variables: Record<string, unknown>;
      secrets: Record<string, string>;
      priority: number;
      timeout: number;
      retryAttempt: number;
    },
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAssignments.delete(jobAssignment.runId);
        resolve(false);
      }, timeoutMs);

      this.pendingAssignments.set(jobAssignment.runId, {
        jobId: jobAssignment.jobId,
        runId: jobAssignment.runId,
        timeout,
        resolve: (assigned: boolean) => {
          clearTimeout(timeout);
          this.pendingAssignments.delete(jobAssignment.runId);
          resolve(assigned);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.pendingAssignments.delete(jobAssignment.runId);
          reject(error);
        },
      });

      // Periodically retry assignment
      const retryInterval = setInterval(() => {
        if (!this.pendingAssignments.has(jobAssignment.runId)) {
          clearInterval(retryInterval);
          return;
        }

        const assigned = this.runnerGateway.assignJob(jobAssignment);
        if (assigned) {
          clearInterval(retryInterval);
          const pending = this.pendingAssignments.get(jobAssignment.runId);
          if (pending) {
            pending.resolve(true);
          }
        }
      }, 5000); // Retry every 5 seconds
    });
  }

  /**
   * Get bot package URL for a version
   */
  private getBotPackageUrl(version: BotVersion): string {
    // In production, this would return a signed URL to the bot package in storage
    // For now, generate URL based on storage configuration

    // Check if metadata contains a custom package URL
    const customUrl = version.metadata?.packageUrl;
    if (customUrl && typeof customUrl === 'string') {
      return customUrl;
    }

    // Generate URL based on storage configuration
    return `/storage/bots/${version.botId}/versions/${version.id}/package.skb`;
  }

  /**
   * Resolve secrets for a bot execution
   */
  private async resolveSecrets(
    _tenantId: string,
    _compiledPlan: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    // In production, this would:
    // 1. Parse compiledPlan to find secret references (${vault.xxx})
    // 2. Fetch secrets from vault service
    // 3. Return encrypted secrets for transit to runner

    // For now, return empty object
    // TODO: Integrate with VaultService
    return {};
  }

  /**
   * Handle runner coming online - retry pending assignments
   */
  onRunnerOnline(): void {
    for (const [runId] of this.pendingAssignments) {
      this.logger.log(`Runner came online, will retry assignment for run ${runId}`);
      // The retry interval in waitForRunner will pick this up
    }
  }

  // Worker lifecycle events

  @OnWorkerEvent('completed')
  onCompleted(job: Job<RunJobPayload>) {
    this.logger.log(`Job ${job.id} completed for run ${job.data.runId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RunJobPayload>, error: Error) {
    this.logger.error(`Job ${job.id} failed for run ${job.data.runId}: ${error.message}`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job<RunJobPayload>) {
    this.logger.log(`Job ${job.id} started processing for run ${job.data.runId}`);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`Job ${jobId} stalled`);
  }
}
