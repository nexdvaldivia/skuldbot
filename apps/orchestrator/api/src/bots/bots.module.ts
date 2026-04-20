import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { Bot, BotVersion } from './entities/bot.entity';
import { User } from '../users/entities/user.entity';
import { CompilerModule } from '../compiler/compiler.module';

/**
 * Bots Module.
 *
 * Provides comprehensive bot management with enterprise features:
 *
 * Core Features:
 * - Bot CRUD with version control
 * - DSL compilation and validation
 * - Publishing workflow (Draft -> Compiled -> Published)
 * - Export/Import for migration
 * - Clone functionality
 * - Favorites and organization
 *
 * Enterprise Features:
 * - Access control (sharing with users/roles)
 * - Usage statistics and analytics
 * - Webhook trigger support
 * - Credential vault references
 * - Notification configuration
 * - Quota enforcement per tenant
 *
 * Version Lifecycle:
 * DRAFT -> COMPILED -> PUBLISHED -> DEPRECATED
 *
 * Security:
 * - Tenant isolation
 * - Permission-based access (bots:read, bots:write, bots:delete, bots:execute)
 * - Audit logging for all operations
 * - Webhook secret generation
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Bot, BotVersion, User]),
    CompilerModule,
  ],
  controllers: [BotsController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
