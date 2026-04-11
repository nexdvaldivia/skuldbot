import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { AuditorService } from './auditor.service';
import { AuditorAuthGuard } from './guards/auditor-auth.guard';
import { CurrentAuditor } from './decorators/current-auditor.decorator';
import {
  VerifySignatureDto,
  VerifyIntegrityDto,
  GenerateAttestationDto,
  AuditorTokenDto,
} from './dto';

/**
 * Auditor Controller - Read-Only Evidence Verification API
 *
 * All endpoints are read-only and do not expose encrypted data.
 * Auditors can verify integrity and compliance without accessing PII/PHI.
 */
@ApiTags('Auditor Portal')
@Controller('auditor')
export class AuditorController {
  constructor(private readonly auditorService: AuditorService) {}

  // ─────────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────────

  @Post('auth/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate auditor',
    description: 'Exchange auditor credentials for a time-limited access token',
  })
  @ApiResponse({ status: 200, description: 'Token issued successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async authenticate(@Body() dto: AuditorTokenDto) {
    return this.auditorService.authenticate(dto);
  }

  // ─────────────────────────────────────────────────────────────────
  // Evidence Pack Listing
  // ─────────────────────────────────────────────────────────────────

  @Get('evidence-packs')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List available evidence packs',
    description: 'Returns evidence packs the auditor has access to (metadata only)',
  })
  async listEvidencePacks(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('botId') botId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditorService.listEvidencePacks(auditor, {
      page: page || 1,
      limit: limit || 20,
      botId,
      dateRange: from && to ? { from, to } : undefined,
    });
  }

  @Get('evidence-packs/:packId')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get evidence pack manifest',
    description: 'Returns the signed manifest (NOT encrypted) for verification',
  })
  async getManifest(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
  ) {
    return this.auditorService.getManifest(auditor, packId);
  }

  // ─────────────────────────────────────────────────────────────────
  // Signature Verification
  // ─────────────────────────────────────────────────────────────────

  @Post('evidence-packs/:packId/verify-signature')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify digital signature',
    description: 'Verify RSA-4096 signature and TSA timestamp of manifest',
  })
  @ApiResponse({
    status: 200,
    description: 'Signature verification result',
    schema: {
      type: 'object',
      properties: {
        signatureValid: { type: 'boolean' },
        algorithm: { type: 'string', example: 'RSA-PSS-4096' },
        signedAt: { type: 'string', format: 'date-time' },
        tsaTimestamp: { type: 'string', format: 'date-time' },
        tsaAuthority: { type: 'string' },
        certificateInfo: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            issuer: { type: 'string' },
            validFrom: { type: 'string' },
            validTo: { type: 'string' },
          },
        },
      },
    },
  })
  async verifySignature(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
    @Body() dto: VerifySignatureDto,
  ) {
    return this.auditorService.verifySignature(auditor, packId, dto);
  }

  @Get('certificates/:organizationId')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get public verification certificate',
    description: 'Download public certificate for offline signature verification',
  })
  async getPublicCertificate(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('organizationId') organizationId: string,
  ) {
    return this.auditorService.getPublicCertificate(auditor, organizationId);
  }

  // ─────────────────────────────────────────────────────────────────
  // Integrity Verification (Merkle Tree)
  // ─────────────────────────────────────────────────────────────────

  @Post('evidence-packs/:packId/verify-integrity')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify evidence pack integrity',
    description: 'Verify Merkle tree root hash and detect tampering',
  })
  @ApiResponse({
    status: 200,
    description: 'Integrity verification result',
    schema: {
      type: 'object',
      properties: {
        integrityValid: { type: 'boolean' },
        merkleRoot: { type: 'string' },
        totalFiles: { type: 'number' },
        validFiles: { type: 'number' },
        tamperedFiles: { type: 'array', items: { type: 'string' } },
        missingFiles: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async verifyIntegrity(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
    @Body() dto: VerifyIntegrityDto,
  ) {
    return this.auditorService.verifyIntegrity(auditor, packId, dto);
  }

  @Get('evidence-packs/:packId/merkle-proof/:filePath')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get Merkle inclusion proof for a file',
    description: 'Returns proof that a specific file was part of the original evidence pack',
  })
  async getMerkleProof(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
    @Param('filePath') filePath: string,
  ) {
    return this.auditorService.getMerkleProof(auditor, packId, filePath);
  }

  // ─────────────────────────────────────────────────────────────────
  // Chain of Custody
  // ─────────────────────────────────────────────────────────────────

  @Get('evidence-packs/:packId/custody')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get chain of custody',
    description: 'Returns all custody events with cryptographic chain verification',
  })
  async getChainOfCustody(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
  ) {
    return this.auditorService.getChainOfCustody(auditor, packId);
  }

  @Post('evidence-packs/:packId/custody/verify')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify chain of custody integrity',
    description: 'Verify cryptographic chain linking of all custody events',
  })
  async verifyCustodyChain(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
  ) {
    return this.auditorService.verifyCustodyChain(auditor, packId);
  }

  // ─────────────────────────────────────────────────────────────────
  // Compliance Attestation
  // ─────────────────────────────────────────────────────────────────

  @Get('evidence-packs/:packId/attestations')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List compliance attestations',
    description: 'Returns available attestation reports for the evidence pack',
  })
  async listAttestations(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
  ) {
    return this.auditorService.listAttestations(auditor, packId);
  }

  @Post('evidence-packs/:packId/attestations/generate')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate compliance attestation',
    description: 'Generate a new attestation report for a compliance framework',
  })
  async generateAttestation(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
    @Body() dto: GenerateAttestationDto,
  ) {
    return this.auditorService.generateAttestation(auditor, packId, dto);
  }

  @Get('evidence-packs/:packId/attestations/:attestationId')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get attestation report',
    description: 'Returns a specific attestation report in JSON or HTML format',
  })
  async getAttestation(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Param('packId') packId: string,
    @Param('attestationId') attestationId: string,
    @Query('format') format?: 'json' | 'html' | 'pdf',
  ) {
    return this.auditorService.getAttestation(
      auditor,
      packId,
      attestationId,
      format || 'json',
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Summary Reports
  // ─────────────────────────────────────────────────────────────────

  @Get('summary')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get audit summary',
    description: 'Returns high-level compliance summary for the organization',
  })
  async getAuditSummary(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditorService.getAuditSummary(auditor, { from, to });
  }

  @Get('compliance-score')
  @UseGuards(AuditorAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get compliance score',
    description: 'Returns overall compliance score across all frameworks',
  })
  async getComplianceScore(
    @CurrentAuditor() auditor: { id: string; organizationId: string },
    @Query('framework') framework?: string,
  ) {
    return this.auditorService.getComplianceScore(auditor, framework);
  }
}
