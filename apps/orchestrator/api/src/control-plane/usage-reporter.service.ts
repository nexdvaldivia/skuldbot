import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LicenseService } from '../license/license.service';

/**
 * Usage Event - Billable event from bot execution
 */
export interface UsageEvent {
  id: string;
  tenantId: string;
  botId: string;
  runId: string;
  installationId?: string; // Marketplace installation ID

  // Event details
  metric: string; // 'claims_created', 'calls_answered', 'emails_processed', etc.
  quantity: number;
  occurredAt: Date;

  // Metadata
  metadata?: Record<string, unknown>;

  // Processing state
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

/**
 * Usage Batch - Group of events sent to Control-Plane
 */
export interface UsageBatch {
  batchId: string;
  orchestratorId: string;
  tenantId: string;
  events: UsageEvent[];
  sentAt: Date;
  status: 'pending' | 'sent' | 'acked' | 'failed';
}

/**
 * Usage Summary - Aggregated usage for a period
 */
export interface UsageSummary {
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: Record<
    string,
    {
      total: number;
      byBot: Record<string, number>;
    }
  >;
}

/**
 * Usage Reporter Service
 *
 * Collects and reports usage/billing events to the Control-Plane.
 *
 * Flow:
 * 1. Bot execution emits billing events via BillingLibrary (Python)
 * 2. Runner sends events to Orchestrator API
 * 3. This service queues events locally
 * 4. Every 5 minutes, batches events and sends to Control-Plane
 * 5. Control-Plane forwards to Stripe for metered billing
 *
 * Features:
 * - Local queue with persistence (BullMQ + Redis)
 * - Retry logic for failed submissions
 * - Idempotency via event IDs
 * - Graceful offline handling
 */
@Injectable()
export class UsageReporterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsageReporterService.name);

  // In-memory buffer for events before persisting
  private eventBuffer: UsageEvent[] = [];
  private readonly bufferMaxSize = 100;

  // Batch settings
  private readonly batchIntervalMs = 300000; // 5 minutes
  private batchTimer: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    eventsReceived: 0,
    eventsSent: 0,
    eventsFailed: 0,
    batchesSent: 0,
    lastBatchAt: null as Date | null,
  };

  private readonly orchestratorId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
    @InjectQueue('control-plane')
    private readonly controlPlaneQueue: Queue,
  ) {
    this.orchestratorId = this.configService.get<string>(
      'ORCHESTRATOR_ID',
      `orch-${Math.random().toString(36).substring(2, 10)}`,
    );
  }

  async onModuleInit() {
    // Start batch timer
    this.batchTimer = setInterval(() => this.flushBatch(), this.batchIntervalMs);
    this.logger.log('Usage Reporter initialized');
  }

  async onModuleDestroy() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    // Flush remaining events
    await this.flushBatch();
  }

  /**
   * Track a usage event from a bot execution
   *
   * Called by the Runner when bot emits billing events via BillingLibrary
   */
  async trackEvent(event: Omit<UsageEvent, 'id' | 'status' | 'attempts'>): Promise<string> {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    const usageEvent: UsageEvent = {
      ...event,
      id: eventId,
      status: 'pending',
      attempts: 0,
    };

    this.eventBuffer.push(usageEvent);
    this.stats.eventsReceived++;

    this.logger.debug(`Tracked usage event: ${event.metric} x${event.quantity} for bot ${event.botId}`);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.bufferMaxSize) {
      await this.flushBatch();
    }

    return eventId;
  }

  /**
   * Track multiple events at once (from batch submission by Runner)
   */
  async trackEvents(
    events: Array<Omit<UsageEvent, 'id' | 'status' | 'attempts'>>,
  ): Promise<string[]> {
    const eventIds: string[] = [];

    for (const event of events) {
      const id = await this.trackEvent(event);
      eventIds.push(id);
    }

    return eventIds;
  }

  /**
   * Flush buffered events to Control-Plane
   */
  async flushBatch(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    const tenantId = this.licenseService.getTenantId();
    if (!tenantId) {
      this.logger.warn('No tenant ID available, events will be queued');
      // Re-add events to buffer
      this.eventBuffer.push(...events);
      return;
    }

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    const batch: UsageBatch = {
      batchId,
      orchestratorId: this.orchestratorId,
      tenantId,
      events,
      sentAt: new Date(),
      status: 'pending',
    };

    // Add to queue for processing
    await this.controlPlaneQueue.add(
      'send-usage-batch',
      batch,
      {
        jobId: batchId,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60000, // Start with 1 minute
        },
        removeOnComplete: { count: 100, age: 86400 }, // Keep 100 or 24 hours
        removeOnFail: { count: 1000, age: 604800 }, // Keep 1000 or 7 days
      },
    );

    this.stats.batchesSent++;
    this.stats.lastBatchAt = new Date();

    this.logger.log(`Queued usage batch ${batchId} with ${events.length} events`);
  }

  /**
   * Get current usage summary
   */
  async getUsageSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageSummary> {
    // In production, this would query from database
    // For now, return empty summary

    return {
      tenantId,
      period: {
        start: startDate,
        end: endDate,
      },
      metrics: {},
    };
  }

  /**
   * Get reporter stats
   */
  getStats(): typeof this.stats & { bufferSize: number } {
    return {
      ...this.stats,
      bufferSize: this.eventBuffer.length,
    };
  }

  /**
   * Get pending events count
   */
  getPendingCount(): number {
    return this.eventBuffer.length;
  }
}
