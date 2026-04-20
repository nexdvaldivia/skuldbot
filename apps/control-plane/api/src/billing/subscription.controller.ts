import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionService } from './subscription.service';
import type { SetupACHDto } from './subscription.service';
import { SubscriptionStatus } from './entities/subscription.entity';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.module';
import { PaymentProvider, WebhookEvent } from '../common/interfaces/integration.interface';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { UserRole } from '../users/entities/user.entity';

/**
 * Subscription Controller
 *
 * Manages tenant subscriptions and handles Stripe webhooks.
 */
@Controller()
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.BILLING_WRITE)
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.BILLING_READ)
  async listPricingPlans() {
    return this.subscriptionService.listPricingPlans();
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.BILLING_READ)
  async listSubscriptions(
    @Query('status') status?: SubscriptionStatus,
    @Query('search') search?: string,
  ) {
    return this.subscriptionService.listSubscriptions({
      status,
      search,
    });
  }

  @Get('subscriptions/:tenantId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.BILLING_READ)
  async getSubscription(@Param('tenantId') tenantId: string) {
    const subscription = await this.subscriptionService.getSubscription(tenantId);
    if (!subscription) {
      return { exists: false };
    }
    return subscription;
  }

  @Post('subscriptions/:tenantId/setup-ach')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.BILLING_WRITE)
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

  @Get('subscriptions/:tenantId/can-run')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.BILLING_READ)
  async canBotsRun(@Param('tenantId') tenantId: string): Promise<{
    canRun: boolean;
    reason?: string;
    status: SubscriptionStatus;
    gracePeriodEnds?: Date;
  }> {
    return this.subscriptionService.canBotsRun(tenantId);
  }

  @Get('subscriptions/:tenantId/payments')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.BILLING_READ)
  async getPaymentHistory(@Param('tenantId') tenantId: string, @Query('limit') limit?: string) {
    return this.subscriptionService.getPaymentHistory(tenantId, limit ? parseInt(limit, 10) : 20);
  }

  @Patch('subscriptions/:tenantId/plan')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.BILLING_WRITE)
  async changePlan(
    @Param('tenantId') tenantId: string,
    @Body() body: { planCode: string; billingInterval?: 'monthly' | 'annual' },
  ) {
    return this.subscriptionService.changePlan(tenantId, body.planCode, body.billingInterval);
  }

  @Post('subscriptions/:tenantId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.BILLING_WRITE)
  async cancelSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { graceDays?: number },
  ) {
    return this.subscriptionService.cancelSubscriptionWithGrace(tenantId, body.graceDays);
  }

  @Post('subscriptions/:tenantId/billing-portal')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT)
  @RequirePermissions(CP_PERMISSIONS.BILLING_WRITE)
  async createBillingPortal(
    @Param('tenantId') tenantId: string,
    @Body() body: { returnUrl: string },
  ) {
    return this.subscriptionService.createBillingPortalLink(tenantId, body.returnUrl);
  }

  @Post('subscriptions/:tenantId/reactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SKULD_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.BILLING_APPROVE)
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
    const requestIp = this.resolveRequestIp(req);

    if (!signature?.trim()) {
      await this.subscriptionService.recordWebhookAuditEvent({
        eventType: 'stripe.signature',
        tenantId: null,
        status: 'failed',
        requestIp,
        details: { reason: 'missing_signature' },
      });
      throw new BadRequestException('Missing stripe signature.');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      await this.subscriptionService.recordWebhookAuditEvent({
        eventType: 'stripe.payload',
        tenantId: null,
        status: 'failed',
        requestIp,
        details: { reason: 'missing_payload' },
      });
      throw new BadRequestException('Missing webhook payload.');
    }

    let event: WebhookEvent;
    try {
      event = await this.paymentProvider.handleWebhook(rawBody, signature);
    } catch (error) {
      this.logger.warn(`Stripe webhook signature verification failed: ${String(error)}`);
      await this.subscriptionService.recordWebhookAuditEvent({
        eventType: 'stripe.signature',
        tenantId: null,
        status: 'failed',
        requestIp,
        details: { reason: 'invalid_signature' },
      });
      throw new BadRequestException('Invalid webhook signature.');
    }

    await this.routeWebhookEvent(event, requestIp);
    return { received: true };
  }

  private async routeWebhookEvent(event: WebhookEvent, requestIp: string | null): Promise<void> {
    const payload = event.data;
    switch (event.type) {
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
        await this.handleInvoicePaid(payload, requestIp, event.type);
        return;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(payload, requestIp, event.type);
        return;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.created':
        await this.handleSubscriptionState(payload, requestIp, event.type);
        return;
      default:
        this.logger.debug(`Ignoring unsupported Stripe webhook event type: ${event.type}`);
        await this.subscriptionService.recordWebhookAuditEvent({
          eventType: event.type,
          tenantId: this.readTenantId(payload),
          status: 'ignored',
          requestIp,
          details: { reason: 'unsupported_event' },
        });
    }
  }

  private async handleInvoicePaid(
    invoice: Record<string, unknown>,
    requestIp: string | null,
    eventType: string,
  ): Promise<void> {
    const tenantId = this.readTenantId(invoice);
    if (!tenantId) {
      this.logger.warn('Stripe invoice paid event without tenantId metadata.', {
        invoiceId: invoice.id,
      });
      await this.subscriptionService.recordWebhookAuditEvent({
        eventType,
        tenantId: null,
        status: 'failed',
        requestIp,
        details: {
          reason: 'missing_tenant_metadata',
          invoiceId: String(invoice.id ?? ''),
        },
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
      requestIp,
    );
  }

  private async handleInvoicePaymentFailed(
    invoice: Record<string, unknown>,
    requestIp: string | null,
    eventType: string,
  ): Promise<void> {
    const tenantId = this.readTenantId(invoice);
    if (!tenantId) {
      this.logger.warn('Stripe invoice payment_failed event without tenantId metadata.', {
        invoiceId: invoice.id,
      });
      await this.subscriptionService.recordWebhookAuditEvent({
        eventType,
        tenantId: null,
        status: 'failed',
        requestIp,
        details: {
          reason: 'missing_tenant_metadata',
          invoiceId: String(invoice.id ?? ''),
        },
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
      requestIp,
    );
  }

  private async handleSubscriptionState(
    subscription: Record<string, unknown>,
    requestIp: string | null,
    eventType: string,
  ): Promise<void> {
    const tenantId = this.readTenantId(subscription);
    if (!tenantId) {
      this.logger.warn('Stripe subscription state event without tenantId metadata.', {
        subscriptionId: subscription.id,
      });
      await this.subscriptionService.recordWebhookAuditEvent({
        eventType,
        tenantId: null,
        status: 'failed',
        requestIp,
        details: {
          reason: 'missing_tenant_metadata',
          subscriptionId: String(subscription.id ?? ''),
        },
      });
      return;
    }

    await this.subscriptionService.syncStripeSubscriptionState(
      tenantId,
      String(subscription.status ?? ''),
      String(subscription.id ?? ''),
      this.readEpochAsDate(subscription.current_period_start),
      this.readEpochAsDate(subscription.current_period_end),
      requestIp,
      eventType,
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

  private resolveRequestIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || null;
    }
    return request.ip || null;
  }
}
