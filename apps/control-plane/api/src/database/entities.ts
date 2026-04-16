import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { License } from '../licenses/entities/license.entity';
import { LicenseTypeFeature } from '../licenses/entities/license-type-feature.entity';
import { QuotaPolicy, UsageCounter } from '../licenses/entities/quota.entity';
import { LicenseRuntimeDecision } from '../licenses/entities/license-runtime-decision.entity';
import { User } from '../users/entities/user.entity';
import { UserLoginHistory } from '../users/entities/user-login-history.entity';
import { UserPasswordHistory } from '../users/entities/user-password-history.entity';
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
import { Contract } from '../contracts/entities/contract.entity';
import { ContractSigner } from '../contracts/entities/contract-signer.entity';
import { ContractEvent } from '../contracts/entities/contract-event.entity';
import { ContractTemplate } from '../contracts/entities/contract-template.entity';
import { ContractTemplateVersion } from '../contracts/entities/contract-template-version.entity';
import { ContractEnvelope } from '../contracts/entities/contract-envelope.entity';
import { ContractEnvelopeRecipient } from '../contracts/entities/contract-envelope-recipient.entity';
import { ContractEnvelopeEvent } from '../contracts/entities/contract-envelope-event.entity';
import { ContractAcceptance } from '../contracts/entities/contract-acceptance.entity';
import { ContractRequirement } from '../contracts/entities/contract-requirement.entity';
import { ContractSignatory } from '../contracts/entities/contract-signatory.entity';
import { ContractLegalInfo } from '../contracts/entities/contract-legal-info.entity';

export const databaseEntities = [
  Client,
  Tenant,
  License,
  LicenseTypeFeature,
  QuotaPolicy,
  UsageCounter,
  LicenseRuntimeDecision,
  User,
  UserLoginHistory,
  UserPasswordHistory,
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
  Contract,
  ContractSigner,
  ContractEvent,
  ContractTemplate,
  ContractTemplateVersion,
  ContractEnvelope,
  ContractEnvelopeRecipient,
  ContractEnvelopeEvent,
  ContractAcceptance,
  ContractRequirement,
  ContractSignatory,
  ContractLegalInfo,
];
