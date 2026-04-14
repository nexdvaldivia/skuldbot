import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentModule } from './payment/payment.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';
import { SmsModule } from './sms/sms.module';
import { GraphModule } from './graph/graph.module';

import { ProviderRegistry } from './provider-registry.service';
import { ProviderFactoryService } from './provider-factory.service';
import { ProviderConfig } from './entities/provider-config.entity';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';

import { StripeProvider } from './payment/stripe.provider';
import { SendGridProvider } from './email/sendgrid.provider';
import { SmtpProvider } from './email/smtp.provider';
import { S3Provider } from './storage/s3.provider';
import { AzureBlobProvider } from './storage/azure-blob.provider';
import { MicrosoftGraphProvider } from './graph/graph.provider';
import { NoopSmsProvider } from './sms/noop-sms.provider';

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
    SmsModule,
    GraphModule,
  ],
  controllers: [IntegrationsController],
  providers: [ProviderRegistry, ProviderFactoryService, IntegrationsService],
  exports: [
    ProviderRegistry,
    ProviderFactoryService,
    IntegrationsService,
    TypeOrmModule,
    PaymentModule,
    StorageModule,
    EmailModule,
    SmsModule,
    GraphModule,
  ],
})
export class IntegrationsModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly stripeProvider: StripeProvider,
    private readonly sendGridProvider: SendGridProvider,
    private readonly smtpProvider: SmtpProvider,
    private readonly noopSmsProvider: NoopSmsProvider,
    private readonly s3Provider: S3Provider,
    private readonly azureBlobProvider: AzureBlobProvider,
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

    // Register sms providers
    this.providerRegistry.register(this.noopSmsProvider, true);

    // Register storage providers
    this.providerRegistry.register(this.s3Provider, true);
    this.providerRegistry.register(this.azureBlobProvider);

    // Register graph providers
    this.providerRegistry.register(this.microsoftGraphProvider, true);
  }
}
