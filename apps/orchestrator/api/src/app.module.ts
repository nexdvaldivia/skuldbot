import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { buildTypeOrmOptions } from './database/typeorm-options';
import { StorageModule } from './storage/storage.module';
import { BotsModule } from './bots/bots.module';
import { ManifestsModule } from './manifests/manifests.module';
import { PoliciesModule } from './policies/policies.module';
import { RunsModule } from './runs/runs.module';
import { RunnersModule } from './runners/runners.module';
import { SchedulesModule } from './schedules/schedules.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { WebsocketModule } from './websocket/websocket.module';
import { AuthModule } from './auth/auth.module';
import { LicenseModule } from './license/license.module';
import { RolesModule } from './roles/roles.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { EvidenceModule } from './evidence/evidence.module';
import { AuditorModule } from './auditor/auditor.module';
import { ControlPlaneModule } from './control-plane/control-plane.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { UsageModule } from './usage/usage.module';
import { SchemasModule } from './schemas/schemas.module';
import { MCPModule } from './mcp/mcp.module';
import { SettingsModule } from './settings/settings.module';
import { BillingModule } from './billing/billing.module';
import { enforceEnvironmentPolicy } from './common/utils/environment-policy';

enforceEnvironmentPolicy(process.env);

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      // Regulated environments should inject env vars from platform/vault.
      // Local dotenv loading is opt-in via ALLOW_DOTENV=true.
      ignoreEnvFile: process.env.ALLOW_DOTENV !== 'true',
      envFilePath:
        process.env.ALLOW_DOTENV === 'true' ? ['.env.local', '.env'] : undefined,
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        ...(buildTypeOrmOptions(process.env) as TypeOrmModuleOptions),
        // Reduce retry attempts for faster failure
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),

    // Queue (BullMQ)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),

    // Storage (S3/Azure/GCS/Local)
    StorageModule.forRoot(),

    // Core modules
    LicenseModule,
    BillingModule,
    AuthModule,
    RolesModule,
    AuditModule,
    UsersModule,

    // Feature modules
    ManifestsModule,
    PoliciesModule,
    BotsModule,
    RunsModule,
    RunnersModule,
    SchedulesModule,
    DispatchModule,

    // Real-time WebSocket
    WebsocketModule,

    // Evidence & Auditor
    EvidenceModule,
    AuditorModule,

    // Control-Plane Communication
    ControlPlaneModule,

    // Marketplace
    MarketplaceModule,

    // Usage Tracking
    UsageModule,

    // Schema Discovery
    SchemasModule,

    // Tenant settings
    SettingsModule,

    // MCP Module (Model Context Protocol)
    MCPModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
