import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EvidencePackService } from './evidence-pack.service';
import { EncryptionService } from './encryption/encryption.service';
import { SignatureService } from './signature/signature.service';
import { IntegrityService } from './integrity/integrity.service';
import { RetentionService } from './retention/retention.service';
import { SiemService } from './siem/siem.service';
import { CustodyService } from './custody/custody.service';
import { AttestationService } from './attestation/attestation.service';
import { EvidenceController } from './evidence.controller';

/**
 * Evidence Module - Enterprise-Grade Audit Trail
 *
 * Provides cryptographically verifiable evidence packs for bot executions.
 *
 * Features:
 * - AES-256-GCM encryption at rest (envelope encryption with KMS)
 * - RSA-4096 / ECDSA-P384 digital signatures with TSA timestamping
 * - Merkle Tree integrity verification and inclusion proofs
 * - Retention Policies with Legal Hold support
 * - SIEM Integration (Splunk, DataDog, CloudWatch, ELK)
 * - Cryptographically-linked Chain of Custody
 * - Multi-framework Compliance Attestation (HIPAA, SOC2, PCI-DSS, GDPR)
 *
 * IMPORTANT: Evidence Pack NEVER stores PII/PHI in raw form.
 * - Screenshots: Auto-redacted with OCR detection
 * - Data Lineage: Only references (nodeId, fieldName, classification)
 * - Logs: Automatically redacted
 * - Agent Decisions: Records WHAT was decided, not the data processed
 */
@Module({
  imports: [ConfigModule],
  controllers: [EvidenceController],
  providers: [
    EvidencePackService,
    EncryptionService,
    SignatureService,
    IntegrityService,
    RetentionService,
    SiemService,
    CustodyService,
    AttestationService,
  ],
  exports: [
    EvidencePackService,
    EncryptionService,
    SignatureService,
    IntegrityService,
    RetentionService,
    SiemService,
    CustodyService,
    AttestationService,
  ],
})
export class EvidenceModule {}
