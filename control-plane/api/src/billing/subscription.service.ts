import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  TenantSubscription,
  PaymentHistory,
  SubscriptionStatus,
  PaymentMethodType,
} from './entities/subscription.entity';

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

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    @InjectRepository(PaymentHistory)
    private readonly paymentHistoryRepository: Repository<PaymentHistory>,
  ) {}

  /**
   * Create a new subscription for a tenant
   */
  async createSubscription(
    tenantId: string,
    tenantName: string,
    trialDays: number = 14,
  ): Promise<TenantSubscription> {
    // Check if subscription already exists
    const existing = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (existing) {
      throw new BadRequestException('Subscription already exists for this tenant');
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const subscription = this.subscriptionRepository.create({
      tenantId,
      tenantName,
      status: SubscriptionStatus.TRIALING,
      trialEnd,
      botsCanRun: true, // Bots can run during trial
      gracePeriodDays: 14, // Industry standard: 14 days grace period
    });

    return this.subscriptionRepository.save(subscription);
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
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId: dto.tenantId },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription not found for tenant ${dto.tenantId}`);
    }

    // In production, would call Stripe API here:
    // 1. stripe.customers.create() or retrieve
    // 2. stripe.paymentMethods.create({ type: 'us_bank_account', ... })
    // 3. stripe.paymentMethods.attach()
    // 4. stripe.subscriptions.create({ default_payment_method: ... })

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
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      this.logger.warn(`Payment received for unknown tenant ${tenantId}`);
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
    if (subscription.status === SubscriptionStatus.PAST_DUE ||
        subscription.status === SubscriptionStatus.SUSPENDED) {
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
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      this.logger.warn(`Payment failure for unknown tenant ${tenantId}`);
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
    if (subscription.failedPaymentAttempts >= 3 ||
        (subscription.gracePeriodEnds && new Date() > subscription.gracePeriodEnds)) {
      await this.suspendSubscription(
        subscription,
        `Payment failed ${subscription.failedPaymentAttempts} times: ${errorMessage}`,
      );
    }

    await this.subscriptionRepository.save(subscription);
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

  /**
   * Get payment history for a tenant
   */
  async getPaymentHistory(
    tenantId: string,
    limit: number = 20,
  ): Promise<PaymentHistory[]> {
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
        await this.suspendSubscription(
          subscription,
          'Trial expired without payment method setup',
        );
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
      this.logger.warn(
        `Suspended ${suspendedCount} subscriptions due to trial expiration`,
      );
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

    this.logger.log(
      `Subscription for tenant ${tenantId} manually reactivated by ${reactivatedBy}`,
    );

    return this.subscriptionRepository.save(subscription);
  }
}
