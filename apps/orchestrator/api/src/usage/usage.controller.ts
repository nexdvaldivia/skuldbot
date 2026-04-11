import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsageService } from './usage.service';
import type { TrackUsageDto, UsageSummary } from './usage.service';
import { UsageEvent } from './entities/usage-event.entity';

/**
 * Track Usage Request DTO
 */
interface TrackUsageRequest {
  tenantId: string;
  botId: string;
  runId?: string;
  installationId?: string;
  metric: string;
  quantity: number;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Batch Track Request DTO
 */
interface BatchTrackRequest {
  events: TrackUsageRequest[];
}

/**
 * Usage Controller
 *
 * Provides REST API endpoints for tracking and querying usage events.
 *
 * Used by:
 * - Runners: Report usage events from bot executions
 * - UI: Query usage summaries and reports
 *
 * Endpoints:
 * - POST /usage/track - Track a single usage event
 * - POST /usage/track-batch - Track multiple usage events
 * - GET /usage/summary - Get usage summary for tenant
 * - GET /usage/bot/:botId - Get usage for a specific bot
 * - GET /usage/installation/:installationId - Get usage for marketplace installation
 */
@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  /**
   * Track a single usage event
   *
   * Called by Runners when a bot emits a billing event via BillingLibrary
   */
  @Post('track')
  @HttpCode(HttpStatus.CREATED)
  async trackEvent(@Body() body: TrackUsageRequest): Promise<{ id: string }> {
    const dto: TrackUsageDto = {
      tenantId: body.tenantId,
      botId: body.botId,
      runId: body.runId,
      installationId: body.installationId,
      metric: body.metric,
      quantity: body.quantity,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      metadata: body.metadata,
    };

    const event = await this.usageService.trackEvent(dto);
    return { id: event.id };
  }

  /**
   * Track multiple usage events at once
   *
   * More efficient for Runners that batch events
   */
  @Post('track-batch')
  @HttpCode(HttpStatus.CREATED)
  async trackBatch(
    @Body() body: BatchTrackRequest,
  ): Promise<{ ids: string[]; count: number }> {
    const dtos: TrackUsageDto[] = body.events.map((e) => ({
      tenantId: e.tenantId,
      botId: e.botId,
      runId: e.runId,
      installationId: e.installationId,
      metric: e.metric,
      quantity: e.quantity,
      occurredAt: e.occurredAt ? new Date(e.occurredAt) : undefined,
      metadata: e.metadata,
    }));

    const events = await this.usageService.trackEvents(dtos);
    return {
      ids: events.map((e) => e.id),
      count: events.length,
    };
  }

  /**
   * Get usage summary for a tenant
   */
  @Get('summary')
  async getSummary(
    @Query('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<UsageSummary> {
    const startDate = new Date(start);
    const endDate = new Date(end);

    return this.usageService.getUsageSummary(tenantId, startDate, endDate);
  }

  /**
   * Get usage for a specific bot
   */
  @Get('bot/:botId')
  async getBotUsage(
    @Param('botId') botId: string,
    @Query('tenantId') tenantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<{ metric: string; total: number }[]> {
    const startDate = new Date(start);
    const endDate = new Date(end);

    return this.usageService.getBotUsage(tenantId, botId, startDate, endDate);
  }

  /**
   * Get usage for a marketplace installation
   */
  @Get('installation/:installationId')
  async getInstallationUsage(
    @Param('installationId') installationId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<{ metric: string; total: number }[]> {
    const startDate = new Date(start);
    const endDate = new Date(end);

    return this.usageService.getInstallationUsage(
      installationId,
      startDate,
      endDate,
    );
  }

  /**
   * Get pending events count
   */
  @Get('pending-count')
  async getPendingCount(
    @Query('tenantId') tenantId: string,
  ): Promise<{ count: number }> {
    const count = await this.usageService.getPendingCount(tenantId);
    return { count };
  }
}
