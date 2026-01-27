import { Module } from '@nestjs/common';
import { MCPController } from './mcp.controller';
import { LicensingServer } from './servers/licensing.server';
import { MarketplaceServer } from './servers/marketplace.server';
import { MeteringServer } from './servers/metering.server';
import { BillingServer } from './servers/billing.server';
import { MCPGuard } from './guards/mcp.guard';
import { MCPMetricsService } from './mcp-metrics.service';
import { MetricsController } from './metrics.controller';
import { MCPMetricsInterceptor } from './mcp-metrics.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

/**
 * MCP Module for Control Plane
 * 
 * Provides centralized MCP services:
 * - Licensing (feature flags, SKUs, entitlements)
 * - Marketplace (bot catalog, subscriptions, partners)
 * - Metering (usage tracking, runner monitoring)
 * - Billing (invoices, payment methods)
 * - Metrics (Prometheus observability)
 */
@Module({
  controllers: [MCPController, MetricsController],
  providers: [
    LicensingServer,
    MarketplaceServer,
    MeteringServer,
    BillingServer,
    MCPGuard,
    MCPMetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MCPMetricsInterceptor,
    },
  ],
  exports: [
    LicensingServer,
    MarketplaceServer,
    MeteringServer,
    BillingServer,
    MCPMetricsService,
  ],
})
export class MCPModule {}

