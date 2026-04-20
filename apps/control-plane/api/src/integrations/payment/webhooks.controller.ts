import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  Logger,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StripeProvider } from './stripe.provider';
import { WebhookEvent } from '../../common/interfaces/integration.interface';

/**
 * WebhooksController - Handles incoming webhooks from payment providers.
 *
 * Stripe Webhook Events:
 * - customer.subscription.created/updated/deleted
 * - invoice.created/paid/payment_failed
 * - checkout.session.completed
 * - account.updated (Connect)
 *
 * Security:
 * - All webhooks are verified using provider-specific signatures
 * - Raw body is used for signature verification
 *
 * @see https://docs.stripe.com/webhooks
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly stripeProvider: StripeProvider) {}

  /**
   * Handle Stripe webhooks for billing events.
   */
  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    if (!signature) {
      this.logger.warn('Stripe webhook received without signature');
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing signature' });
      return;
    }

    let event: WebhookEvent;

    try {
      // Raw body is needed for signature verification
      const rawBody = req.body as Buffer;
      event = await this.stripeProvider.handleWebhook(rawBody, signature);
    } catch (error) {
      this.logger.error(`Stripe webhook signature verification failed: ${error}`);
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid signature' });
      return;
    }

    this.logger.log(`Stripe webhook received: ${event.type}`);

    try {
      await this.processStripeEvent(event);
      res.status(HttpStatus.OK).json({ received: true });
    } catch (error) {
      this.logger.error(`Failed to process Stripe webhook: ${error}`);
      // Return 200 to prevent Stripe retries for business logic errors
      // Actual failures should be handled via dead letter queue
      res.status(HttpStatus.OK).json({ received: true, error: 'Processing failed' });
    }
  }

  /**
   * Handle Stripe Connect webhooks for partner account events.
   */
  @Post('stripe/connect')
  async handleStripeConnectWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    if (!signature) {
      this.logger.warn('Stripe Connect webhook received without signature');
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing signature' });
      return;
    }

    let event: WebhookEvent;

    try {
      const rawBody = req.body as Buffer;
      event = await this.stripeProvider.handleConnectWebhook(rawBody, signature);
    } catch (error) {
      this.logger.error(`Stripe Connect webhook signature verification failed: ${error}`);
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid signature' });
      return;
    }

    this.logger.log(`Stripe Connect webhook received: ${event.type}`);

    try {
      await this.processStripeConnectEvent(event);
      res.status(HttpStatus.OK).json({ received: true });
    } catch (error) {
      this.logger.error(`Failed to process Stripe Connect webhook: ${error}`);
      res.status(HttpStatus.OK).json({ received: true, error: 'Processing failed' });
    }
  }

  /**
   * Process Stripe billing events.
   */
  private async processStripeEvent(event: WebhookEvent): Promise<void> {
    const data = event.data;

    switch (event.type) {
      // Subscription events
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(data);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(data);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(data);
        break;

      // Invoice events
      case 'invoice.created':
        await this.handleInvoiceCreated(data);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(data);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(data);
        break;

      case 'invoice.finalized':
        await this.handleInvoiceFinalized(data);
        break;

      // Checkout events
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(data);
        break;

      // Customer events
      case 'customer.created':
        await this.handleCustomerCreated(data);
        break;

      case 'customer.updated':
        await this.handleCustomerUpdated(data);
        break;

      case 'customer.deleted':
        await this.handleCustomerDeleted(data);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /**
   * Process Stripe Connect events for partner accounts.
   */
  private async processStripeConnectEvent(event: WebhookEvent): Promise<void> {
    const data = event.data;

    switch (event.type) {
      case 'account.updated':
        await this.handleConnectAccountUpdated(data);
        break;

      case 'account.application.deauthorized':
        await this.handleConnectAccountDeauthorized(data);
        break;

      case 'transfer.created':
        await this.handleTransferCreated(data);
        break;

      case 'transfer.reversed':
        await this.handleTransferReversed(data);
        break;

      case 'payout.created':
        await this.handlePayoutCreated(data);
        break;

      case 'payout.paid':
        await this.handlePayoutPaid(data);
        break;

      case 'payout.failed':
        await this.handlePayoutFailed(data);
        break;

      default:
        this.logger.debug(`Unhandled Stripe Connect event type: ${event.type}`);
    }
  }

  // ============================================================================
  // Subscription Handlers
  // ============================================================================

  private async handleSubscriptionCreated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Subscription created: ${data.id}`);
    // TODO: Create/update SubscriptionEntity
    // TODO: Activate bot installation for tenant
  }

  private async handleSubscriptionUpdated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Subscription updated: ${data.id}`);
    // TODO: Update SubscriptionEntity status, period dates, etc.
  }

  private async handleSubscriptionDeleted(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Subscription deleted: ${data.id}`);
    // TODO: Mark SubscriptionEntity as canceled
    // TODO: Deactivate bot installation
  }

  // ============================================================================
  // Invoice Handlers
  // ============================================================================

  private async handleInvoiceCreated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Invoice created: ${data.id}`);
    // TODO: Create InvoiceEntity
  }

  private async handleInvoicePaid(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Invoice paid: ${data.id}`);
    // TODO: Update InvoiceEntity status to paid
    // TODO: If partner bot, calculate and create transfer for revenue share
  }

  private async handleInvoicePaymentFailed(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Invoice payment failed: ${data.id}`);
    // TODO: Update InvoiceEntity status
    // TODO: Send notification to tenant
    // TODO: Consider subscription status update
  }

  private async handleInvoiceFinalized(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Invoice finalized: ${data.id}`);
    // TODO: Update InvoiceEntity
  }

  // ============================================================================
  // Checkout Handlers
  // ============================================================================

  private async handleCheckoutCompleted(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Checkout completed: ${data.id}`);
    // TODO: If this is a new subscription checkout, create the installation
  }

  // ============================================================================
  // Customer Handlers
  // ============================================================================

  private async handleCustomerCreated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Customer created: ${data.id}`);
    // TODO: Update tenant with Stripe customer ID if needed
  }

  private async handleCustomerUpdated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Customer updated: ${data.id}`);
  }

  private async handleCustomerDeleted(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Customer deleted: ${data.id}`);
  }

  // ============================================================================
  // Connect Account Handlers
  // ============================================================================

  private async handleConnectAccountUpdated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Connect account updated: ${data.id}`);
    // TODO: Update PartnerEntity with:
    // - chargesEnabled
    // - payoutsEnabled
    // - detailsSubmitted
  }

  private async handleConnectAccountDeauthorized(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Connect account deauthorized: ${data.id}`);
    // TODO: Mark partner as unable to receive payouts
    // TODO: Send notification to partner
  }

  // ============================================================================
  // Transfer/Payout Handlers
  // ============================================================================

  private async handleTransferCreated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Transfer created: ${data.id}`);
    // TODO: Record transfer in partner payout history
  }

  private async handleTransferReversed(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Transfer reversed: ${data.id}`);
    // TODO: Update partner payout record
  }

  private async handlePayoutCreated(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Payout created: ${data.id}`);
  }

  private async handlePayoutPaid(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Payout paid: ${data.id}`);
    // TODO: Update partner's lifetimePayouts
  }

  private async handlePayoutFailed(data: Record<string, unknown>): Promise<void> {
    this.logger.log(`Payout failed: ${data.id}`);
    // TODO: Send notification to partner
  }
}
