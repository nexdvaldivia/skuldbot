import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Logger,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionService } from './subscription.service';
import type { SetupACHDto } from './subscription.service';
import { SubscriptionStatus } from './entities/subscription.entity';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.module';
import { PaymentProvider, WebhookEvent } from '../common/interfaces/integration.interface';

/**
 * Subscription Controller
 *
 * Manages tenant subscriptions and handles Stripe webhooks.
 *
 * Subscription Endpoints:
 * - POST /subscriptions - Create subscription for tenant
 * - GET /subscriptions/:tenantId - Get subscription status
 * - POST /subscriptions/:tenantId/setup-ach - Setup ACH payment
 * - GET /subscriptions/:tenantId/can-run - Check if bots can run
 * - GET /subscriptions/:tenantId/payments - Get payment history
 * - POST /subscriptions/:tenantId/reactivate - Admin reactivate
 *
 * Webhook Endpoints:
 * - POST /webhooks/stripe - Receive Stripe events
 */
@Controller()
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Create a new subscription for a tenant
   */
  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  async createSubscription(
    @Body()
    body: {
      tenantId: string;
      tenantName: string;
      trialDays?: number;
      customerEmail?: string;
      planCode?: string;
      billingInterval?: 'monthly' | 'annual';
    },
  ) {
    return this.subscriptionService.createSubscription(
      body.tenantId,
      body.tenantName,
      body.trialDays,
      {
        customerEmail: body.customerEmail,
        planCode: body.planCode,
        billingInterval: body.billingInterval,
      },
    );
  }

  @Get('subscriptions/plans')
  async listPricingPlans() {
    return this.subscriptionService.listPricingPlans();
  }

  /**
   * List subscriptions (Control Plane admin)
   */
  @Get('subscriptions')
  async listSubscriptions(
    @Query('status') status?: SubscriptionStatus,
    @Query('search') search?: string,
  ) {
    return this.subscriptionService.listSubscriptions({
      status,
      search,
    });
  }

  /**
   * Get subscription status for a tenant
   */
  @Get('subscriptions/:tenantId')
  async getSubscription(@Param('tenantId') tenantId: string) {
    const subscription = await this.subscriptionService.getSubscription(tenantId);
    if (!subscription) {
      return { exists: false };
    }
    return subscription;
  }

  /**
   * Setup ACH Direct Debit payment method
   */
  @Post('subscriptions/:tenantId/setup-ach')
  @HttpCode(HttpStatus.OK)
  async setupACH(
    @Param('tenantId') tenantId: string,
    @Body()
    body: {
      accountHolderName: string;
      accountHolderType: 'individual' | 'company';
      routingNumber: string;
      accountNumber: string;
      accountType: 'checking' | 'savings';
      customerEmail?: string;
      planCode?: string;
      billingInterval?: 'monthly' | 'annual';
    },
  ) {
    const dto: SetupACHDto = {
      tenantId,
      ...body,
    };
    return this.subscriptionService.setupACHPayment(dto);
  }

  /**
   * Check if tenant's bots can run
   *
   * Called by Orchestrator before executing bots
   */
  @Get('subscriptions/:tenantId/can-run')
  async canBotsRun(@Param('tenantId') tenantId: string): Promise<{
    canRun: boolean;
    reason?: string;
    status: SubscriptionStatus;
    gracePeriodEnds?: Date;
  }> {
    return this.subscriptionService.canBotsRun(tenantId);
  }

  /**
   * Get payment history for a tenant
   */
  @Get('subscriptions/:tenantId/payments')
  async getPaymentHistory(@Param('tenantId') tenantId: string, @Query('limit') limit?: string) {
    return this.subscriptionService.getPaymentHistory(tenantId, limit ? parseInt(limit, 10) : 20);
  }

  @Patch('subscriptions/:tenantId/plan')
  @HttpCode(HttpStatus.OK)
  async changePlan(
    @Param('tenantId') tenantId: string,
    @Body() body: { planCode: string; billingInterval?: 'monthly' | 'annual' },
  ) {
    return this.subscriptionService.changePlan(tenantId, body.planCode, body.billingInterval);
  }

  @Post('subscriptions/:tenantId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { graceDays?: number },
  ) {
    return this.subscriptionService.cancelSubscriptionWithGrace(tenantId, body.graceDays);
  }

  @Post('subscriptions/:tenantId/billing-portal')
  @HttpCode(HttpStatus.OK)
  async createBillingPortal(
    @Param('tenantId') tenantId: string,
    @Body() body: { returnUrl: string },
  ) {
    return this.subscriptionService.createBillingPortalLink(tenantId, body.returnUrl);
  }

  /**
   * Manually reactivate a suspended subscription (admin only)
   */
  @Post('subscriptions/:tenantId/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivateSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { reactivatedBy: string },
  ) {
    return this.subscriptionService.reactivateSubscription(tenantId, body.reactivatedBy);
  }

  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    if (!signature?.trim()) {
      throw new BadRequestException('Missing stripe signature.');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing webhook payload.');
    }

    let event: WebhookEvent;
    try {
      event = await this.paymentProvider.handleWebhook(rawBody, signature);
    } catch (error) {
      this.logger.warn(`Stripe webhook signature verification failed: ${String(error)}`);
      throw new BadRequestException('Invalid webhook signature.');
    }

    await this.routeWebhookEvent(event);
    return { received: true };
  }

  private async routeWebhookEvent(event: WebhookEvent): Promise<void> {
    const payload = event.data;
    switch (event.type) {
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
        await this.handleInvoicePaid(payload);
        return;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(payload);
        return;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.created':
        await this.handleSubscriptionState(payload);
        return;
      default:
        this.logger.debug(`Ignoring unsupported Stripe webhook event type: ${event.type}`);
    }
  }

  private async handleInvoicePaid(invoice: Record<string, unknown>): Promise<void> {
    const tenantId = this.readTenantId(invoice);
    if (!tenantId) {
      this.logger.warn('Stripe invoice paid event without tenantId metadata.', {
        invoiceId: invoice.id,
      });
      return;
    }

    const paymentIntentId = String(invoice.payment_intent ?? invoice.id ?? '');
    const amountPaid = this.readCents(invoice.amount_paid);
    const invoicePeriod = this.resolveInvoicePeriod(invoice.period_start);
    await this.subscriptionService.handlePaymentSucceeded(
      tenantId,
      paymentIntentId,
      amountPaid,
      invoicePeriod,
    );
  }

  private async handleInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
    const tenantId = this.readTenantId(invoice);
    if (!tenantId) {
      this.logger.warn('Stripe invoice payment_failed event without tenantId metadata.', {
        invoiceId: invoice.id,
      });
      return;
    }

    const paymentIntentId = String(invoice.payment_intent ?? invoice.id ?? '');
    const amountDue = this.readCents(invoice.amount_due);
    const lastPaymentError =
      (invoice.last_payment_error as Record<string, unknown> | undefined) ?? undefined;
    const errorCode = String(lastPaymentError?.code ?? 'payment_failed');
    const errorMessage = String(lastPaymentError?.message ?? 'Payment failed');
    await this.subscriptionService.handlePaymentFailed(
      tenantId,
      paymentIntentId,
      amountDue,
      errorCode,
      errorMessage,
    );
  }

  private async handleSubscriptionState(subscription: Record<string, unknown>): Promise<void> {
    const tenantId = this.readTenantId(subscription);
    if (!tenantId) {
      this.logger.warn('Stripe subscription state event without tenantId metadata.', {
        subscriptionId: subscription.id,
      });
      return;
    }

    await this.subscriptionService.syncStripeSubscriptionState(
      tenantId,
      String(subscription.status ?? ''),
      String(subscription.id ?? ''),
      this.readEpochAsDate(subscription.current_period_start),
      this.readEpochAsDate(subscription.current_period_end),
    );
  }

  private readTenantId(payload: Record<string, unknown>): string | null {
    const metadata = (payload.metadata as Record<string, unknown> | undefined) ?? undefined;
    const raw = metadata?.tenantId;
    if (typeof raw !== 'string' || !raw.trim()) {
      return null;
    }
    return raw.trim();
  }

  private readCents(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return 0;
    }
    return raw / 100;
  }

  private resolveInvoicePeriod(rawStart: unknown): string {
    if (typeof rawStart === 'number' && Number.isFinite(rawStart)) {
      const date = new Date(rawStart * 1000);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private readEpochAsDate(raw: unknown): Date | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return undefined;
    }
    return new Date(raw * 1000);
  }
}
