import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { EvidencePackService, EvidenceManifest, CustodyEvent } from './evidence-pack.service';
import { AttestationService, ComplianceFramework, AttestationRecord } from './attestation/attestation.service';
import { RetentionService, RetentionPolicy } from './retention/retention.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

/**
 * Evidence Controller - Evidence Pack Management API
 *
 * Provides endpoints for:
 * - Listing and retrieving evidence packs
 * - Verifying integrity and signatures
 * - Managing chain of custody
 * - Compliance attestations
 * - Legal holds
 */
@ApiTags('Evidence')
@Controller('evidence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EvidenceController {
  constructor(
    private readonly evidencePackService: EvidencePackService,
    private readonly attestationService: AttestationService,
    private readonly retentionService: RetentionService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Evidence Pack Endpoints
  // ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List evidence packs' })
  @ApiResponse({ status: 200, description: 'List of evidence packs' })
  async listPacks(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('botId') botId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{
    packs: Array<{
      packId: string;
      executionId: string;
      botId: string;
      botName: string;
      createdAt: string;
      merkleRoot: string;
      totalFiles: number;
    }>;
    total: number;
  }> {
    return this.evidencePackService.listPacks(tenantId, {
      page: page || 1,
      limit: limit || 20,
      botId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get(':packId/manifest')
  @ApiOperation({ summary: 'Get evidence pack manifest' })
  @ApiResponse({ status: 200, description: 'Evidence pack manifest' })
  @ApiResponse({ status: 404, description: 'Pack not found' })
  async getManifest(
    @CurrentTenant() tenantId: string,
    @Param('packId') packId: string,
  ): Promise<EvidenceManifest> {
    return this.evidencePackService.getManifest(tenantId, packId);
  }

  // ─────────────────────────────────────────────────────────────────
  // Verification Endpoints
  // ─────────────────────────────────────────────────────────────────

  @Post(':packId/verify/integrity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify evidence pack integrity' })
  @ApiResponse({ status: 200, description: 'Integrity verification result' })
  async verifyIntegrity(
    @CurrentTenant() tenantId: string,
    @Param('packId') packId: string,
  ): Promise<{
    valid: boolean;
    merkleRoot: string;
    tamperedFiles: string[];
    missingFiles: string[];
  }> {
    return this.evidencePackService.verifyIntegrity(tenantId, packId);
  }

  @Post(':packId/verify/signature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify evidence pack signature' })
  @ApiResponse({ status: 200, description: 'Signature verification result' })
  async verifySignature(
    @CurrentTenant() tenantId: string,
    @Param('packId') packId: string,
  ): Promise<{
    valid: boolean;
    algorithm: string;
    signedAt: string;
    tsaTimestamp?: string;
  }> {
    return this.evidencePackService.verifySignature(tenantId, packId);
  }

  // ─────────────────────────────────────────────────────────────────
  // Chain of Custody Endpoints
  // ─────────────────────────────────────────────────────────────────

  @Get(':packId/custody')
  @ApiOperation({ summary: 'Get chain of custody' })
  @ApiResponse({ status: 200, description: 'Chain of custody events' })
  async getChainOfCustody(
    @CurrentTenant() tenantId: string,
    @Param('packId') packId: string,
  ): Promise<{ events: CustodyEvent[]; chainValid: boolean }> {
    return this.evidencePackService.getChainOfCustody(tenantId, packId);
  }

  // ─────────────────────────────────────────────────────────────────
  // Legal Hold Endpoints
  // ─────────────────────────────────────────────────────────────────

  @Post(':packId/legal-hold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply legal hold to evidence pack' })
  @ApiResponse({ status: 200, description: 'Legal hold applied' })
  async applyLegalHold(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { id: string },
    @Param('packId') packId: string,
    @Body() body: { reason: string; caseId?: string },
  ): Promise<{ success: boolean }> {
    if (!body.reason) {
      throw new BadRequestException('Reason is required for legal hold');
    }

    await this.evidencePackService.applyLegalHold(tenantId, packId, {
      reason: body.reason,
      caseId: body.caseId,
      requestedBy: user.id,
    });

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // Attestation Endpoints
  // ─────────────────────────────────────────────────────────────────

  @Get('frameworks')
  @ApiOperation({ summary: 'Get available compliance frameworks' })
  @ApiResponse({ status: 200, description: 'List of compliance frameworks' })
  async getFrameworks(): Promise<ComplianceFramework[]> {
    return this.attestationService.getFrameworks();
  }

  @Get(':packId/attestations')
  @ApiOperation({ summary: 'Get attestations for an evidence pack' })
  @ApiResponse({ status: 200, description: 'List of attestations' })
  async getAttestations(
    @Param('packId') packId: string,
  ): Promise<AttestationRecord[]> {
    return this.attestationService.getPackAttestations(packId);
  }

  @Post(':packId/attestations/:framework')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate compliance attestation' })
  @ApiResponse({ status: 201, description: 'Attestation created' })
  async generateAttestation(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { id: string },
    @Param('packId') packId: string,
    @Param('framework') framework: string,
  ): Promise<AttestationRecord> {
    // Validate framework
    const validFrameworks = await this.attestationService.getFrameworks();
    if (!validFrameworks.includes(framework as ComplianceFramework)) {
      throw new BadRequestException(`Invalid framework: ${framework}`);
    }

    // Get manifest to evaluate
    const manifest = await this.evidencePackService.getManifest(tenantId, packId);

    // Generate attestation based on manifest contents
    return this.attestationService.generateAttestation({
      packId,
      tenantId,
      framework: framework as ComplianceFramework,
      manifestContent: {
        hasEncryption: manifest.encryption.algorithm === 'AES-256-GCM',
        hasSignature: !!manifest.signature.signatureValue,
        hasIntegrity: !!manifest.integrity.merkleRoot,
        hasAuditTrail: manifest.custody.events.length > 0,
        hasRetention: !!manifest.retention.policy,
        hasAccessControl: true, // Implied by JWT auth
        hasDataLineage: manifest.contents.lineage.length > 0,
      },
      attestedBy: user.id,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Retention Policy Endpoints
  // ─────────────────────────────────────────────────────────────────

  @Get('retention-policies')
  @ApiOperation({ summary: 'Get available retention policies' })
  @ApiResponse({ status: 200, description: 'List of retention policies' })
  async getRetentionPolicies(): Promise<RetentionPolicy[]> {
    return this.retentionService.getPolicies();
  }
}
