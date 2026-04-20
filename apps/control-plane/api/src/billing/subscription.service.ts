import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  TenantSubscription,
  PaymentHistory,
  SubscriptionStatus,
  PaymentMethodType,
} from './entities/subscription.entity';
import { DEFAULT_PRICING_PLANS, PricingPlan } from './entities/pricing-plan.entity';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.constants';
import { PaymentProvider } from '../common/interfaces/integration.interface';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';

/**
 * ACH Bank Account Setup DTO
 */
export interface SetupACHDto {
  tenantId: string;
  accountHolderName: string;
  accountHolderType: 'individual' | 'company';
  routingNumber: string;
  accountNumber: string;
  accountType: 'checking' | 'savings';
  customerEmail?: string;
  planCode?: string;
  billingInterval?: 'monthly' | 'annual';
}

/**
 * Subscription Service
 *
 * Manages tenant subscriptions with ACH Direct Debit.
 *
 * Payment Flow:
 * 1. Tenant sets up ACH bank account via Stripe
 * 2. At billing cycle, Stripe initiates ACH debit
 * 3. ACH takes 4-5 business days to clear
 * 4. If payment fails, grace period starts
 * 5. After grace period, bots are suspended
 *
 * Enforcement:
 * - botsCanRun = true: Bots execute normally
 * - botsCanRun = false: All bot executions are blocked
 * - Orchestrator checks this flag before running bots
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly defaultGracePeriodDays: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    @InjectRepository(PaymentHistory)
    private readonly paymentHistoryRepository: Repository<PaymentHistory>,
    @InjectRepository(PricingPlan)
    private readonly pricingPlanRepository: Repository<PricingPlan>,
    @InjectRepository(SecurityAuditEvent)
    private readonly securityAuditRepository: Repository<SecurityAuditEvent>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {
    this.defaultGracePeriodDays = this.resolveDefaultGraceDays();
  }

  /**
   * Create a new subscription for a tenant
   */
  async createSubscription(
    tenantId: string,
    tenantName: string,
    trialDays: number = 14,
    options?: {
      customerEmail?: string;
      planCode?: string;
      billingInterval?: 'monthly' | 'annual';
    },
  ): Promise<TenantSubscription> {
    await this.ensureDefaultPricingPlans();

    // Check if subscription already exists
    const existing = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (existing) {
      throw new BadRequestException('Subscription already exists for this tenant');
    }

    const plan = await this.resolvePricingPlan(options?.planCode ?? 'starter');
    const billingInterval = options?.billingInterval ?? 'monthly';
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const subscription = this.subscriptionRepository.create({
      tenantId,
      tenantName,
      planCode: plan.code,
      billingInterval,
      status: SubscriptionStatus.TRIALING,
      trialEnd,
      botsCanRun: true, // Bots can run during trial
      gracePeriodDays: this.defaultGracePeriodDays,
      monthlyAmount:
        billingInterval === 'annual' ? plan.baseAnnualCents / 100 : plan.baseMonthlyCents / 100,
    });

    const saved = await this.subscriptionRepository.save(subscription);
    if (options?.customerEmail?.trim()) {
      await this.ensureStripeCustomer(saved, options.customerEmail.trim());
    }
    return saved;
  }

  /**
   * Setup ACH Direct Debit for a tenant
   *
   * In production, this would:
   * 1. Create Stripe Customer if not exists
   * 2. Create Stripe PaymentMethod with bank account
   * 3. Attach PaymentMethod to Customer
   * 4. Create/Update Stripe Subscription with ACH as default
   */
  async setupACHPayment(dto: SetupACHDto): Promise<TenantSubscription> {
    await this.ensureDefaultPricingPlans();
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId: dto.tenantId },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription not found for tenant ${dto.tenantId}`);
    }

    if (dto.planCode) {
      const plan = await this.resolvePricingPlan(dto.planCode);
      subscription.planCode = plan.code;
    }
    if (dto.billingInterval) {
      subscription.billingInterval = dto.billingInterval;
    }

    if (dto.customerEmail?.trim()) {
      await this.ensureStripeCustomer(subscription, dto.customerEmail.trim());
    }

    const plan = await this.resolvePricingPlan(subscription.planCode);

    // For now, simulate the setup
    subscription.paymentMethodType = PaymentMethodType.ACH_DEBIT;
    subscription.bankAccountLast4 = dto.accountNumber.slice(-4);
    subscription.bankAccountType = dto.accountType;
    // Bank name would come from Stripe's bank account verification

    // If trial is over and ACH is set up, activate
    if (subscription.status === SubscriptionStatus.TRIALING) {
      const now = new Date();
      if (!subscription.trialEnd || subscription.trialEnd <= now) {
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
    }

    await this.syncStripeSubscriptionForPlan(subscription, plan);
    subscription.monthlyAmount =
      subscription.billingInterval === 'annual'
        ? plan.baseAnnualCents / 100
        : plan.baseMonthlyCents / 100;

    this.logger.log(`ACH payment setup for tenant ${dto.tenantId}`);
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Handle successful payment from Stripe webhook
   */
  async handlePaymentSucceeded(
    tenantId: string,
    stripePaymentIntentId: string,
    amount: number,
    invoicePeriod: string,
    requestIp?: string | null,
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      this.logger.warn(`Payment received for unknown tenant ${tenantId}`);
      await this.recordWebhookAuditEvent({
        eventType: 'invoice.payment_succeeded',
        tenantId,
        status: 'failed',
        requestIp,
        details: {
          reason: 'tenant_not_found',
          stripePaymentIntentId,
        },
      });
      return;
    }

    // Record payment
    await this.paymentHistoryRepository.save({
      tenantId,
      subscriptionId: subscription.id,
      stripePaymentIntentId,
      amount,
      currency: subscription.currency,
      paymentMethod: subscription.paymentMethodType,
      status: 'succeeded',
      clearedAt: new Date(),
      invoicePeriod,
    });

    // Reset failure tracking
    subscription.failedPaymentAttempts = 0;
    subscription.lastPaymentError = undefined;
    subscription.gracePeriodEnds = undefined;

    // Reactivate if was suspended
    if (
      subscription.status === SubscriptionStatus.PAST_DUE ||
      subscription.status === SubscriptionStatus.SUSPENDED
    ) {
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.botsCanRun = true;
      subscription.botsDisabledReason = undefined;
      subscription.botsDisabledAt = undefined;
      subscription.suspendedAt = undefined;
      subscription.suspensionReason = undefined;

      this.logger.log(`Tenant ${tenantId} reactivated after successful payment`);
    }

    // Update billing cycle
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    subscription.lastPaymentAttempt = new Date();

    await this.subscriptionRepository.save(subscription);
    await this.recordWebhookAuditEvent({
      eventType: 'invoice.payment_succeeded',
      tenantId,
      status: 'processed',
      requestIp,
      details: {
        stripePaymentIntentId,
        amount,
        invoicePeriod,
      },
    });
  }

  /**
   * Handle failed payment from Stripe webhook
   *
   * ACH failures can happen for:
   * - Insufficient funds
   * - Invalid account
   * - Account closed
   * - Unauthorized debit
   */
  async handlePaymentFailed(
    tenantId: string,
    stripePaymentIntentId: string,
    amount: number,
    errorCode: string,
    errorMessage: string,
    requestIp?: string | null,
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      this.logger.warn(`Payment failure for unknown tenant ${tenantId}`);
      await this.recordWebhookAuditEvent({
        eventType: 'invoice.payment_failed',
        tenantId,
        status: 'failed',
        requestIp,
        details: {
          reason: 'tenant_not_found',
          stripePaymentIntentId,
          errorCode,
        },
      });
      return;
    }

    // Record failed payment
    await this.paymentHistoryRepository.save({
      tenantId,
      subscriptionId: subscription.id,
      stripePaymentIntentId,
      amount,
      currency: subscription.currency,
      paymentMethod: subscription.paymentMethodType,
      status: 'failed',
      errorCode,
      errorMessage,
    });

    // Update failure tracking
    subscription.failedPaymentAttempts += 1;
    subscription.lastPaymentAttempt = new Date();
    subscription.lastPaymentError = errorMessage;

    // First failure: Start grace period
    if (subscription.status === SubscriptionStatus.ACTIVE) {
      subscription.status = SubscriptionStatus.PAST_DUE;

      // Calculate grace period end
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + subscription.gracePeriodDays);
      subscription.gracePeriodEnds = gracePeriodEnd;

      this.logger.warn(
        `Tenant ${tenantId} payment failed. Grace period until ${gracePeriodEnd.toISOString()}`,
      );
    }

    // Multiple failures or past grace period: Suspend
    if (
      subscription.failedPaymentAttempts >= 3 ||
      (subscription.gracePeriodEnds && new Date() > subscription.gracePeriodEnds)
    ) {
      await this.suspendSubscription(
        subscription,
        `Payment failed ${subscription.failedPaymentAttempts} times: ${errorMessage}`,
      );
    }

    await this.subscriptionRepository.save(subscription);
    await this.recordWebhookAuditEvent({
      eventType: 'invoice.payment_failed',
      tenantId,
      status: 'processed',
      requestIp,
      details: {
        stripePaymentIntentId,
        amount,
        errorCode,
      },
    });
  }

  /**
   * Suspend a subscription - BOTS STOP RUNNING
   */
  private async suspendSubscription(
    subscription: TenantSubscription,
    reason: string,
  ): Promise<void> {
    subscription.status = SubscriptionStatus.SUSPENDED;
    subscription.suspendedAt = new Date();
    subscription.suspensionReason = reason;

    // CRITICAL: Disable bot execution
    subscription.botsCanRun = false;
    subscription.botsDisabledReason = `Subscription suspended: ${reason}`;
    subscription.botsDisabledAt = new Date();

    this.logger.error(
      `SUBSCRIPTION SUSPENDED: Tenant ${subscription.tenantId} - ${reason}. Bots disabled.`,
    );

    // In production, would also:
    // 1. Send urgent email to tenant
    // 2. Notify Skuld operations team
    // 3. Update Stripe subscription status
  }

  /**
   * Check if tenant's bots can run
   *
   * Called by Orchestrator before executing any bot
   */
  async canBotsRun(tenantId: string): Promise<{
    canRun: boolean;
    reason?: string;
    status: SubscriptionStatus;
    gracePeriodEnds?: Date;
  }> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      return {
        canRun: false,
        reason: 'No subscription found',
        status: SubscriptionStatus.CANCELED,
      };
    }

    // Check trial expiration
    if (subscription.status === SubscriptionStatus.TRIALING) {
      if (subscription.trialEnd && new Date() > subscription.trialEnd) {
        // Trial expired without payment setup
        if (!subscription.stripePaymentMethodId) {
          return {
            canRun: false,
            reason: 'Trial expired. Please set up payment method.',
            status: subscription.status,
          };
        }
      }
    }

    return {
      canRun: subscription.botsCanRun,
      reason: subscription.botsDisabledReason,
      status: subscription.status,
      gracePeriodEnds: subscription.gracePeriodEnds,
    };
  }

  /**
   * Get subscription status for a tenant
   */
  async getSubscription(tenantId: string): Promise<TenantSubscription | null> {
    return this.subscriptionRepository.findOne({ where: { tenantId } });
  }

  async listPricingPlans(): Promise<PricingPlan[]> {
    await this.ensureDefaultPricingPlans();
    return this.pricingPlanRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  async changePlan(
    tenantId: string,
    planCode: string,
    billingInterval: 'monthly' | 'annual' = 'monthly',
  ): Promise<TenantSubscription> {
    const subscription = await this.requireSubscription(tenantId);
    const plan = await this.resolvePricingPlan(planCode);

    subscription.planCode = plan.code;
    subscription.billingInterval = billingInterval;
    subscription.monthlyAmount =
      billingInterval === 'annual' ? plan.baseAnnualCents / 100 : plan.baseMonthlyCents / 100;
    await this.syncStripeSubscriptionForPlan(subscription, plan);
    return this.subscriptionRepository.save(subscription);
  }

  async cancelSubscriptionWithGrace(
    tenantId: string,
    graceDays?: number,
  ): Promise<TenantSubscription> {
    const subscription = await this.requireSubscription(tenantId);
    const effectiveGrace = this.resolveGraceDays(graceDays ?? subscription.gracePeriodDays);
    const graceEnds = new Date();
    graceEnds.setDate(graceEnds.getDate() + effectiveGrace);

    subscription.status = SubscriptionStatus.PAST_DUE;
    subscription.gracePeriodDays = effectiveGrace;
    subscription.gracePeriodEnds = graceEnds;
    subscription.canceledAt = new Date();

    if (subscription.stripeSubscriptionId && this.paymentProvider.isConfigured()) {
      await this.paymentProvider.cancelSubscription(subscription.stripeSubscriptionId);
    }
    return this.subscriptionRepository.save(subscription);
  }

  async createBillingPortalLink(
    tenantId: string,
    returnUrl: string,
  ): Promise<{ url: string; provider: string }> {
    const subscription = await this.requireSubscription(tenantId);
    if (!subscription.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer is linked to this tenant.');
    }
    if (!this.paymentProvider.createBillingPortalSession) {
      throw new BadRequestException('Current payment provider does not support billing portal.');
    }

    const session = await this.paymentProvider.createBillingPortalSession(
      subscription.stripeCustomerId,
      returnUrl,
    );
    return { url: session.url, provider: this.paymentProvider.name };
  }

  async getActiveMeteredSubscription(tenantId: string): Promise<{
    stripeSubscriptionId: string;
    stripeSubscriptionItemId: string | null;
    planCode: string;
    billingInterval: 'monthly' | 'annual';
  } | null> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });
    if (!subscription || !subscription.stripeSubscriptionId) {
      return null;
    }
    if (
      subscription.status === SubscriptionStatus.CANCELED ||
      subscription.status === SubscriptionStatus.SUSPENDED
    ) {
      return null;
    }

    return {
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripeSubscriptionItemId: subscription.stripeSubscriptionItemId ?? null,
      planCode: subscription.planCode,
      billingInterval: subscription.billingInterval,
    };
  }

  async syncStripeSubscriptionState(
    tenantId: string,
    status: string,
    stripeSubscriptionId?: string,
    periodStart?: Date,
    periodEnd?: Date,
    requestIp?: string | null,
    eventType: string = 'customer.subscription.updated',
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });
    if (!subscription) {
      await this.recordWebhookAuditEvent({
        eventType,
        tenantId,
        status: 'failed',
        requestIp,
        details: {
          reason: 'tenant_not_found',
          stripeSubscriptionId: stripeSubscriptionId ?? null,
          providerStatus: status,
        },
      });
      return;
    }

    if (stripeSubscriptionId) {
      subscription.stripeSubscriptionId = stripeSubscriptionId;
    }
    if (periodStart) {
      subscription.currentPeriodStart = periodStart;
    }
    if (periodEnd) {
      subscription.currentPeriodEnd = periodEnd;
    }

    const normalized = status.trim().toLowerCase();
    if (normalized === 'active') {
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.botsCanRun = true;
      subscription.botsDisabledReason = undefined;
      subscription.botsDisabledAt = undefined;
      subscription.suspendedAt = undefined;
      subscription.suspensionReason = undefined;
    } else if (normalized === 'past_due' || normalized === 'unpaid') {
      subscription.status = SubscriptionStatus.PAST_DUE;
    } else if (normalized === 'canceled' || normalized === 'cancelled') {
      subscription.status = SubscriptionStatus.CANCELED;
      subscription.botsCanRun = false;
      subscription.botsDisabledReason = 'Subscription canceled in payment provider';
      subscription.botsDisabledAt = new Date();
      subscription.canceledAt = new Date();
    }

    await this.subscriptionRepository.save(subscription);
    await this.recordWebhookAuditEvent({
      eventType,
      tenantId,
      status: 'processed',
      requestIp,
      details: {
        stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
        providerStatus: status,
      },
    });
  }

  /**
   * List subscriptions across tenants
   */
  async listSubscriptions(filters?: {
    status?: SubscriptionStatus;
    search?: string;
  }): Promise<TenantSubscription[]> {
    const query = this.subscriptionRepository.createQueryBuilder('subscription');

    if (filters?.status) {
      query.andWhere('subscription.status = :status', {
        status: filters.status,
      });
    }

    if (filters?.search?.trim()) {
      query.andWhere(
        '(subscription.tenantName ILIKE :search OR subscription.tenantId ILIKE :search)',
        {
          search: `%${filters.search.trim()}%`,
        },
      );
    }

    return query.orderBy('subscription.createdAt', 'DESC').getMany();
  }

  /**
   * Get payment history for a tenant
   */
  async getPaymentHistory(tenantId: string, limit: number = 20): Promise<PaymentHistory[]> {
    return this.paymentHistoryRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Process grace period expirations (run daily via cron)
   *
   * Automatically suspends tenants whose grace period has ended
   */
  async processGracePeriodExpirations(): Promise<number> {
    const now = new Date();

    const expiredSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEnds: LessThan(now),
        botsCanRun: true, // Not yet suspended
      },
    });

    for (const subscription of expiredSubscriptions) {
      await this.suspendSubscription(
        subscription,
        'Grace period expired without successful payment',
      );
      await this.subscriptionRepository.save(subscription);
    }

    if (expiredSubscriptions.length > 0) {
      this.logger.warn(
        `Suspended ${expiredSubscriptions.length} subscriptions due to grace period expiration`,
      );
    }

    return expiredSubscriptions.length;
  }

  /**
   * Process trial expirations (run daily via cron)
   */
  async processTrialExpirations(): Promise<number> {
    const now = new Date();

    const expiredTrials = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.TRIALING,
        trialEnd: LessThan(now),
      },
    });

    let suspendedCount = 0;

    for (const subscription of expiredTrials) {
      // If no payment method set up, suspend
      if (!subscription.stripePaymentMethodId) {
        await this.suspendSubscription(subscription, 'Trial expired without payment method setup');
        suspendedCount++;
      } else {
        // Payment method exists, activate subscription
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      await this.subscriptionRepository.save(subscription);
    }

    if (suspendedCount > 0) {
      this.logger.warn(`Suspended ${suspendedCount} subscriptions due to trial expiration`);
    }

    return suspendedCount;
  }

  /**
   * Manually reactivate a suspended subscription (admin only)
   */
  async reactivateSubscription(
    tenantId: string,
    reactivatedBy: string,
  ): Promise<TenantSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription not found for tenant ${tenantId}`);
    }

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.botsCanRun = true;
    subscription.botsDisabledReason = undefined;
    subscription.botsDisabledAt = undefined;
    subscription.suspendedAt = undefined;
    subscription.suspensionReason = undefined;
    subscription.failedPaymentAttempts = 0;
    subscription.gracePeriodEnds = undefined;

    this.logger.log(`Subscription for tenant ${tenantId} manually reactivated by ${reactivatedBy}`);

    return this.subscriptionRepository.save(subscription);
  }

  private async ensureDefaultPricingPlans(): Promise<void> {
    for (const defaults of DEFAULT_PRICING_PLANS) {
      const existing = await this.pricingPlanRepository.findOne({
        where: { code: defaults.code },
      });
      if (existing) {
        continue;
      }

      const row = this.pricingPlanRepository.create({
        ...defaults,
        currency: 'USD',
        stripePriceMonthlyId: null,
        stripePriceAnnualId: null,
        stripeMeterId: null,
        isActive: true,
      });
      await this.pricingPlanRepository.save(row);
    }
  }

  private async resolvePricingPlan(planCode: string): Promise<PricingPlan> {
    const normalized = (planCode || 'starter').trim().toLowerCase();
    const plan = await this.pricingPlanRepository.findOne({
      where: { code: normalized, isActive: true },
    });
    if (!plan) {
      throw new BadRequestException(`Pricing plan "${planCode}" is not active or does not exist.`);
    }
    return plan;
  }

  private resolveStripePriceForPlan(plan: PricingPlan, interval: 'monthly' | 'annual'): string {
    const directPriceId =
      interval === 'annual' ? plan.stripePriceAnnualId : plan.stripePriceMonthlyId;

    if (directPriceId?.trim()) {
      return directPriceId.trim();
    }

    const envName =
      interval === 'annual'
        ? `STRIPE_PRICE_${plan.code.toUpperCase()}_ANNUAL`
        : `STRIPE_PRICE_${plan.code.toUpperCase()}_MONTHLY`;
    const envValue = this.configService.get<string>(envName);
    if (!envValue?.trim()) {
      throw new BadRequestException(
        `Missing Stripe price configuration for plan "${plan.code}" and interval "${interval}".`,
      );
    }
    return envValue.trim();
  }

  private async requireSubscription(tenantId: string): Promise<TenantSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription not found for tenant ${tenantId}`);
    }
    return subscription;
  }

  private resolveGraceDays(rawDays: number): number {
    if (!Number.isFinite(rawDays)) {
      return this.defaultGracePeriodDays;
    }
    return Math.min(120, Math.max(0, Math.floor(rawDays)));
  }

  private resolveDefaultGraceDays(): number {
    const raw = Number(this.configService.get<string>('SUBSCRIPTION_GRACE_PERIOD_DAYS', '14'));
    if (!Number.isFinite(raw)) {
      return 14;
    }
    return Math.min(120, Math.max(0, Math.floor(raw)));
  }

  async recordWebhookAuditEvent(input: {
    eventType: string;
    tenantId: string | null;
    status: 'processed' | 'failed' | 'ignored';
    requestIp?: string | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.securityAuditRepository.save(
        this.securityAuditRepository.create({
          category: 'billing',
          action: `stripe_webhook.${input.status}`,
          targetType: 'stripe_webhook',
          targetId: input.tenantId ?? 'unknown',
          actorUserId: null,
          actorEmail: null,
          requestIp: input.requestIp ?? null,
          details: {
            eventType: input.eventType,
            ...input.details,
          },
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Could not persist Stripe webhook audit event (${input.eventType}/${input.status}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async ensureStripeCustomer(
    subscription: TenantSubscription,
    email: string,
  ): Promise<void> {
    if (!this.paymentProvider.isConfigured() || subscription.stripeCustomerId) {
      return;
    }

    const customer = await this.paymentProvider.createCustomer({
      email,
      name: subscription.tenantName,
      metadata: {
        tenantId: subscription.tenantId,
        source: 'subscription_service',
      },
    });

    subscription.stripeCustomerId = customer.id;
  }

  private async syncStripeSubscriptionForPlan(
    subscription: TenantSubscription,
    plan: PricingPlan,
  ): Promise<void> {
    if (!this.paymentProvider.isConfigured() || !subscription.stripeCustomerId) {
      return;
    }

    const stripePriceId = this.resolveStripePriceForPlan(plan, subscription.billingInterval);

    if (!subscription.stripeSubscriptionId) {
      const created = await this.paymentProvider.createSubscription({
        customerId: subscription.stripeCustomerId,
        priceId: stripePriceId,
        metadata: {
          tenantId: subscription.tenantId,
          planCode: subscription.planCode,
          billingInterval: subscription.billingInterval,
        },
      });
      subscription.stripeSubscriptionId = created.id;
      subscription.currentPeriodStart = created.currentPeriodStart;
      subscription.currentPeriodEnd = created.currentPeriodEnd;
      subscription.status =
        created.status === 'active' ? SubscriptionStatus.ACTIVE : subscription.status;
      return;
    }

    const updated = await this.paymentProvider.updateSubscription(
      subscription.stripeSubscriptionId,
      {
        priceId: stripePriceId,
        metadata: {
          tenantId: subscription.tenantId,
          planCode: subscription.planCode,
          billingInterval: subscription.billingInterval,
        },
      },
    );
    subscription.currentPeriodStart = updated.currentPeriodStart;
    subscription.currentPeriodEnd = updated.currentPeriodEnd;
  }
}
