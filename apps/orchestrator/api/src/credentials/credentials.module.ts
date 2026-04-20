import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import {
  Credential,
  CredentialAccessLog,
  CredentialRotationHistory,
  CredentialFolder,
  VaultConnection,
} from './entities/credential.entity';
import { CredentialsService } from './credentials.service';
import {
  CredentialsController,
  InternalCredentialsController,
} from './credentials.controller';
import { EncryptionService } from './encryption.service';

/**
 * Credentials Module.
 *
 * Provides enterprise-grade credential management with:
 * - AES-256-GCM encryption for at-rest protection
 * - External vault integration (HashiCorp, AWS, Azure, GCP)
 * - Fine-grained access control (scope, bots, environments)
 * - Automatic rotation policies
 * - Complete audit trail
 * - Expiration tracking and alerting
 * - Folder-based organization
 *
 * Controllers:
 * - CredentialsController: Public API for credential management
 * - InternalCredentialsController: Internal API for runner credential fetch
 *
 * Services:
 * - CredentialsService: Business logic for credential operations
 * - EncryptionService: Cryptographic operations (AES-256-GCM)
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Credential,
      CredentialAccessLog,
      CredentialRotationHistory,
      CredentialFolder,
      VaultConnection,
    ]),
  ],
  controllers: [CredentialsController, InternalCredentialsController],
  providers: [CredentialsService, EncryptionService],
  exports: [CredentialsService, EncryptionService],
})
export class CredentialsModule {}
