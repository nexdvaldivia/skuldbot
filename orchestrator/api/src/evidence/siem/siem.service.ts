import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SIEM Event - Normalized security event
 */
export interface SiemEvent {
  id: string;
  timestamp: string;
  source: string;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  action: string;
  outcome: 'success' | 'failure' | 'unknown';
  actor?: {
    id: string;
    type: string;
    name?: string;
  };
  target?: {
    id: string;
    type: string;
    name?: string;
  };
  details: Record<string, unknown>;
  tags: string[];
}

/**
 * SIEM Provider configuration
 */
export interface SiemProvider {
  type: 'splunk' | 'datadog' | 'cloudwatch' | 'elk' | 'sentinel' | 'custom';
  endpoint?: string;
  apiKey?: string;
  index?: string;
  enabled: boolean;
}

/**
 * SIEM Integration Service
 *
 * Sends security-relevant events to SIEM platforms:
 * - Splunk (HTTP Event Collector)
 * - DataDog (Logs API)
 * - AWS CloudWatch Logs
 * - ELK Stack (Elasticsearch)
 * - Azure Sentinel
 * - Custom webhook endpoints
 *
 * Events are normalized to a common format and sent asynchronously.
 */
@Injectable()
export class SiemService {
  private readonly logger = new Logger(SiemService.name);
  private providers: SiemProvider[] = [];
  private eventBuffer: SiemEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeProviders();
    this.startFlushInterval();
  }

  /**
   * Initialize configured SIEM providers.
   */
  private initializeProviders(): void {
    const config = this.configService.get<SiemProvider[]>('evidence.siem.providers', []);

    this.providers = config.filter((p) => p.enabled);

    if (this.providers.length === 0) {
      this.logger.log('No SIEM providers configured');
    } else {
      this.logger.log(`Initialized ${this.providers.length} SIEM providers`);
    }
  }

  /**
   * Start the flush interval for batch sending.
   */
  private startFlushInterval(): void {
    const intervalMs = this.configService.get<number>('evidence.siem.flushIntervalMs', 5000);

    this.flushInterval = setInterval(() => {
      this.flush();
    }, intervalMs);
  }

  /**
   * Send an event to SIEM.
   */
  async sendEvent(event: Omit<SiemEvent, 'id' | 'timestamp' | 'source'>): Promise<void> {
    const fullEvent: SiemEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      source: 'skuldbot-orchestrator',
      ...event,
    };

    this.eventBuffer.push(fullEvent);

    // Immediate flush for high severity
    if (event.severity === 'high' || event.severity === 'critical') {
      await this.flush();
    }
  }

  /**
   * Log evidence pack creation.
   */
  async logPackCreated(params: {
    packId: string;
    tenantId: string;
    botId: string;
    executionId: string;
    fileCount: number;
  }): Promise<void> {
    await this.sendEvent({
      category: 'evidence',
      severity: 'info',
      action: 'pack_created',
      outcome: 'success',
      target: {
        id: params.packId,
        type: 'evidence_pack',
      },
      details: {
        tenantId: params.tenantId,
        botId: params.botId,
        executionId: params.executionId,
        fileCount: params.fileCount,
      },
      tags: ['evidence', 'audit'],
    });
  }

  /**
   * Log evidence pack access.
   */
  async logPackAccessed(params: {
    packId: string;
    tenantId: string;
    userId: string;
    accessType: 'view' | 'download' | 'export';
    reason?: string;
  }): Promise<void> {
    await this.sendEvent({
      category: 'evidence',
      severity: 'low',
      action: 'pack_accessed',
      outcome: 'success',
      actor: {
        id: params.userId,
        type: 'user',
      },
      target: {
        id: params.packId,
        type: 'evidence_pack',
      },
      details: {
        tenantId: params.tenantId,
        accessType: params.accessType,
        reason: params.reason,
      },
      tags: ['evidence', 'access'],
    });
  }

  /**
   * Log integrity verification.
   */
  async logIntegrityCheck(params: {
    packId: string;
    tenantId: string;
    valid: boolean;
    tamperedFiles?: string[];
    missingFiles?: string[];
  }): Promise<void> {
    const severity = params.valid ? 'info' : 'critical';
    const outcome = params.valid ? 'success' : 'failure';

    await this.sendEvent({
      category: 'evidence',
      severity,
      action: 'integrity_verified',
      outcome,
      target: {
        id: params.packId,
        type: 'evidence_pack',
      },
      details: {
        tenantId: params.tenantId,
        valid: params.valid,
        tamperedFiles: params.tamperedFiles,
        missingFiles: params.missingFiles,
      },
      tags: ['evidence', 'security', 'integrity'],
    });
  }

  /**
   * Log legal hold applied.
   */
  async logLegalHold(params: {
    packId: string;
    tenantId: string;
    userId: string;
    action: 'applied' | 'released';
    reason: string;
    caseId?: string;
  }): Promise<void> {
    await this.sendEvent({
      category: 'evidence',
      severity: 'high',
      action: `legal_hold_${params.action}`,
      outcome: 'success',
      actor: {
        id: params.userId,
        type: 'user',
      },
      target: {
        id: params.packId,
        type: 'evidence_pack',
      },
      details: {
        tenantId: params.tenantId,
        reason: params.reason,
        caseId: params.caseId,
      },
      tags: ['evidence', 'legal', 'compliance'],
    });
  }

  /**
   * Log authentication event.
   */
  async logAuthEvent(params: {
    userId: string;
    action: 'login' | 'logout' | 'token_refresh' | 'failed_attempt';
    success: boolean;
    ip?: string;
    userAgent?: string;
    failureReason?: string;
  }): Promise<void> {
    const severity = params.success ? 'info' : 'medium';

    await this.sendEvent({
      category: 'authentication',
      severity,
      action: params.action,
      outcome: params.success ? 'success' : 'failure',
      actor: {
        id: params.userId,
        type: 'user',
      },
      details: {
        ip: params.ip,
        userAgent: params.userAgent,
        failureReason: params.failureReason,
      },
      tags: ['auth', 'security'],
    });
  }

  /**
   * Flush buffered events to SIEM providers.
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    for (const provider of this.providers) {
      try {
        await this.sendToProvider(provider, events);
      } catch (error) {
        this.logger.error(`Failed to send events to ${provider.type}: ${error}`);
        // Re-buffer events on failure (with limit)
        if (this.eventBuffer.length < 1000) {
          this.eventBuffer.push(...events);
        }
      }
    }
  }

  /**
   * Send events to a specific provider.
   */
  private async sendToProvider(provider: SiemProvider, events: SiemEvent[]): Promise<void> {
    switch (provider.type) {
      case 'splunk':
        await this.sendToSplunk(provider, events);
        break;
      case 'datadog':
        await this.sendToDatadog(provider, events);
        break;
      case 'cloudwatch':
        await this.sendToCloudWatch(provider, events);
        break;
      case 'elk':
        await this.sendToElk(provider, events);
        break;
      case 'sentinel':
        await this.sendToSentinel(provider, events);
        break;
      case 'custom':
        await this.sendToCustom(provider, events);
        break;
    }
  }

  /**
   * Send to Splunk HTTP Event Collector.
   */
  private async sendToSplunk(provider: SiemProvider, events: SiemEvent[]): Promise<void> {
    if (!provider.endpoint || !provider.apiKey) {
      return;
    }

    const payload = events
      .map((e) => JSON.stringify({ event: e, index: provider.index }))
      .join('\n');

    // TODO: Implement actual HTTP call
    this.logger.debug(`Would send ${events.length} events to Splunk`);
  }

  /**
   * Send to DataDog Logs API.
   */
  private async sendToDatadog(provider: SiemProvider, events: SiemEvent[]): Promise<void> {
    if (!provider.apiKey) {
      return;
    }

    // TODO: Implement actual HTTP call
    this.logger.debug(`Would send ${events.length} events to DataDog`);
  }

  /**
   * Send to AWS CloudWatch Logs.
   */
  private async sendToCloudWatch(provider: SiemProvider, events: SiemEvent[]): Promise<void> {
    // TODO: Implement CloudWatch Logs integration
    this.logger.debug(`Would send ${events.length} events to CloudWatch`);
  }

  /**
   * Send to ELK Stack.
   */
  private async sendToElk(provider: SiemProvider, events: SiemEvent[]): Promise<void> {
    if (!provider.endpoint) {
      return;
    }

    // TODO: Implement Elasticsearch bulk API
    this.logger.debug(`Would send ${events.length} events to ELK`);
  }

  /**
   * Send to Azure Sentinel.
   */
  private async sendToSentinel(provider: SiemProvider, events: SiemEvent[]): Promise<void> {
    // TODO: Implement Azure Sentinel Data Collector API
    this.logger.debug(`Would send ${events.length} events to Sentinel`);
  }

  /**
   * Send to custom webhook.
   */
  private async sendToCustom(provider: SiemProvider, events: SiemEvent[]): Promise<void> {
    if (!provider.endpoint) {
      return;
    }

    // TODO: Implement custom webhook
    this.logger.debug(`Would send ${events.length} events to custom endpoint`);
  }

  /**
   * Generate unique event ID.
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `siem_${timestamp}_${random}`;
  }

  /**
   * Cleanup on module destroy.
   */
  onModuleDestroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}
