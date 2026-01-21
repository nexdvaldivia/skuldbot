import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsageRecord, UsageBatch } from './entities/usage-record.entity';
import {
  RevenueShareRecord,
  RevenueShareTier,
  PartnerPayout,
} from './entities/revenue-share.entity';
import { Partner } from '../marketplace/entities/partner.entity';

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
    @InjectRepository(RevenueShareRecord)
    private readonly revenueShareRepository: Repository<RevenueShareRecord>,
    @InjectRepository(PartnerPayout)
    private readonly partnerPayoutRepository: Repository<PartnerPayout>,
    @InjectRepository(Partner)
    private readonly partnerRepository: Repository<Partner>,
  ) {}

  /**
   * Ingest a usage batch from an Orchestrator
   */
  async ingestUsageBatch(
    orchestratorId: string,
    batch: UsageBatchDto,
  ): Promise<{ processedCount: number; duplicateBatch: boolean }> {
    // Check for duplicate batch (idempotency)
    const existingBatch = await this.usageBatchRepository.findOne({
      where: { orchestratorId, batchId: batch.batchId },
    });

    if (existingBatch) {
      this.logger.log(
        `Duplicate batch ${batch.batchId} from ${orchestratorId}`,
      );
      return { processedCount: 0, duplicateBatch: true };
    }

    // Record the batch
    const batchRecord = this.usageBatchRepository.create({
      batchId: batch.batchId,
      orchestratorId,
      tenantId: batch.tenantId,
      eventCount: batch.events.length,
      sentAt: new Date(batch.sentAt),
      receivedAt: new Date(),
      status: 'processing',
    });
    await this.usageBatchRepository.save(batchRecord);

    try {
      // Process events - aggregate by metric and period
      const period = this.getCurrentPeriod();
      const aggregated = new Map<
        string,
        { quantity: number; installationId?: string; botId?: string }
      >();

      for (const event of batch.events) {
        const key = `${batch.tenantId}:${event.metric}:${event.installationId || 'none'}`;
        const existing = aggregated.get(key) || {
          quantity: 0,
          installationId: event.installationId,
          botId: event.botId,
        };
        existing.quantity += event.quantity;
        aggregated.set(key, existing);
      }

      // Create or update usage records
      for (const [key, data] of aggregated) {
        const [tenantId, metric] = key.split(':');

        let record = await this.usageRecordRepository.findOne({
          where: {
            tenantId,
            metric,
            period,
            installationId: data.installationId || undefined,
          },
        });

        if (record) {
          record.quantity = Number(record.quantity) + data.quantity;
          await this.usageRecordRepository.save(record);
        } else {
          record = this.usageRecordRepository.create({
            tenantId,
            orchestratorId,
            botId: data.botId,
            installationId: data.installationId,
            metric,
            quantity: data.quantity,
            period,
            status: 'pending',
          });
          await this.usageRecordRepository.save(record);
        }
      }

      // Mark batch as processed
      batchRecord.status = 'processed';
      await this.usageBatchRepository.save(batchRecord);

      this.logger.log(
        `Processed batch ${batch.batchId}: ${batch.events.length} events`,
      );
      return { processedCount: batch.events.length, duplicateBatch: false };
    } catch (error) {
      batchRecord.status = 'failed';
      batchRecord.error = error instanceof Error ? error.message : String(error);
      await this.usageBatchRepository.save(batchRecord);
      throw error;
    }
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
  async calculateRevenueShare(
    partnerId: string,
    period: string,
  ): Promise<RevenueShareRecord> {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }

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
  async approveRevenueShare(
    recordId: string,
    approvedBy: string,
  ): Promise<RevenueShareRecord> {
    const record = await this.revenueShareRepository.findOne({
      where: { id: recordId },
    });

    if (!record) {
      throw new NotFoundException(`Revenue share record ${recordId} not found`);
    }

    record.status = 'approved';
    record.approvedBy = approvedBy;
    record.approvedAt = new Date();

    return this.revenueShareRepository.save(record);
  }

  /**
   * Create payout for approved revenue share records
   */
  async createPayout(partnerId: string): Promise<PartnerPayout | null> {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }

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

    this.logger.log(
      `Would send usage to Stripe for tenant ${tenantId}, period ${period}`,
    );
  }
}
