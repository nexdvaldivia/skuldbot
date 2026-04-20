import {
  Module,
  Global,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as bodyParser from 'body-parser';
import { ProviderRegistry } from '../provider-registry.service';
import { ProviderRuntimeModule } from '../provider-runtime.module';

import { StripeProvider } from './stripe.provider';
import { WebhooksController } from './webhooks.controller';
import { SubscriptionEntity } from './entities/subscription.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { UsageRecordEntity } from './entities/usage-record.entity';
import { PartnerEntity } from './entities/partner.entity';

import { PAYMENT_PROVIDER } from './payment.constants';
export { PAYMENT_PROVIDER }; // Re-export for backwards compatibility

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
    ProviderRuntimeModule,
    TypeOrmModule.forFeature([SubscriptionEntity, InvoiceEntity, UsageRecordEntity, PartnerEntity]),
  ],
  controllers: [WebhooksController],
  providers: [
    StripeProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: StripeProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER, TypeOrmModule],
})
export class PaymentModule implements NestModule, OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly stripeProvider: StripeProvider,
  ) {}

  onModuleInit() {
    this.providerRegistry.register(this.stripeProvider, true);
  }

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
        { path: 'integrations/webhooks/stripe', method: RequestMethod.POST },
        { path: 'integrations/webhooks/stripe/connect', method: RequestMethod.POST },
      );
  }
}
