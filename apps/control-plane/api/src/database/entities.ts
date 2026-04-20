import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { License } from '../licenses/entities/license.entity';
import { LicenseTypeFeature } from '../licenses/entities/license-type-feature.entity';
import { QuotaPolicy, UsageCounter } from '../licenses/entities/quota.entity';
import { LicenseRuntimeDecision } from '../licenses/entities/license-runtime-decision.entity';
import { User } from '../users/entities/user.entity';
import { CpRole } from '../rbac/entities/cp-role.entity';
import { CpPermission } from '../rbac/entities/cp-permission.entity';
import {
  UsageBatch,
  UsageIngestDeadLetter,
  UsageIngestEvent,
  UsageRecord,
} from '../billing/entities/usage-record.entity';
import { RevenueShareRecord, PartnerPayout } from '../billing/entities/revenue-share.entity';
import { TenantSubscription, PaymentHistory } from '../billing/entities/subscription.entity';
import { PaymentConfig } from '../billing/entities/payment-config.entity';
import { MarketplaceBot, BotVersion } from '../marketplace/entities/marketplace-bot.entity';
import { Partner } from '../marketplace/entities/partner.entity';
import { MarketplaceSubscription } from '../marketplace/entities/marketplace-subscription.entity';
import { DiscoveredSchema } from '../schemas/entities/discovered-schema.entity';
import { OrchestratorInstance } from '../orchestrators/entities/orchestrator-instance.entity';
import { Lead, LeadIntakeEvent } from '../public-leads/entities/lead.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { LookupDomain } from '../lookups/entities/lookup-domain.entity';
import { LookupValue } from '../lookups/entities/lookup-value.entity';
import { RunnerHeartbeatEntity } from '../mcp/entities/runner-heartbeat.entity';

export const databaseEntities = [
  Client,
  Tenant,
  License,
  LicenseTypeFeature,
  QuotaPolicy,
  UsageCounter,
  LicenseRuntimeDecision,
  User,
  CpRole,
  CpPermission,
  MarketplaceBot,
  BotVersion,
  Partner,
  MarketplaceSubscription,
  UsageRecord,
  UsageBatch,
  UsageIngestEvent,
  UsageIngestDeadLetter,
  RevenueShareRecord,
  PartnerPayout,
  TenantSubscription,
  PaymentHistory,
  PaymentConfig,
  DiscoveredSchema,
  OrchestratorInstance,
  Lead,
  LeadIntakeEvent,
  Ticket,
  LookupDomain,
  LookupValue,
  RunnerHeartbeatEntity,
];
