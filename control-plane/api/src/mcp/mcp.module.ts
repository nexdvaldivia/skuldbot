import { Module } from '@nestjs/common';
import { MCPController } from './mcp.controller';
import { LicensingServer } from './servers/licensing.server';
import { MarketplaceServer } from './servers/marketplace.server';
import { MeteringServer } from './servers/metering.server';
import { BillingServer } from './servers/billing.server';
import { MCPGuard } from './guards/mcp.guard';

/**
 * MCP Module for Control Plane
 * 
 * Provides centralized MCP services:
 * - Licensing (feature flags, SKUs, entitlements)
 * - Marketplace (bot catalog, subscriptions, partners)
 * - Metering (usage tracking, runner monitoring)
 * - Billing (invoices, payment methods)
 */
@Module({
  controllers: [MCPController],
  providers: [
    LicensingServer,
    MarketplaceServer,
    MeteringServer,
    BillingServer,
    MCPGuard,
  ],
  exports: [
    LicensingServer,
    MarketplaceServer,
    MeteringServer,
    BillingServer,
  ],
})
export class MCPModule {}

