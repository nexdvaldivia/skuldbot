import { Module, Global, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as bodyParser from 'body-parser';

import { StripeProvider } from './stripe.provider';
import { WebhooksController } from './webhooks.controller';
import { SubscriptionEntity } from './entities/subscription.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { UsageRecordEntity } from './entities/usage-record.entity';
import { PartnerEntity } from './entities/partner.entity';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

/**
 * PaymentModule - Handles all payment and billing operations.
 *
 * Features:
 * - Stripe integration (subscriptions, metered billing, invoicing)
 * - Stripe Connect (partner revenue share)
 * - Webhook handling for real-time updates
 *
 * Entities:
 * - SubscriptionEntity: Tracks tenant subscriptions to marketplace bots
 * - InvoiceEntity: Synced invoices from Stripe
 * - UsageRecordEntity: Usage events for metered billing
 * - PartnerEntity: Marketplace bot publishers with Stripe Connect
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      SubscriptionEntity,
      InvoiceEntity,
      UsageRecordEntity,
      PartnerEntity,
    ]),
  ],
  controllers: [WebhooksController],
  providers: [
    StripeProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: StripeProvider,
    },
  ],
  exports: [
    PAYMENT_PROVIDER,
    StripeProvider,
    TypeOrmModule,
  ],
})
export class PaymentModule implements NestModule {
  /**
   * Configure raw body parsing for webhook endpoints.
   * Stripe requires raw body for signature verification.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(bodyParser.raw({ type: 'application/json' }))
      .forRoutes(
        { path: 'webhooks/stripe', method: RequestMethod.POST },
        { path: 'webhooks/stripe/connect', method: RequestMethod.POST },
      );
  }
}
