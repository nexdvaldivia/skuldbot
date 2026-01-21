import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentModule } from './payment/payment.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';
import { GraphModule } from './graph/graph.module';

import { ProviderRegistry } from './provider-registry.service';
import { ProviderConfig } from './entities/provider-config.entity';

import { StripeProvider } from './payment/stripe.provider';

/**
 * IntegrationsModule - Central module for all external service integrations.
 *
 * Architecture (BYO - Bring Your Own):
 * Each integration type (payment, storage, email, etc.) is abstracted via
 * provider interfaces, allowing tenants to configure their own services.
 *
 * Components:
 * - ProviderRegistry: Central registry for all providers
 * - ProviderConfig: Database entity for storing provider configurations
 * - Provider Modules: PaymentModule, StorageModule, EmailModule, GraphModule
 *
 * Provider Types:
 * - Payment: Stripe (primary), PayPal (future)
 * - Storage: S3, Azure Blob, MinIO
 * - Email: SendGrid, AWS SES, SMTP
 * - Graph: Microsoft 365
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProviderConfig]),
    PaymentModule,
    StorageModule,
    EmailModule,
    GraphModule,
  ],
  providers: [ProviderRegistry],
  exports: [
    ProviderRegistry,
    TypeOrmModule,
    PaymentModule,
    StorageModule,
    EmailModule,
    GraphModule,
  ],
})
export class IntegrationsModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly stripeProvider: StripeProvider,
  ) {}

  /**
   * Register all providers on module initialization.
   */
  onModuleInit() {
    // Register payment providers
    this.providerRegistry.register(this.stripeProvider, true);

    // Future: Register other providers
    // this.providerRegistry.register(this.paypalProvider);
    // this.providerRegistry.register(this.sendgridProvider);
    // this.providerRegistry.register(this.s3Provider);
  }
}
