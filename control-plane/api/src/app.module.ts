import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Client } from './clients/entities/client.entity';
import { Tenant } from './tenants/entities/tenant.entity';
import { License } from './licenses/entities/license.entity';
import { User } from './users/entities/user.entity';
import { MarketplaceBot, BotVersion } from './marketplace/entities/marketplace-bot.entity';
import { Partner } from './marketplace/entities/partner.entity';
import { UsageRecord, UsageBatch } from './billing/entities/usage-record.entity';
import { RevenueShareRecord, PartnerPayout } from './billing/entities/revenue-share.entity';
import { TenantSubscription, PaymentHistory } from './billing/entities/subscription.entity';
import { PaymentConfig } from './billing/entities/payment-config.entity';

// Modules
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { TenantsModule } from './tenants/tenants.module';
import { LicensesModule } from './licenses/licenses.module';
import { UsersModule } from './users/users.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'skuld'),
        password: configService.get<string>('DB_PASSWORD', 'skuld'),
        database: configService.get<string>('DB_DATABASE', 'skuld_controlplane'),
        entities: [Client, Tenant, License, User, MarketplaceBot, BotVersion, Partner, UsageRecord, UsageBatch, RevenueShareRecord, PartnerPayout, TenantSubscription, PaymentHistory, PaymentConfig],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: configService.get<string>('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Integrations (global providers for payment, storage, email, graph)
    IntegrationsModule,

    // Feature modules
    AuthModule,
    ClientsModule,
    TenantsModule,
    LicensesModule,
    UsersModule,
    MarketplaceModule,
    BillingModule,
  ],
})
export class AppModule {}
