import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKey } from '../../users/entities/api-key.entity';
import { User } from '../../users/entities/user.entity';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { TokenService } from '../../common/crypto/password.service';

/**
 * API Keys Module.
 *
 * Provides API key management for programmatic access:
 *
 * Use cases:
 * - Runner authentication
 * - CI/CD pipeline integration
 * - Third-party integrations
 * - Webhook authentication
 * - SDK and CLI authentication
 *
 * Features:
 * - Scoped permissions (granular access control)
 * - IP whitelist (security)
 * - Expiration dates (security)
 * - Rate limiting (protection)
 * - Usage tracking (monitoring)
 * - Key regeneration (rotation)
 *
 * Security:
 * - Keys are hashed using SHA-256
 * - Full key only shown once on creation
 * - Prefix shown for identification (sk_live_xxxx...)
 * - Audit logging for all operations
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, User, AuditLog]),
  ],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, TokenService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
