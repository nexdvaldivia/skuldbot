import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import * as path from 'path';

import configuration from './config/configuration';
import { validate } from './config/env.validation';
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

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        // Auto-load all entity files
        entities: [path.join(__dirname, '**/*.entity{.ts,.js}')],
        // For development: synchronize schema automatically
        // For production: use migrations
        synchronize: configService.get('database.synchronize', true),
        logging: configService.get('database.logging', false),
        // Reduce retry attempts for faster failure
        retryAttempts: 3,
        retryDelay: 1000,
      }),
      inject: [ConfigService],
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
