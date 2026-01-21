import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UsageRecord, UsageBatch } from './entities/usage-record.entity';
import {
  RevenueShareRecord,
  PartnerPayout,
} from './entities/revenue-share.entity';
import {
  TenantSubscription,
  PaymentHistory,
} from './entities/subscription.entity';
import { PaymentConfig } from './entities/payment-config.entity';
import { Partner } from '../marketplace/entities/partner.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PaymentMethodService } from './payment-method.service';
import { IntegrationsModule } from '../integrations/integrations.module';

/**
 * Billing Module
 *
 * Handles usage ingestion, billing calculations, and revenue share.
 *
 * Features:
 *
 * 1. **Usage Ingestion**
 *    - Receives usage batches from Orchestrators
 *    - Aggregates usage by tenant/metric/period
 *    - Idempotent batch processing
 *
 * 2. **Billing Integration**
 *    - Sends metered usage to Stripe
 *    - Tracks billing periods
 *    - Generates invoices
 *
 * 3. **Revenue Share**
 *    - Calculates partner revenue share by tier:
 *      - Starter (0-100k): 30% commission (70% to partner)
 *      - Established (100k-1M): 25% commission (75% to partner)
 *      - Premier (1M+): 20% commission (80% to partner)
 *    - Manages payout approval workflow
 *    - Stripe Connect integration for payouts
 *
 * 4. **Subscription Management**
 *    - ACH Direct Debit payments (Stripe pulls from customer's bank)
 *    - Credit/Debit card payments
 *    - Grace period handling (14 days industry standard)
 *    - Automatic suspension on non-payment
 *    - Bot execution control (botsCanRun flag)
 *
 * 5. **Payment Method Configuration**
 *    - ACH_ONLY: Only bank account (enterprise, high-value)
 *    - CARD_ONLY: Only credit/debit card
 *    - ACH_PREFERRED: Both allowed, ACH suggested (lower fees)
 *    - CARD_PREFERRED: Both allowed, card suggested (faster)
 *    - ANY: Customer chooses freely
 *
 * Payment Flow:
 * - Day 0: Payment fails, Stripe retries (3-5 attempts)
 * - Day 7: Warning email sent
 * - Day 14: Grace period ends, bots suspended
 * - Day 30: Account canceled if still unpaid
 *
 * Integration:
 * - IntegrationsModule for Stripe provider
 * - MarketplaceModule for partner data
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsageRecord,
      UsageBatch,
      RevenueShareRecord,
      PartnerPayout,
      TenantSubscription,
      PaymentHistory,
      PaymentConfig,
      Partner,
    ]),
    ConfigModule,
    IntegrationsModule,
  ],
  controllers: [BillingController, SubscriptionController],
  providers: [BillingService, SubscriptionService, PaymentMethodService],
  exports: [BillingService, SubscriptionService, PaymentMethodService],
})
export class BillingModule {}
