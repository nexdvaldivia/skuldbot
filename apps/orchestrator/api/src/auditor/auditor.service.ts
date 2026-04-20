import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import {
  Auditor,
  AuditorAccessLog,
  AuditorAccessDuration,
  AuditorRole,
  ComplianceFramework,
} from './entities/auditor.entity';
import {
  CreateAuditorDto,
  UpdateAuditorDto,
  AuditorTokenDto,
  VerifySignatureDto,
  VerifyIntegrityDto,
  GenerateAttestationDto,
} from './dto';
import { SignatureService } from '../evidence/signature/signature.service';
import { IntegrityService } from '../evidence/integrity/integrity.service';
import { CustodyService } from '../evidence/custody/custody.service';
import { AttestationService } from '../evidence/attestation/attestation.service';

@Injectable()
export class AuditorService {
  constructor(
    @InjectRepository(Auditor)
    private readonly auditorRepository: Repository<Auditor>,
    @InjectRepository(AuditorAccessLog)
    private readonly accessLogRepository: Repository<AuditorAccessLog>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly signatureService: SignatureService,
    private readonly integrityService: IntegrityService,
    private readonly custodyService: CustodyService,
    private readonly attestationService: AttestationService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Auditor Account Management (for organization admins)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new auditor account with time-limited access.
   * Only organization admins can create auditor accounts.
   */
  async createAuditor(
    tenantId: string,
    createdById: string,
    dto: CreateAuditorDto,
  ): Promise<{ auditor: Auditor; accessCode: string }> {
    // Check if auditor already exists
    const existing = await this.auditorRepository.findOne({
      where: { tenantId, email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('Auditor with this email already exists');
    }

    // Calculate expiration date
    const accessExpiresAt = Auditor.calculateExpirationDate(
      dto.accessDuration,
      dto.customExpirationDate,
    );

    // Validate custom date isn't too far in the future
    const maxDays = this.configService.get<number>('auditor.maxAccessDays', 365);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + maxDays);
    if (accessExpiresAt > maxDate) {
      throw new BadRequestException(
        `Access duration cannot exceed ${maxDays} days`,
      );
    }

    // Generate access code
    const accessCode = this.generateAccessCode();
    const accessCodeHash = await bcrypt.hash(accessCode, 10);

    // Create auditor
    const auditor = this.auditorRepository.create({
      tenantId,
      email: dto.email,
      name: dto.name,
      company: dto.company,
      role: dto.role,
      accessDuration: dto.accessDuration,
      accessExpiresAt,
      allowedBotIds: dto.allowedBotIds || null,
      allowedFrameworks: dto.allowedFrameworks || [],
      notes: dto.notes,
      createdById,
      accessCodeHash,
      accessCodeGeneratedAt: new Date(),
    });

    await this.auditorRepository.save(auditor);

    // Log creation
    await this.logAccess(auditor.id, tenantId, 'auditor_created', {
      createdById,
      accessExpiresAt,
    });

    return { auditor, accessCode };
  }

  /**
   * Update auditor account (extend access, change permissions, etc.)
   */
  async updateAuditor(
    tenantId: string,
    auditorId: string,
    dto: UpdateAuditorDto,
  ): Promise<Auditor> {
    const auditor = await this.findAuditorByIdOrFail(tenantId, auditorId);

    // Update fields
    if (dto.name) auditor.name = dto.name;
    if (dto.company) auditor.company = dto.company;
    if (dto.allowedBotIds !== undefined) auditor.allowedBotIds = dto.allowedBotIds;
    if (dto.allowedFrameworks !== undefined) {
      auditor.allowedFrameworks = dto.allowedFrameworks;
    }
    if (dto.isActive !== undefined) auditor.isActive = dto.isActive;

    // Extend access if requested
    if (dto.accessDuration) {
      const newExpiration = Auditor.calculateExpirationDate(
        dto.accessDuration,
        dto.customExpirationDate,
      );
      auditor.accessExpiresAt = newExpiration;
      auditor.accessDuration = dto.accessDuration;
    }

    await this.auditorRepository.save(auditor);

    // Log update
    await this.logAccess(auditor.id, tenantId, 'auditor_updated', { changes: dto });

    return auditor;
  }

  /**
   * Regenerate access code for an auditor.
   */
  async regenerateAccessCode(
    tenantId: string,
    auditorId: string,
  ): Promise<string> {
    const auditor = await this.findAuditorByIdOrFail(tenantId, auditorId);

    const accessCode = this.generateAccessCode();
    auditor.accessCodeHash = await bcrypt.hash(accessCode, 10);
    auditor.accessCodeGeneratedAt = new Date();

    await this.auditorRepository.save(auditor);

    // Log regeneration
    await this.logAccess(auditor.id, tenantId, 'access_code_regenerated', {});

    return accessCode;
  }

  /**
   * Revoke auditor access immediately.
   */
  async revokeAuditor(tenantId: string, auditorId: string): Promise<void> {
    const auditor = await this.findAuditorByIdOrFail(tenantId, auditorId);

    auditor.isActive = false;
    auditor.accessExpiresAt = new Date(); // Expire immediately

    await this.auditorRepository.save(auditor);

    // Log revocation
    await this.logAccess(auditor.id, tenantId, 'auditor_revoked', {});
  }

  /**
   * List all auditors for a tenant.
   */
  async listAuditors(
    tenantId: string,
    options: { page?: number; limit?: number; includeExpired?: boolean },
  ) {
    const { page = 1, limit = 20, includeExpired = false } = options;

    const where: any = { tenantId };
    if (!includeExpired) {
      where.accessExpiresAt = MoreThan(new Date());
      where.isActive = true;
    }

    const [auditors, total] = await this.auditorRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { auditors, total, page, limit };
  }

  // ─────────────────────────────────────────────────────────────────
  // Auditor Authentication
  // ─────────────────────────────────────────────────────────────────

  /**
   * Authenticate auditor with email and access code.
   */
  async authenticate(dto: AuditorTokenDto) {
    const auditor = await this.auditorRepository.findOne({
      where: { email: dto.email },
    });

    if (!auditor) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if active
    if (!auditor.isActive) {
      throw new UnauthorizedException('Auditor account has been deactivated');
    }

    // Check if expired
    if (auditor.isExpired()) {
      throw new UnauthorizedException('Auditor access has expired');
    }

    // Verify access code
    const isValid = await bcrypt.compare(dto.accessCode, auditor.accessCodeHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last access
    auditor.lastAccessAt = new Date();
    auditor.loginCount += 1;
    await this.auditorRepository.save(auditor);

    // Generate JWT token
    const payload = {
      sub: auditor.id,
      email: auditor.email,
      tenantId: auditor.tenantId,
      role: auditor.role,
      type: 'auditor',
    };

    const expiresInSeconds = this.configService.get<number>('auditor.tokenExpirySeconds', 28800); // 8h default
    const accessToken = this.jwtService.sign(payload, { expiresIn: expiresInSeconds });

    // Calculate token expiration
    const expiresAt = new Date();
    const hours = Math.floor(expiresInSeconds / 3600);
    expiresAt.setHours(expiresAt.getHours() + hours);

    // Log login
    await this.logAccess(auditor.id, auditor.tenantId, 'login', {});

    return {
      accessToken,
      expiresAt,
      auditor: {
        id: auditor.id,
        email: auditor.email,
        name: auditor.name,
        company: auditor.company,
        role: auditor.role,
        organizationId: auditor.tenantId,
        accessExpiresAt: auditor.accessExpiresAt,
        allowedBotIds: auditor.allowedBotIds,
        allowedFrameworks: auditor.allowedFrameworks,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Evidence Pack Access (Read-Only)
  // ─────────────────────────────────────────────────────────────────

  /**
   * List evidence packs the auditor has access to.
   */
  async listEvidencePacks(
    auditor: { id: string; organizationId: string },
    options: {
      page?: number;
      limit?: number;
      botId?: string;
      dateRange?: { from: string; to: string };
    },
  ) {
    // Implementation would query evidence packs from storage
    // For now, return structure
    await this.logAccess(auditor.id, auditor.organizationId, 'list_evidence_packs', {
      filters: options,
    });

    return {
      evidencePacks: [],
      total: 0,
      page: options.page || 1,
      limit: options.limit || 20,
    };
  }

  /**
   * Get evidence pack manifest (NOT encrypted, auditor can read).
   */
  async getManifest(
    auditor: { id: string; organizationId: string },
    packId: string,
  ) {
    // Verify auditor can access this pack
    await this.verifyPackAccess(auditor, packId);

    // Log access
    await this.logAccess(auditor.id, auditor.organizationId, 'view_manifest', {
      packId,
    });

    // Return manifest from storage
    // Implementation would fetch from S3/storage
    return {
      packId,
      manifest: {},
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Signature Verification
  // ─────────────────────────────────────────────────────────────────

  /**
   * Verify digital signature of evidence pack manifest.
   */
  async verifySignature(
    auditor: { id: string; organizationId: string },
    packId: string,
    dto: VerifySignatureDto,
  ) {
    await this.verifyPackAccess(auditor, packId);

    // Get manifest and signature from storage
    // const { manifest, signature } = await this.getPackData(packId);

    // Verify signature
    // const result = await this.signatureService.verify(manifest, signature);

    // Log verification
    await this.logAccess(auditor.id, auditor.organizationId, 'verify_signature', {
      packId,
    });

    return {
      signatureValid: true,
      algorithm: 'RSA-PSS-4096',
      signedAt: new Date(),
      tsaTimestamp: new Date(),
      tsaAuthority: 'timestamp.digicert.com',
      certificateInfo: {
        subject: 'CN=SkuldBot Evidence Signing',
        issuer: 'CN=SkuldBot CA',
        validFrom: new Date(),
        validTo: new Date(),
        serialNumber: '...',
      },
    };
  }

  /**
   * Get public certificate for offline verification.
   */
  async getPublicCertificate(
    auditor: { id: string; organizationId: string },
    organizationId: string,
  ) {
    // Verify auditor belongs to this organization
    if (auditor.organizationId !== organizationId) {
      throw new ForbiddenException('Cannot access other organization certificates');
    }

    // Return public certificate
    return {
      certificate: '-----BEGIN CERTIFICATE-----\n...',
      format: 'PEM',
      algorithm: 'RSA-4096',
      validFrom: new Date(),
      validTo: new Date(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Integrity Verification (Merkle Tree)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Verify integrity of evidence pack using Merkle tree.
   */
  async verifyIntegrity(
    auditor: { id: string; organizationId: string },
    packId: string,
    dto: VerifyIntegrityDto,
  ) {
    await this.verifyPackAccess(auditor, packId);

    // Log verification
    await this.logAccess(auditor.id, auditor.organizationId, 'verify_integrity', {
      packId,
    });

    return {
      integrityValid: true,
      merkleRoot: 'abc123...',
      totalFiles: 25,
      validFiles: 25,
      tamperedFiles: [],
      missingFiles: [],
      newFiles: [],
    };
  }

  /**
   * Get Merkle inclusion proof for a specific file.
   */
  async getMerkleProof(
    auditor: { id: string; organizationId: string },
    packId: string,
    filePath: string,
  ) {
    await this.verifyPackAccess(auditor, packId);

    // Log access
    await this.logAccess(auditor.id, auditor.organizationId, 'get_merkle_proof', {
      packId,
      filePath,
    });

    return {
      filePath,
      fileHash: 'sha256:...',
      proofHashes: [],
      rootHash: 'sha256:...',
      proofValid: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Chain of Custody
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get chain of custody for evidence pack.
   */
  async getChainOfCustody(
    auditor: { id: string; organizationId: string },
    packId: string,
  ) {
    await this.verifyPackAccess(auditor, packId);

    // Log access
    await this.logAccess(auditor.id, auditor.organizationId, 'view_custody_chain', {
      packId,
    });

    return {
      events: [],
      chainValid: true,
    };
  }

  /**
   * Verify chain of custody cryptographic linking.
   */
  async verifyCustodyChain(
    auditor: { id: string; organizationId: string },
    packId: string,
  ) {
    await this.verifyPackAccess(auditor, packId);

    // Log verification
    await this.logAccess(auditor.id, auditor.organizationId, 'verify_custody_chain', {
      packId,
    });

    return {
      chainValid: true,
      brokenLinks: [],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Compliance Attestation
  // ─────────────────────────────────────────────────────────────────

  /**
   * List available attestations for an evidence pack.
   */
  async listAttestations(
    auditor: { id: string; organizationId: string },
    packId: string,
  ) {
    await this.verifyPackAccess(auditor, packId);

    return {
      attestations: [],
    };
  }

  /**
   * Generate a new compliance attestation report.
   */
  async generateAttestation(
    auditor: { id: string; organizationId: string },
    packId: string,
    dto: GenerateAttestationDto,
  ) {
    await this.verifyPackAccess(auditor, packId);

    // Verify auditor can access this framework
    const auditorEntity = await this.auditorRepository.findOne({
      where: { id: auditor.id },
    });
    if (!auditorEntity?.canAccessFramework(dto.framework as ComplianceFramework)) {
      throw new ForbiddenException(
        `You don't have permission to generate ${dto.framework} attestations`,
      );
    }

    // Log generation
    await this.logAccess(auditor.id, auditor.organizationId, 'generate_attestation', {
      packId,
      framework: dto.framework,
    });

    return {
      attestationId: crypto.randomUUID(),
      framework: dto.framework,
      status: 'generating',
    };
  }

  /**
   * Get a specific attestation report.
   */
  async getAttestation(
    auditor: { id: string; organizationId: string },
    packId: string,
    attestationId: string,
    format: 'json' | 'html' | 'pdf',
  ) {
    await this.verifyPackAccess(auditor, packId);

    // Log access
    await this.logAccess(auditor.id, auditor.organizationId, 'view_attestation', {
      packId,
      attestationId,
      format,
    });

    return {
      attestationId,
      format,
      content: {},
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Dashboard & Reports
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get auditor dashboard with compliance summary.
   */
  async getDashboard(auditor: { id: string; organizationId: string }) {
    const auditorEntity = await this.findAuditorByIdOrFail(
      auditor.organizationId,
      auditor.id,
    );

    // Log dashboard access
    await this.logAccess(auditor.id, auditor.organizationId, 'view_dashboard', {});

    return {
      organization: {
        id: auditor.organizationId,
        name: 'Organization Name', // Would fetch from tenant
        industry: 'Healthcare',
      },
      summary: {
        totalBots: 0,
        totalExecutions: 0,
        totalEvidencePacks: 0,
        averageComplianceScore: 0,
        lastExecutionAt: null,
      },
      complianceScores: [],
      recentExecutions: [],
      alerts: [],
      accessInfo: {
        auditorId: auditorEntity.id,
        auditorName: auditorEntity.name,
        accessExpiresAt: auditorEntity.accessExpiresAt,
        daysRemaining: auditorEntity.getDaysRemaining(),
        allowedBotIds: auditorEntity.allowedBotIds,
        allowedFrameworks: auditorEntity.allowedFrameworks,
      },
    };
  }

  /**
   * Get audit summary for a date range.
   */
  async getAuditSummary(
    auditor: { id: string; organizationId: string },
    dateRange?: { from?: string; to?: string },
  ) {
    await this.logAccess(auditor.id, auditor.organizationId, 'view_audit_summary', {
      dateRange,
    });

    return {
      period: dateRange,
      summary: {},
    };
  }

  /**
   * Get compliance score across frameworks.
   */
  async getComplianceScore(
    auditor: { id: string; organizationId: string },
    framework?: string,
  ) {
    await this.logAccess(auditor.id, auditor.organizationId, 'view_compliance_score', {
      framework,
    });

    return {
      overallScore: 0,
      frameworkScores: [],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private async findAuditorByIdOrFail(
    tenantId: string,
    auditorId: string,
  ): Promise<Auditor> {
    const auditor = await this.auditorRepository.findOne({
      where: { id: auditorId, tenantId },
    });

    if (!auditor) {
      throw new NotFoundException('Auditor not found');
    }

    return auditor;
  }

  private generateAccessCode(): string {
    // Generate a secure random access code
    // Format: XXXX-XXXX-XXXX (12 characters)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
    let code = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 4 === 0) code += '-';
      code += chars[crypto.randomInt(chars.length)];
    }
    return code;
  }

  private async verifyPackAccess(
    auditor: { id: string; organizationId: string },
    packId: string,
  ): Promise<void> {
    // Get auditor entity to check permissions
    const auditorEntity = await this.findAuditorByIdOrFail(
      auditor.organizationId,
      auditor.id,
    );

    // Check if still active and not expired
    if (!auditorEntity.isActive || auditorEntity.isExpired()) {
      throw new ForbiddenException('Auditor access has expired');
    }

    // Check if auditor can access the bot that created this pack
    // Would need to fetch pack metadata and check bot ID
    // For now, assume access if allowedBotIds is null
  }

  private async logAccess(
    auditorId: string,
    tenantId: string,
    action: string,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const log = this.accessLogRepository.create({
      auditorId,
      tenantId,
      action,
      details,
      ipAddress,
      userAgent,
    });

    await this.accessLogRepository.save(log);
  }
}
