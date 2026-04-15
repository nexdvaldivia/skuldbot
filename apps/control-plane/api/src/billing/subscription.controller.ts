import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import type { SetupACHDto } from './subscription.service';
import { SubscriptionStatus } from './entities/subscription.entity';

/**
 * Subscription Controller
 *
 * Manages tenant subscriptions.
 *
 * Subscription Endpoints:
 * - POST /subscriptions - Create subscription for tenant
 * - GET /subscriptions/:tenantId - Get subscription status
 * - POST /subscriptions/:tenantId/setup-ach - Setup ACH payment
 * - GET /subscriptions/:tenantId/can-run - Check if bots can run
 * - GET /subscriptions/:tenantId/payments - Get payment history
 * - POST /subscriptions/:tenantId/reactivate - Admin reactivate
 */
@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Create a new subscription for a tenant
   */
  @Post()
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
   * List subscriptions (Control Plane admin)
   */
  @Get()
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
  @Get(':tenantId')
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
  @Post(':tenantId/setup-ach')
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
  @Get(':tenantId/can-run')
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
  @Get(':tenantId/payments')
  async getPaymentHistory(@Param('tenantId') tenantId: string, @Query('limit') limit?: string) {
    return this.subscriptionService.getPaymentHistory(tenantId, limit ? parseInt(limit, 10) : 20);
  }

  /**
   * Manually reactivate a suspended subscription (admin only)
   */
  @Post(':tenantId/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivateSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { reactivatedBy: string },
  ) {
    return this.subscriptionService.reactivateSubscription(tenantId, body.reactivatedBy);
  }
}
