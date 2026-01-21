import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import type { UsageBatchDto } from './billing.service';

/**
 * Billing Controller
 *
 * Provides REST API endpoints for usage ingestion and billing management.
 *
 * Usage Ingestion (from Orchestrators):
 * - POST /usage/ingest - Receive usage batch from Orchestrator
 *
 * Tenant Usage:
 * - GET /usage/tenant/:tenantId - Get usage summary for tenant
 *
 * Revenue Share (for Partners):
 * - GET /revenue-share/partner/:partnerId - Get partner revenue share
 * - POST /revenue-share/:id/approve - Approve revenue share for payout
 * - POST /payouts/partner/:partnerId - Create payout for partner
 * - GET /payouts/partner/:partnerId - Get partner payouts
 */
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ============================================================================
  // USAGE INGESTION (from Orchestrators)
  // ============================================================================

  /**
   * Ingest usage batch from an Orchestrator
   *
   * Called by Orchestrator's UsageBatchProcessor to send usage events.
   * Uses license key and API key for authentication.
   */
  @Post('usage/ingest')
  @HttpCode(HttpStatus.OK)
  async ingestUsage(
    @Headers('x-license-key') licenseKey: string,
    @Headers('x-api-key') apiKey: string,
    @Headers('x-orchestrator-id') orchestratorId: string,
    @Headers('x-batch-id') batchId: string,
    @Body() batch: UsageBatchDto,
  ): Promise<{ processedCount: number; batchId: string }> {
    // Validate authentication
    // In production, would validate license key and API key
    if (!licenseKey && !apiKey) {
      throw new UnauthorizedException('Missing authentication credentials');
    }

    if (!orchestratorId) {
      throw new UnauthorizedException('Missing orchestrator ID');
    }

    try {
      const result = await this.billingService.ingestUsageBatch(
        orchestratorId,
        batch,
      );

      if (result.duplicateBatch) {
        throw new ConflictException('Batch already processed');
      }

      return {
        processedCount: result.processedCount,
        batchId: batch.batchId,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw error;
    }
  }

  // ============================================================================
  // TENANT USAGE
  // ============================================================================

  /**
   * Get usage summary for a tenant
   */
  @Get('usage/tenant/:tenantId')
  async getTenantUsage(
    @Param('tenantId') tenantId: string,
    @Query('period') period?: string,
  ): Promise<{
    period: string;
    metrics: Record<string, { quantity: number; amount?: number }>;
    totalAmount?: number;
  }> {
    return this.billingService.getTenantUsageSummary(tenantId, period);
  }

  // ============================================================================
  // REVENUE SHARE
  // ============================================================================

  /**
   * Get revenue share records for a partner
   */
  @Get('revenue-share/partner/:partnerId')
  async getPartnerRevenueShare(
    @Param('partnerId') partnerId: string,
    @Query('startPeriod') startPeriod?: string,
    @Query('endPeriod') endPeriod?: string,
  ) {
    return this.billingService.getPartnerRevenueShare(
      partnerId,
      startPeriod,
      endPeriod,
    );
  }

  /**
   * Calculate revenue share for a partner (admin only)
   */
  @Post('revenue-share/calculate')
  @HttpCode(HttpStatus.CREATED)
  async calculateRevenueShare(
    @Body() body: { partnerId: string; period: string },
  ) {
    return this.billingService.calculateRevenueShare(body.partnerId, body.period);
  }

  /**
   * Approve revenue share for payout (admin only)
   */
  @Post('revenue-share/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveRevenueShare(
    @Param('id') id: string,
    @Body() body: { approvedBy: string },
  ) {
    return this.billingService.approveRevenueShare(id, body.approvedBy);
  }

  // ============================================================================
  // PAYOUTS
  // ============================================================================

  /**
   * Create payout for a partner (admin only)
   */
  @Post('payouts/partner/:partnerId')
  @HttpCode(HttpStatus.CREATED)
  async createPayout(@Param('partnerId') partnerId: string) {
    const payout = await this.billingService.createPayout(partnerId);
    if (!payout) {
      return { message: 'No approved revenue shares to pay out' };
    }
    return payout;
  }

  /**
   * Get payouts for a partner
   */
  @Get('payouts/partner/:partnerId')
  async getPartnerPayouts(@Param('partnerId') partnerId: string) {
    return this.billingService.getPartnerPayouts(partnerId);
  }
}
