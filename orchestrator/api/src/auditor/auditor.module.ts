import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { AuditorController } from './auditor.controller';
import { AuditorService } from './auditor.service';
import { AuditorAuthGuard } from './guards/auditor-auth.guard';
import { Auditor, AuditorAccessLog } from './entities/auditor.entity';
import { EvidenceModule } from '../evidence/evidence.module';

/**
 * Auditor Module - Read-Only Access for External Auditors
 *
 * This module provides a secure, read-only portal for external auditors
 * to verify evidence packs without accessing encrypted data.
 *
 * Auditor Capabilities:
 * 1. Read manifest.json (NOT encrypted, but SIGNED)
 * 2. Verify RSA-4096 digital signatures using public certificate
 * 3. Verify Merkle tree root and inclusion proofs
 * 4. Verify TSA timestamps for non-repudiation
 * 5. View chain of custody events
 * 6. Generate compliance attestation reports
 *
 * Auditor CANNOT:
 * - Decrypt evidence files (screenshots, logs, decisions)
 * - Modify any evidence
 * - Access raw PII/PHI data
 *
 * Access Model:
 * - Client creates auditor account with time-limited access
 * - Auditor receives public verification certificate
 * - All auditor actions are logged in chain of custody
 */
@Module({
  imports: [
    ConfigModule,
    EvidenceModule,
    TypeOrmModule.forFeature([Auditor, AuditorAccessLog]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret', 'skuldbot-jwt-secret-change-in-production'),
        signOptions: {
          expiresIn: configService.get<number>('jwt.expiresInSeconds', 28800), // 8 hours in seconds
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuditorController],
  providers: [AuditorService, AuditorAuthGuard],
  exports: [AuditorService],
})
export class AuditorModule {}
