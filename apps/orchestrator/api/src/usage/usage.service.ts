import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { UsageEvent } from './entities/usage-event.entity';
import { UsageReporterService } from '../control-plane/usage-reporter.service';

export interface TrackUsageDto {
  tenantId: string;
  botId: string;
  runId?: string;
  installationId?: string;
  metric: string;
  quantity: number;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalEvents: number;
  metrics: Record<
    string,
    {
      total: number;
      byBot: Record<string, number>;
      byInstallation: Record<string, number>;
    }
  >;
}

/**
 * Usage Service
 *
 * Handles tracking and querying of usage events.
 * Events are persisted locally and forwarded to Control-Plane for billing.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(UsageEvent)
    private readonly usageEventRepository: Repository<UsageEvent>,
    private readonly usageReporter: UsageReporterService,
  ) {}

  /**
   * Track a single usage event
   */
  async trackEvent(dto: TrackUsageDto): Promise<UsageEvent> {
    const event = this.usageEventRepository.create({
      tenantId: dto.tenantId,
      botId: dto.botId,
      runId: dto.runId,
      installationId: dto.installationId,
      metric: dto.metric,
      quantity: dto.quantity,
      occurredAt: dto.occurredAt || new Date(),
      metadata: dto.metadata,
      status: 'pending',
      attempts: 0,
    });

    const saved = await this.usageEventRepository.save(event);

    // Forward to reporter for Control-Plane sync
    await this.usageReporter.trackEvent({
      tenantId: dto.tenantId,
      botId: dto.botId,
      runId: dto.runId || '',
      installationId: dto.installationId,
      metric: dto.metric,
      quantity: dto.quantity,
      occurredAt: dto.occurredAt || new Date(),
      metadata: dto.metadata,
    });

    this.logger.debug(
      `Tracked usage: ${dto.metric} x${dto.quantity} for bot ${dto.botId}`,
    );

    return saved;
  }

  /**
   * Track multiple usage events at once
   */
  async trackEvents(events: TrackUsageDto[]): Promise<UsageEvent[]> {
    const results: UsageEvent[] = [];

    for (const event of events) {
      const saved = await this.trackEvent(event);
      results.push(saved);
    }

    return results;
  }

  /**
   * Get usage summary for a tenant
   */
  async getUsageSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageSummary> {
    const events = await this.usageEventRepository.find({
      where: {
        tenantId,
        occurredAt: Between(startDate, endDate),
      },
    });

    const metrics: UsageSummary['metrics'] = {};

    for (const event of events) {
      if (!metrics[event.metric]) {
        metrics[event.metric] = {
          total: 0,
          byBot: {},
          byInstallation: {},
        };
      }

      const quantity = Number(event.quantity);
      metrics[event.metric].total += quantity;

      // By bot
      if (!metrics[event.metric].byBot[event.botId]) {
        metrics[event.metric].byBot[event.botId] = 0;
      }
      metrics[event.metric].byBot[event.botId] += quantity;

      // By installation
      if (event.installationId) {
        if (!metrics[event.metric].byInstallation[event.installationId]) {
          metrics[event.metric].byInstallation[event.installationId] = 0;
        }
        metrics[event.metric].byInstallation[event.installationId] += quantity;
      }
    }

    return {
      tenantId,
      period: { start: startDate, end: endDate },
      totalEvents: events.length,
      metrics,
    };
  }

  /**
   * Get usage for a specific bot
   */
  async getBotUsage(
    tenantId: string,
    botId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ metric: string; total: number }[]> {
    const events = await this.usageEventRepository.find({
      where: {
        tenantId,
        botId,
        occurredAt: Between(startDate, endDate),
      },
    });

    const byMetric: Record<string, number> = {};

    for (const event of events) {
      if (!byMetric[event.metric]) {
        byMetric[event.metric] = 0;
      }
      byMetric[event.metric] += Number(event.quantity);
    }

    return Object.entries(byMetric).map(([metric, total]) => ({
      metric,
      total,
    }));
  }

  /**
   * Get usage for a marketplace installation
   */
  async getInstallationUsage(
    installationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ metric: string; total: number }[]> {
    const events = await this.usageEventRepository.find({
      where: {
        installationId,
        occurredAt: Between(startDate, endDate),
      },
    });

    const byMetric: Record<string, number> = {};

    for (const event of events) {
      if (!byMetric[event.metric]) {
        byMetric[event.metric] = 0;
      }
      byMetric[event.metric] += Number(event.quantity);
    }

    return Object.entries(byMetric).map(([metric, total]) => ({
      metric,
      total,
    }));
  }

  /**
   * Mark events as sent in a batch
   */
  async markEventsSent(eventIds: string[], batchId: string): Promise<void> {
    await this.usageEventRepository.update(
      { id: eventIds as unknown as string },
      {
        status: 'sent',
        batchId,
        lastAttempt: new Date(),
      },
    );
  }

  /**
   * Mark batch as acknowledged by Control-Plane
   */
  async markBatchAcked(batchId: string): Promise<void> {
    await this.usageEventRepository.update({ batchId }, { status: 'acked' });
  }

  /**
   * Get pending events count
   */
  async getPendingCount(tenantId: string): Promise<number> {
    return this.usageEventRepository.count({
      where: { tenantId, status: 'pending' },
    });
  }

  /**
   * Cleanup old acknowledged events
   */
  async cleanupOldEvents(olderThan: Date): Promise<number> {
    const result = await this.usageEventRepository.delete({
      status: 'acked',
      occurredAt: LessThan(olderThan),
    });
    return result.affected || 0;
  }
}
