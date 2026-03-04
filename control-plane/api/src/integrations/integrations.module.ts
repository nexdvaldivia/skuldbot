import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentModule } from './payment/payment.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';
import { GraphModule } from './graph/graph.module';

import { ProviderRegistry } from './provider-registry.service';
import { ProviderConfig } from './entities/provider-config.entity';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';

import { StripeProvider } from './payment/stripe.provider';
import { SendGridProvider } from './email/sendgrid.provider';
import { SmtpProvider } from './email/smtp.provider';
import { S3Provider } from './storage/s3.provider';
import { MicrosoftGraphProvider } from './graph/graph.provider';

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
  controllers: [IntegrationsController],
  providers: [ProviderRegistry, IntegrationsService],
  exports: [
    ProviderRegistry,
    IntegrationsService,
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
    private readonly sendGridProvider: SendGridProvider,
    private readonly smtpProvider: SmtpProvider,
    private readonly s3Provider: S3Provider,
    private readonly microsoftGraphProvider: MicrosoftGraphProvider,
  ) {}

  /**
   * Register all providers on module initialization.
   */
  onModuleInit() {
    // Register payment providers
    this.providerRegistry.register(this.stripeProvider, true);

    // Register email providers
    this.providerRegistry.register(this.sendGridProvider, true);
    this.providerRegistry.register(this.smtpProvider);

    // Register storage providers
    this.providerRegistry.register(this.s3Provider, true);

    // Register graph providers
    this.providerRegistry.register(this.microsoftGraphProvider, true);
  }
}
