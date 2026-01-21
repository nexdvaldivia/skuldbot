import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from './subscription.service';
import type { SetupACHDto } from './subscription.service';
import { SubscriptionStatus } from './entities/subscription.entity';

/**
 * Stripe Webhook Event Types we handle
 */
type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

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
    private readonly configService: ConfigService,
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
    @Body() body: { tenantId: string; tenantName: string; trialDays?: number },
  ) {
    return this.subscriptionService.createSubscription(
      body.tenantId,
      body.tenantName,
      body.trialDays,
    );
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
  async getPaymentHistory(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.subscriptionService.getPaymentHistory(
      tenantId,
      limit ? parseInt(limit, 10) : 20,
    );
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
    return this.subscriptionService.reactivateSubscription(
      tenantId,
      body.reactivatedBy,
    );
  }

  // ============================================================================
  // STRIPE WEBHOOKS
  // ============================================================================

  /**
   * Handle Stripe webhook events
   *
   * Key events for ACH payments:
   * - payment_intent.succeeded: Payment cleared
   * - payment_intent.payment_failed: Payment failed
   * - invoice.payment_succeeded: Subscription payment succeeded
   * - invoice.payment_failed: Subscription payment failed
   * - customer.subscription.updated: Subscription status changed
   * - customer.subscription.deleted: Subscription canceled
   *
   * ACH-specific events:
   * - payment_intent.processing: ACH payment initiated (takes 4-5 days)
   * - payment_intent.requires_action: Bank verification needed
   */
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      this.logger.warn('Stripe webhook secret not configured');
      throw new BadRequestException('Webhook not configured');
    }

    // In production, would verify signature using Stripe SDK:
    // const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    // For now, parse the body directly (NOT SECURE - only for development)
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing request body');
    }

    let event: StripeWebhookEvent;
    try {
      event = JSON.parse(rawBody.toString()) as StripeWebhookEvent;
    } catch {
      throw new BadRequestException('Invalid JSON');
    }

    this.logger.log(`Received Stripe webhook: ${event.type}`);

    try {
      switch (event.type) {
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        default:
          this.logger.debug(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Error processing webhook ${event.type}: ${error}`);
      // Return 200 to acknowledge receipt (Stripe will retry otherwise)
      // Log for investigation
    }

    return { received: true };
  }

  /**
   * Handle successful invoice payment (recurring subscription payment)
   */
  private async handleInvoicePaymentSucceeded(
    invoice: Record<string, unknown>,
  ): Promise<void> {
    const customerId = invoice.customer as string;
    const subscriptionId = invoice.subscription as string;
    const paymentIntentId = invoice.payment_intent as string;
    const amountPaid = (invoice.amount_paid as number) / 100; // Stripe uses cents
    const periodStart = invoice.period_start as number;

    // Get tenant ID from customer metadata
    // In production, would look up customer in our database
    const tenantId = (invoice.metadata as Record<string, string>)?.tenantId;

    if (!tenantId) {
      this.logger.warn(`No tenant ID found for customer ${customerId}`);
      return;
    }

    // Calculate invoice period
    const periodDate = new Date(periodStart * 1000);
    const invoicePeriod = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;

    await this.subscriptionService.handlePaymentSucceeded(
      tenantId,
      paymentIntentId,
      amountPaid,
      invoicePeriod,
    );

    this.logger.log(
      `Invoice payment succeeded for tenant ${tenantId}: $${amountPaid}`,
    );
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(
    invoice: Record<string, unknown>,
  ): Promise<void> {
    const customerId = invoice.customer as string;
    const paymentIntentId = invoice.payment_intent as string;
    const amountDue = (invoice.amount_due as number) / 100;

    // Get tenant ID
    const tenantId = (invoice.metadata as Record<string, string>)?.tenantId;

    if (!tenantId) {
      this.logger.warn(`No tenant ID found for customer ${customerId}`);
      return;
    }

    // Get error details from the charge
    const lastPaymentError = invoice.last_payment_error as Record<string, unknown> | undefined;
    const errorCode = (lastPaymentError?.code as string) || 'unknown';
    const errorMessage = (lastPaymentError?.message as string) || 'Payment failed';

    await this.subscriptionService.handlePaymentFailed(
      tenantId,
      paymentIntentId,
      amountDue,
      errorCode,
      errorMessage,
    );

    this.logger.warn(
      `Invoice payment failed for tenant ${tenantId}: ${errorCode} - ${errorMessage}`,
    );
  }

  /**
   * Handle successful payment intent (one-time or initial payment)
   */
  private async handlePaymentIntentSucceeded(
    paymentIntent: Record<string, unknown>,
  ): Promise<void> {
    const tenantId = (paymentIntent.metadata as Record<string, string>)?.tenantId;

    if (!tenantId) {
      return; // Not a tenant payment
    }

    const amount = (paymentIntent.amount as number) / 100;
    const invoicePeriod = (paymentIntent.metadata as Record<string, string>)?.invoicePeriod || '';

    await this.subscriptionService.handlePaymentSucceeded(
      tenantId,
      paymentIntent.id as string,
      amount,
      invoicePeriod,
    );
  }

  /**
   * Handle failed payment intent
   */
  private async handlePaymentIntentFailed(
    paymentIntent: Record<string, unknown>,
  ): Promise<void> {
    const tenantId = (paymentIntent.metadata as Record<string, string>)?.tenantId;

    if (!tenantId) {
      return;
    }

    const amount = (paymentIntent.amount as number) / 100;
    const lastError = paymentIntent.last_payment_error as Record<string, unknown> | undefined;
    const errorCode = (lastError?.code as string) || 'unknown';
    const errorMessage = (lastError?.message as string) || 'Payment failed';

    await this.subscriptionService.handlePaymentFailed(
      tenantId,
      paymentIntent.id as string,
      amount,
      errorCode,
      errorMessage,
    );
  }

  /**
   * Handle subscription status updates from Stripe
   */
  private async handleSubscriptionUpdated(
    subscription: Record<string, unknown>,
  ): Promise<void> {
    const status = subscription.status as string;
    const tenantId = (subscription.metadata as Record<string, string>)?.tenantId;

    if (!tenantId) {
      return;
    }

    this.logger.log(
      `Subscription ${subscription.id} updated to status: ${status} for tenant ${tenantId}`,
    );

    // Stripe subscription statuses: active, past_due, unpaid, canceled, incomplete, trialing
    // Our system handles these via payment success/failure webhooks
  }

  /**
   * Handle subscription deletion/cancellation
   */
  private async handleSubscriptionDeleted(
    subscription: Record<string, unknown>,
  ): Promise<void> {
    const tenantId = (subscription.metadata as Record<string, string>)?.tenantId;

    if (!tenantId) {
      return;
    }

    this.logger.warn(`Subscription canceled for tenant ${tenantId}`);

    // In production, would update our subscription status to CANCELED
    // and disable bot execution
  }
}
