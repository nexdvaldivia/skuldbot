import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { License } from '../licenses/entities/license.entity';
import { LicenseAudit } from '../licenses/entities/license-audit.entity';
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
import { PricingPlan } from '../billing/entities/pricing-plan.entity';
import { MarketplaceBot, BotVersion } from '../marketplace/entities/marketplace-bot.entity';
import { Partner } from '../marketplace/entities/partner.entity';
import { MarketplaceSubscription } from '../marketplace/entities/marketplace-subscription.entity';
import { DiscoveredSchema } from '../schemas/entities/discovered-schema.entity';
import { OrchestratorInstance } from '../orchestrators/entities/orchestrator-instance.entity';
import { Lead, LeadIntakeEvent } from '../public-leads/entities/lead.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { LookupDomain } from '../lookups/entities/lookup-domain.entity';
import { LookupValue } from '../lookups/entities/lookup-value.entity';
import { BotCategoryLookup } from '../lookups/entities/bot-category-lookup.entity';
import { MarketplaceBotStatusLookup } from '../lookups/entities/marketplace-bot-status-lookup.entity';
import { PartnerStatusLookup } from '../lookups/entities/partner-status-lookup.entity';
import { RevenueShareTierLookup } from '../lookups/entities/revenue-share-tier-lookup.entity';
import { TicketStatusLookup } from '../lookups/entities/ticket-status-lookup.entity';
import { TicketPriorityLookup } from '../lookups/entities/ticket-priority-lookup.entity';
import { MarketplaceSubscriptionStatusLookup } from '../lookups/entities/marketplace-subscription-status-lookup.entity';
import { MarketplaceSubscriptionPlanLookup } from '../lookups/entities/marketplace-subscription-plan-lookup.entity';
import { LeadStatusLookup } from '../lookups/entities/lead-status-lookup.entity';
import { ClientContactTypeLookup } from '../lookups/entities/client-contact-type-lookup.entity';
import { ClientAddressTypeLookup } from '../lookups/entities/client-address-type-lookup.entity';
import { PricingModelLookup } from '../lookups/entities/pricing-model-lookup.entity';
import { RunnerHeartbeatEntity } from '../mcp/entities/runner-heartbeat.entity';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';

export const databaseEntities = [
  Client,
  Tenant,
  License,
  LicenseAudit,
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
  PricingPlan,
  DiscoveredSchema,
  OrchestratorInstance,
  Lead,
  LeadIntakeEvent,
  Ticket,
  LookupDomain,
  LookupValue,
  BotCategoryLookup,
  MarketplaceBotStatusLookup,
  PartnerStatusLookup,
  RevenueShareTierLookup,
  TicketStatusLookup,
  TicketPriorityLookup,
  MarketplaceSubscriptionStatusLookup,
  MarketplaceSubscriptionPlanLookup,
  LeadStatusLookup,
  ClientContactTypeLookup,
  ClientAddressTypeLookup,
  PricingModelLookup,
  RunnerHeartbeatEntity,
  SecurityAuditEvent,
];
