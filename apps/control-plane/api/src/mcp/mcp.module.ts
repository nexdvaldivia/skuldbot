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
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { PaymentModule } from '../integrations/payment/payment.module';
import { LicensesModule } from '../licenses/licenses.module';
import { UsersModule } from '../users/users.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { LookupsModule } from '../lookups/lookups.module';
import { UsageRecord } from '../billing/entities/usage-record.entity';
import { RunnerHeartbeatEntity } from './entities/runner-heartbeat.entity';

/**
 * MCP Module for Control Plane
 * 
 * Provides centralized MCP services:
 * - Licensing (feature flags, SKUs, entitlements)
 * - Marketplace (bot catalog, subscriptions, partners)
 * - Metering (usage tracking, runner monitoring)
 * - Billing (invoices, payment methods, Stripe integration)
 * - Metrics (Prometheus observability)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UsageRecord, RunnerHeartbeatEntity]),
    BillingModule,
    PaymentModule,
    LicensesModule,
    UsersModule,
    TenantsModule,
    MarketplaceModule,
    LookupsModule,
  ],
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
