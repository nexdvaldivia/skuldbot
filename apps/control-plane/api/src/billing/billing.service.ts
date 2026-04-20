import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, QueryFailedError } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  UsageRecord,
  UsageBatch,
  UsageIngestEvent,
  UsageIngestDeadLetter,
} from './entities/usage-record.entity';
import {
  RevenueShareRecord,
  RevenueShareTier,
  PartnerPayout,
} from './entities/revenue-share.entity';
import { Partner } from '../marketplace/entities/partner.entity';
import { assertNoOperationalEvidencePayload } from '../common/security/evidence-boundary.util';
import { requireEntity } from '../common/utils/entity.util';
import { TenantSubscription, SubscriptionStatus } from './entities/subscription.entity';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.constants';
import { PaymentProvider } from '../common/interfaces/integration.interface';

/**
 * Usage Event from Orchestrator
 */
export interface UsageEventDto {
  id: string;
  metric: string;
  quantity: number;
  occurredAt: string;
  botId?: string;
  runId?: string;
  installationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Usage Batch from Orchestrator
 */
export interface UsageBatchDto {
  batchId: string;
  tenantId: string;
  events: UsageEventDto[];
  sentAt: string;
}

export interface UsageIngestResult {
  processedCount: number;
  duplicateBatch: boolean;
  duplicateEventCount: number;
  traceId?: string;
}

/**
 * Billing Service
 *
 * Handles usage ingestion, billing calculations, and revenue share.
 *
 * Flow:
 * 1. Orchestrators send usage batches via /api/usage/ingest
 * 2. Events are aggregated into UsageRecords by period
 * 3. At month end, usage is sent to Stripe for billing
 * 4. Revenue share is calculated for partner bots
 * 5. Payouts are made via Stripe Connect
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  // Commission rates by tier
  private readonly commissionRates: Record<RevenueShareTier, number> = {
    [RevenueShareTier.STARTER]: 0.3, // 30% commission
    [RevenueShareTier.ESTABLISHED]: 0.25, // 25% commission
    [RevenueShareTier.PREMIER]: 0.2, // 20% commission
  };

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UsageRecord)
    private readonly usageRecordRepository: Repository<UsageRecord>,
    @InjectRepository(UsageBatch)
    private readonly usageBatchRepository: Repository<UsageBatch>,
    @InjectRepository(UsageIngestEvent)
    private readonly usageIngestEventRepository: Repository<UsageIngestEvent>,
    @InjectRepository(UsageIngestDeadLetter)
    private readonly usageIngestDeadLetterRepository: Repository<UsageIngestDeadLetter>,
    @InjectRepository(RevenueShareRecord)
    private readonly revenueShareRepository: Repository<RevenueShareRecord>,
    @InjectRepository(PartnerPayout)
    private readonly partnerPayoutRepository: Repository<PartnerPayout>,
    @InjectRepository(Partner)
    private readonly partnerRepository: Repository<Partner>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Ingest a usage batch from an Orchestrator
   */
  async ingestUsageBatch(
    orchestratorId: string,
    batch: UsageBatchDto,
    options?: { traceId?: string },
  ): Promise<UsageIngestResult> {
    const traceId = options?.traceId;
    const sentAt = this.validateUsageBatch(batch);

    // Check for duplicate batch (idempotency)
    const existingBatch = await this.findDuplicateBatch(orchestratorId, batch.batchId);

    if (existingBatch) {
      this.logger.log(
        `[trace:${traceId ?? 'n/a'}] Duplicate batch ${batch.batchId} from ${orchestratorId}`,
      );
      return {
        processedCount: 0,
        duplicateBatch: true,
        duplicateEventCount: existingBatch.duplicateEventCount ?? 0,
        traceId,
      };
    }

    // Record the batch
    const batchRecord = this.createUsageBatchRecord(orchestratorId, batch, sentAt, traceId);
    await this.usageBatchRepository.save(batchRecord);

    const maxAttempts = this.getIngestMaxAttempts();
    const baseBackoffMs = this.getIngestBackoffBaseMs();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.processUsageBatchAttempt(orchestratorId, batch, traceId);
        await this.finalizeProcessedBatch(batchRecord, result, traceId);
        return {
          processedCount: result.processedCount,
          duplicateBatch: false,
          duplicateEventCount: result.duplicateEventCount,
          traceId,
        };
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryIngestError(error) || attempt >= maxAttempts) {
          break;
        }

        const backoffMs = this.computeBackoffMs(baseBackoffMs, attempt);
        this.logger.warn(
          `[trace:${traceId ?? 'n/a'}] ingest usage batch ${batch.batchId} failed on attempt ${attempt}/${maxAttempts}; retrying in ${backoffMs}ms`,
        );
        await this.sleep(backoffMs);
      }
    }

    const finalError = lastError instanceof Error ? lastError : new Error(String(lastError));
    await this.finalizeFailedBatch(batchRecord, finalError);

    if (!(finalError instanceof BadRequestException)) {
      await this.recordIngestDeadLetter(orchestratorId, batch, traceId, maxAttempts, finalError);
    }

    throw finalError;
  }

  private async processUsageBatchAttempt(
    orchestratorId: string,
    batch: UsageBatchDto,
    traceId?: string,
  ): Promise<{ processedCount: number; duplicateEventCount: number }> {
    const deduped = await this.deduplicateRecords(orchestratorId, batch.events);
    const acceptedEvents = await this.persistUsageBatch(
      orchestratorId,
      batch,
      deduped.events,
      traceId,
    );
    const aggregated = this.aggregateUsageEvents(batch.tenantId, acceptedEvents);
    const meteringResults = await this.resolveStripeMetering(aggregated);
    await this.finalizeUsageBatch(orchestratorId, aggregated, meteringResults);

    return {
      processedCount: acceptedEvents.length,
      duplicateEventCount: deduped.duplicateEventCount,
    };
  }

  private validateUsageBatch(batch: UsageBatchDto): Date {
    if (!batch.tenantId?.trim()) {
      throw new BadRequestException('tenantId is required');
    }

    if (!batch.batchId?.trim()) {
      throw new BadRequestException('batchId is required');
    }

    if (!Array.isArray(batch.events)) {
      throw new BadRequestException('events must be an array');
    }

    const sentAt = new Date(batch.sentAt);
    if (Number.isNaN(sentAt.getTime())) {
      throw new BadRequestException('Invalid sentAt timestamp');
    }

    return sentAt;
  }

  private async findDuplicateBatch(
    orchestratorId: string,
    batchId: string,
  ): Promise<UsageBatch | null> {
    return this.usageBatchRepository.findOne({
      where: { orchestratorId, batchId },
    });
  }

  private createUsageBatchRecord(
    orchestratorId: string,
    batch: UsageBatchDto,
    sentAt: Date,
    traceId?: string,
  ): UsageBatch {
    return this.usageBatchRepository.create({
      batchId: batch.batchId,
      orchestratorId,
      tenantId: batch.tenantId,
      eventCount: batch.events.length,
      processedCount: 0,
      duplicateEventCount: 0,
      traceId,
      sentAt,
      receivedAt: new Date(),
      status: 'processing',
    });
  }

  private async finalizeProcessedBatch(
    batchRecord: UsageBatch,
    result: { processedCount: number; duplicateEventCount: number },
    traceId?: string,
  ): Promise<void> {
    batchRecord.status = 'processed';
    batchRecord.processedCount = result.processedCount;
    batchRecord.duplicateEventCount = result.duplicateEventCount;
    await this.usageBatchRepository.save(batchRecord);
    this.logger.log(
      `[trace:${traceId ?? 'n/a'}] Processed batch ${batchRecord.batchId}: ${result.processedCount} accepted, ${result.duplicateEventCount} duplicates`,
    );
  }

  private async finalizeFailedBatch(batchRecord: UsageBatch, error: Error): Promise<void> {
    batchRecord.status = 'failed';
    batchRecord.error = error.message;
    await this.usageBatchRepository.save(batchRecord);
  }

  private async deduplicateRecords(
    orchestratorId: string,
    records: UsageEventDto[],
  ): Promise<{ events: UsageEventDto[]; duplicateEventCount: number }> {
    const incomingEventIds = [...new Set(records.map((event) => event.id))];
    const existingEvents = incomingEventIds.length
      ? await this.usageIngestEventRepository.find({
          select: ['eventId'],
          where: {
            orchestratorId,
            eventId: In(incomingEventIds),
          },
        })
      : [];

    const knownEventIds = new Set(existingEvents.map((event) => event.eventId));
    const seenInBatch = new Set<string>();
    let duplicateEventCount = 0;
    const events: UsageEventDto[] = [];

    for (const event of records) {
      if (seenInBatch.has(event.id) || knownEventIds.has(event.id)) {
        duplicateEventCount++;
        continue;
      }
      seenInBatch.add(event.id);
      events.push(event);
    }

    return { events, duplicateEventCount };
  }

  private async persistUsageBatch(
    orchestratorId: string,
    batch: UsageBatchDto,
    records: UsageEventDto[],
    traceId?: string,
  ): Promise<UsageEventDto[]> {
    const acceptedEvents: UsageEventDto[] = [];

    for (const event of records) {
      this.validateUsageEvent(event);
      const occurredAt = new Date(event.occurredAt);

      try {
        const ingestEvent = this.usageIngestEventRepository.create({
          orchestratorId,
          tenantId: batch.tenantId,
          eventId: event.id,
          batchId: batch.batchId,
          metric: event.metric,
          quantity: event.quantity,
          occurredAt,
          traceId,
        });
        await this.usageIngestEventRepository.save(ingestEvent);
        acceptedEvents.push(event);
      } catch (error) {
        if (
          error instanceof QueryFailedError &&
          (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
            '23505'
        ) {
          continue;
        }
        throw error;
      }
    }

    return acceptedEvents;
  }

  private validateUsageEvent(event: UsageEventDto): void {
    if (!event.id?.trim()) {
      throw new BadRequestException('Every usage event requires a non-empty id');
    }
    if (!event.metric?.trim()) {
      throw new BadRequestException(`Usage event ${event.id} requires a non-empty metric`);
    }
    if (!Number.isFinite(event.quantity)) {
      throw new BadRequestException(`Usage event ${event.id} has an invalid quantity`);
    }

    const occurredAt = new Date(event.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException(`Usage event ${event.id} has an invalid occurredAt timestamp`);
    }

    if (event.metadata !== undefined) {
      assertNoOperationalEvidencePayload(event.metadata, `Usage event ${event.id} metadata`);
    }
  }

  private aggregateUsageEvents(
    tenantId: string,
    records: UsageEventDto[],
  ): Map<string, { metric: string; quantity: number; installationId?: string; botId?: string }> {
    const aggregated = new Map<
      string,
      { metric: string; quantity: number; installationId?: string; botId?: string }
    >();

    for (const event of records) {
      const key = `${tenantId}:${event.metric}:${event.installationId || 'none'}`;
      const existing = aggregated.get(key) || {
        metric: event.metric,
        quantity: 0,
        installationId: event.installationId,
        botId: event.botId,
      };
      existing.quantity += event.quantity;
      aggregated.set(key, existing);
    }

    return aggregated;
  }

  private async resolveStripeMetering(
    aggregated: Map<
      string,
      { metric: string; quantity: number; installationId?: string; botId?: string }
    >,
  ): Promise<
    Map<string, { stripeUsageRecordId: string; stripeSubscriptionItemId: string | null }>
  > {
    const meteringResults = new Map<
      string,
      { stripeUsageRecordId: string; stripeSubscriptionItemId: string | null }
    >();

    if (!this.paymentProvider.isConfigured()) {
      return meteringResults;
    }

    const subscriptionCache = new Map<string, TenantSubscription | null>();
    for (const [aggregateKey, data] of aggregated.entries()) {
      const [tenantId] = aggregateKey.split(':');
      if (!tenantId || data.quantity <= 0) {
        continue;
      }

      let subscription = subscriptionCache.get(tenantId);
      if (subscription === undefined) {
        subscription = await this.subscriptionRepository.findOne({
          where: { tenantId },
        });
        subscriptionCache.set(tenantId, subscription);
      }

      if (
        !subscription?.stripeSubscriptionId ||
        subscription.status === SubscriptionStatus.CANCELED ||
        subscription.status === SubscriptionStatus.SUSPENDED
      ) {
        continue;
      }

      const meterId = this.resolveMeterIdForMetric(data.metric);
      if (!meterId && !subscription.stripeSubscriptionItemId) {
        continue;
      }

      try {
        const usage = await this.paymentProvider.recordUsage({
          subscriptionId: subscription.stripeSubscriptionId,
          subscriptionItemId: subscription.stripeSubscriptionItemId,
          meterId: meterId ?? undefined,
          quantity: data.quantity,
          timestamp: new Date(),
          metadata: {
            tenantId,
            metric: data.metric,
          },
        });
        meteringResults.set(aggregateKey, {
          stripeUsageRecordId: usage.id,
          stripeSubscriptionItemId: usage.subscriptionItemId || null,
        });
      } catch (error) {
        this.logger.error(
          `Failed to record Stripe usage for tenant ${tenantId}, metric ${data.metric}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return meteringResults;
  }

  private async finalizeUsageBatch(
    orchestratorId: string,
    aggregated: Map<
      string,
      { metric: string; quantity: number; installationId?: string; botId?: string }
    >,
    meteringResults: Map<
      string,
      { stripeUsageRecordId: string; stripeSubscriptionItemId: string | null }
    >,
  ): Promise<void> {
    const period = this.getCurrentPeriod();

    for (const [key, data] of aggregated) {
      const [tenantId, metric] = key.split(':');
      const existing = await this.usageRecordRepository.findOne({
        where: {
          tenantId,
          metric,
          period,
          installationId: data.installationId || undefined,
        },
      });

      if (existing) {
        existing.quantity = Number(existing.quantity) + data.quantity;
        const metering = meteringResults.get(key);
        if (metering?.stripeUsageRecordId) {
          existing.stripeUsageRecordId = metering.stripeUsageRecordId;
        }
        if (metering?.stripeSubscriptionItemId) {
          existing.stripeSubscriptionItemId = metering.stripeSubscriptionItemId;
        }
        await this.usageRecordRepository.save(existing);
        continue;
      }

      await this.usageRecordRepository.save(
        this.usageRecordRepository.create({
          tenantId,
          orchestratorId,
          botId: data.botId,
          installationId: data.installationId,
          metric,
          quantity: data.quantity,
          period,
          stripeUsageRecordId: meteringResults.get(key)?.stripeUsageRecordId,
          stripeSubscriptionItemId: meteringResults.get(key)?.stripeSubscriptionItemId ?? undefined,
          status: 'pending',
        }),
      );
    }
  }

  private resolveMeterIdForMetric(metric: string): string | null {
    const normalized = metric
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
    const fromMetric = this.configService.get<string>(`STRIPE_METER_${normalized}`);
    if (fromMetric?.trim()) {
      return fromMetric.trim();
    }

    const fallback = this.configService.get<string>('STRIPE_DEFAULT_METER_ID');
    return fallback?.trim() ? fallback.trim() : null;
  }

  private getIngestMaxAttempts(): number {
    const configured = Number(this.configService.get<number>('USAGE_INGEST_MAX_RETRIES', 3));
    if (!Number.isFinite(configured)) {
      return 3;
    }
    return Math.max(1, Math.floor(configured));
  }

  private getIngestBackoffBaseMs(): number {
    const configured = Number(this.configService.get<number>('USAGE_INGEST_BACKOFF_MS', 150));
    if (!Number.isFinite(configured)) {
      return 150;
    }
    return Math.max(0, Math.floor(configured));
  }

  private computeBackoffMs(baseMs: number, attempt: number): number {
    const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(exponential, 2000);
  }

  private shouldRetryIngestError(error: unknown): boolean {
    if (error instanceof BadRequestException) {
      return false;
    }

    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
        '23505'
    ) {
      return false;
    }

    const message = error instanceof Error ? error.message.toLowerCase() : String(error);
    return [
      'timeout',
      'timed out',
      'deadlock',
      'connection',
      'econnreset',
      'etimedout',
      'too many clients',
      'could not serialize access',
      'rate limit',
      'temporarily unavailable',
    ].some((token) => message.includes(token));
  }

  private async recordIngestDeadLetter(
    orchestratorId: string,
    batch: UsageBatchDto,
    traceId: string | undefined,
    attempts: number,
    error: Error,
  ): Promise<void> {
    try {
      const existing = await this.usageIngestDeadLetterRepository.findOne({
        where: {
          orchestratorId,
          batchId: batch.batchId,
        },
      });

      if (existing) {
        existing.error = error.message;
        existing.attempts = attempts;
        existing.traceId = traceId;
        existing.payload = batch as unknown as Record<string, unknown>;
        existing.status = 'pending';
        await this.usageIngestDeadLetterRepository.save(existing);
        return;
      }

      const dlqRecord = this.usageIngestDeadLetterRepository.create({
        orchestratorId,
        tenantId: batch.tenantId,
        batchId: batch.batchId,
        traceId,
        attempts,
        error: error.message,
        payload: batch as unknown as Record<string, unknown>,
        status: 'pending',
      });
      await this.usageIngestDeadLetterRepository.save(dlqRecord);
    } catch (dlqError) {
      this.logger.error(
        `[trace:${traceId ?? 'n/a'}] unable to persist dead-letter for batch ${batch.batchId}: ${
          dlqError instanceof Error ? dlqError.message : String(dlqError)
        }`,
      );
    }
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get usage summary for a tenant
   */
  async getTenantUsageSummary(
    tenantId: string,
    period?: string,
  ): Promise<{
    period: string;
    metrics: Record<string, { quantity: number; amount?: number }>;
    totalAmount?: number;
  }> {
    const targetPeriod = period || this.getCurrentPeriod();

    const records = await this.usageRecordRepository.find({
      where: { tenantId, period: targetPeriod },
    });

    const metrics: Record<string, { quantity: number; amount?: number }> = {};
    let totalAmount = 0;

    for (const record of records) {
      if (!metrics[record.metric]) {
        metrics[record.metric] = { quantity: 0 };
      }
      metrics[record.metric].quantity += Number(record.quantity);

      if (record.totalAmount) {
        metrics[record.metric].amount =
          (metrics[record.metric].amount || 0) + Number(record.totalAmount);
        totalAmount += Number(record.totalAmount);
      }
    }

    return {
      period: targetPeriod,
      metrics,
      totalAmount: totalAmount > 0 ? totalAmount : undefined,
    };
  }

  /**
   * Calculate revenue share for a partner for a given period
   */
  async calculateRevenueShare(partnerId: string, period: string): Promise<RevenueShareRecord> {
    const partner = await requireEntity(this.partnerRepository, { id: partnerId }, 'Partner');

    // Get all usage records for partner's bots in this period
    // In production, would join with MarketplaceBot to get partner's bots
    const usageRecords = await this.usageRecordRepository
      .createQueryBuilder('ur')
      .where('ur.period = :period', { period })
      .andWhere('ur.installationId IS NOT NULL')
      .getMany();

    // Calculate gross revenue
    // In production, would get pricing from bot/installation config
    let grossRevenue = 0;
    const breakdown: RevenueShareRecord['breakdown'] = {
      byBot: {},
      byTenant: {},
    };

    for (const record of usageRecords) {
      const amount = Number(record.totalAmount) || 0;
      grossRevenue += amount;

      // Track by tenant
      if (record.tenantId) {
        if (!breakdown!.byTenant[record.tenantId]) {
          breakdown!.byTenant[record.tenantId] = {
            tenantId: record.tenantId,
            revenue: 0,
          };
        }
        breakdown!.byTenant[record.tenantId].revenue += amount;
      }
    }

    // Determine tier based on partner's lifetime revenue
    const tier = this.getPartnerTier(partner.lifetimeRevenue);
    const commissionRate = this.commissionRates[tier];

    // Calculate amounts
    const skuldCommission = grossRevenue * commissionRate;
    const partnerPayout = grossRevenue - skuldCommission;

    // Create revenue share record
    const revenueShare = this.revenueShareRepository.create({
      partnerId,
      partnerName: partner.name,
      period,
      grossRevenue,
      tier,
      commissionRate,
      skuldCommission,
      partnerPayout,
      currency: 'USD',
      stripeConnectAccountId: partner.stripeConnectAccountId,
      status: 'calculated',
      breakdown,
    });

    return this.revenueShareRepository.save(revenueShare);
  }

  /**
   * Get partner tier based on lifetime revenue
   */
  private getPartnerTier(lifetimeRevenue: number): RevenueShareTier {
    if (lifetimeRevenue >= 1000000) {
      return RevenueShareTier.PREMIER;
    } else if (lifetimeRevenue >= 100000) {
      return RevenueShareTier.ESTABLISHED;
    }
    return RevenueShareTier.STARTER;
  }

  /**
   * Approve a revenue share record for payout
   */
  async approveRevenueShare(recordId: string, approvedBy: string): Promise<RevenueShareRecord> {
    const record = await requireEntity(
      this.revenueShareRepository,
      { id: recordId },
      'Revenue share record',
    );

    record.status = 'approved';
    record.approvedBy = approvedBy;
    record.approvedAt = new Date();

    return this.revenueShareRepository.save(record);
  }

  /**
   * Create payout for approved revenue share records
   */
  async createPayout(partnerId: string): Promise<PartnerPayout | null> {
    const partner = await requireEntity(this.partnerRepository, { id: partnerId }, 'Partner');

    // Get all approved records not yet paid
    const approvedRecords = await this.revenueShareRepository.find({
      where: { partnerId, status: 'approved' },
    });

    if (approvedRecords.length === 0) {
      return null;
    }

    // Calculate total payout
    const totalAmount = approvedRecords.reduce(
      (sum, record) => sum + Number(record.partnerPayout),
      0,
    );

    // Create payout record
    const payout = this.partnerPayoutRepository.create({
      partnerId,
      partnerName: partner.name,
      amount: totalAmount,
      currency: 'USD',
      revenueShareRecordIds: approvedRecords.map((r) => r.id),
      stripeConnectAccountId: partner.stripeConnectAccountId,
      status: 'pending',
    });

    const savedPayout = await this.partnerPayoutRepository.save(payout);

    // Mark revenue share records as transferred
    for (const record of approvedRecords) {
      record.status = 'transferred';
      record.transferredAt = new Date();
      await this.revenueShareRepository.save(record);
    }

    // In production, would trigger actual Stripe Connect transfer here
    // await this.stripeService.createTransfer(...)

    return savedPayout;
  }

  /**
   * Get revenue share records for a partner
   */
  async getPartnerRevenueShare(
    partnerId: string,
    startPeriod?: string,
    endPeriod?: string,
  ): Promise<RevenueShareRecord[]> {
    const query = this.revenueShareRepository
      .createQueryBuilder('rs')
      .where('rs.partnerId = :partnerId', { partnerId });

    if (startPeriod && endPeriod) {
      query.andWhere('rs.period BETWEEN :start AND :end', {
        start: startPeriod,
        end: endPeriod,
      });
    }

    return query.orderBy('rs.period', 'DESC').getMany();
  }

  /**
   * Get partner payouts
   */
  async getPartnerPayouts(partnerId: string): Promise<PartnerPayout[]> {
    return this.partnerPayoutRepository.find({
      where: { partnerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get current billing period (YYYY-MM)
   */
  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Send usage to Stripe for metered billing
   * This would be called at the end of each billing period
   */
  async sendUsageToStripe(tenantId: string, period: string): Promise<void> {
    // In production, would:
    // 1. Get all pending usage records for tenant/period
    // 2. For each subscription item, report usage via Stripe API
    // 3. Mark records as 'billed'

    this.logger.log(`Would send usage to Stripe for tenant ${tenantId}, period ${period}`);
  }
}
