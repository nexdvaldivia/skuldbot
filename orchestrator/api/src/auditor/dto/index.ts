import { IsString, IsOptional, IsEnum, IsDate, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────

export enum AuditorAccessDuration {
  DAYS_30 = '30_days',
  DAYS_60 = '60_days',
  DAYS_90 = '90_days',
  CUSTOM = 'custom',
}

export enum ComplianceFramework {
  HIPAA = 'hipaa',
  SOC2 = 'soc2',
  PCI_DSS = 'pci_dss',
  GDPR = 'gdpr',
  ISO_27001 = 'iso_27001',
  NIST_CSF = 'nist_csf',
  CCPA = 'ccpa',
  HITRUST = 'hitrust',
}

export enum AuditorRole {
  EXTERNAL_AUDITOR = 'external_auditor',
  INTERNAL_AUDITOR = 'internal_auditor',
  COMPLIANCE_OFFICER = 'compliance_officer',
  REGULATOR = 'regulator',
}

// ─────────────────────────────────────────────────────────────────
// Create Auditor Account
// ─────────────────────────────────────────────────────────────────

export class CreateAuditorDto {
  @ApiProperty({ description: 'Auditor email address' })
  @IsString()
  email: string;

  @ApiProperty({ description: 'Auditor full name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Auditor company/firm name' })
  @IsString()
  company: string;

  @ApiProperty({ enum: AuditorRole, description: 'Auditor role' })
  @IsEnum(AuditorRole)
  role: AuditorRole;

  @ApiProperty({
    enum: AuditorAccessDuration,
    description: 'Access duration preset',
  })
  @IsEnum(AuditorAccessDuration)
  accessDuration: AuditorAccessDuration;

  @ApiPropertyOptional({
    description: 'Custom expiration date (required if accessDuration is CUSTOM)',
    type: Date,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  customExpirationDate?: Date;

  @ApiPropertyOptional({
    description: 'Specific bot IDs the auditor can access (empty = all)',
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  allowedBotIds?: string[];

  @ApiPropertyOptional({
    description: 'Compliance frameworks the auditor can generate reports for',
    type: [String],
    enum: ComplianceFramework,
  })
  @IsOptional()
  @IsEnum(ComplianceFramework, { each: true })
  allowedFrameworks?: ComplianceFramework[];

  @ApiPropertyOptional({ description: 'Additional notes about the auditor' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAuditorDto {
  @ApiPropertyOptional({ description: 'Auditor full name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Auditor company/firm name' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({
    enum: AuditorAccessDuration,
    description: 'Extend access duration',
  })
  @IsOptional()
  @IsEnum(AuditorAccessDuration)
  accessDuration?: AuditorAccessDuration;

  @ApiPropertyOptional({
    description: 'Custom expiration date',
    type: Date,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  customExpirationDate?: Date;

  @ApiPropertyOptional({
    description: 'Update allowed bot IDs',
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  allowedBotIds?: string[];

  @ApiPropertyOptional({
    description: 'Update allowed frameworks',
    type: [String],
  })
  @IsOptional()
  @IsEnum(ComplianceFramework, { each: true })
  allowedFrameworks?: ComplianceFramework[];

  @ApiPropertyOptional({ description: 'Disable auditor access' })
  @IsOptional()
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────────────────────────

export class AuditorTokenDto {
  @ApiProperty({ description: 'Auditor email' })
  @IsString()
  email: string;

  @ApiProperty({ description: 'Auditor access code (sent via email)' })
  @IsString()
  accessCode: string;

  @ApiPropertyOptional({ description: 'Organization ID' })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class AuditorTokenResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Token expiration time' })
  expiresAt: Date;

  @ApiProperty({ description: 'Auditor information' })
  auditor: {
    id: string;
    email: string;
    name: string;
    company: string;
    role: AuditorRole;
    organizationId: string;
    organizationName: string;
    accessExpiresAt: Date;
    allowedBotIds: string[] | null;
    allowedFrameworks: ComplianceFramework[];
  };
}

// ─────────────────────────────────────────────────────────────────
// Verification DTOs
// ─────────────────────────────────────────────────────────────────

export class VerifySignatureDto {
  @ApiPropertyOptional({
    description: 'Public certificate to use for verification (optional, uses org default)',
  })
  @IsOptional()
  @IsString()
  publicCertificate?: string;

  @ApiPropertyOptional({
    description: 'Verify TSA timestamp as well',
    default: true,
  })
  @IsOptional()
  verifyTimestamp?: boolean;
}

export class VerifyIntegrityDto {
  @ApiPropertyOptional({
    description: 'Specific files to verify (empty = all files)',
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  filePaths?: string[];

  @ApiPropertyOptional({
    description: 'Include detailed file-by-file results',
    default: false,
  })
  @IsOptional()
  includeDetails?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Attestation DTOs
// ─────────────────────────────────────────────────────────────────

export class GenerateAttestationDto {
  @ApiProperty({
    enum: ComplianceFramework,
    description: 'Compliance framework to attest against',
  })
  @IsEnum(ComplianceFramework)
  framework: ComplianceFramework;

  @ApiPropertyOptional({
    description: 'Output format',
    enum: ['json', 'html', 'pdf'],
    default: 'json',
  })
  @IsOptional()
  @IsString()
  format?: 'json' | 'html' | 'pdf';

  @ApiPropertyOptional({
    description: 'Include this attestation in signed evidence pack',
    default: true,
  })
  @IsOptional()
  includeInPack?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Dashboard / Reports
// ─────────────────────────────────────────────────────────────────

export class AuditorDashboardDto {
  @ApiProperty({ description: 'Organization information' })
  organization: {
    id: string;
    name: string;
    industry: string;
  };

  @ApiProperty({ description: 'Summary statistics' })
  summary: {
    totalBots: number;
    totalExecutions: number;
    totalEvidencePacks: number;
    averageComplianceScore: number;
    lastExecutionAt: Date | null;
  };

  @ApiProperty({ description: 'Compliance scores by framework' })
  complianceScores: {
    framework: ComplianceFramework;
    score: number;
    status: 'compliant' | 'partially_compliant' | 'non_compliant' | 'not_evaluated';
    lastEvaluatedAt: Date | null;
  }[];

  @ApiProperty({ description: 'Recent executions' })
  recentExecutions: {
    executionId: string;
    botId: string;
    botName: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    hasEvidencePack: boolean;
  }[];

  @ApiProperty({ description: 'Active alerts/findings' })
  alerts: {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    framework: ComplianceFramework | null;
    createdAt: Date;
  }[];

  @ApiProperty({ description: 'Auditor access information' })
  accessInfo: {
    auditorId: string;
    auditorName: string;
    accessExpiresAt: Date;
    daysRemaining: number;
    allowedBotIds: string[] | null;
    allowedFrameworks: ComplianceFramework[];
  };
}

export class ComplianceReportDto {
  @ApiProperty({ description: 'Report metadata' })
  metadata: {
    reportId: string;
    framework: ComplianceFramework;
    generatedAt: Date;
    generatedBy: string;
    periodStart: Date;
    periodEnd: Date;
    organizationId: string;
    organizationName: string;
  };

  @ApiProperty({ description: 'Executive summary' })
  executiveSummary: {
    overallStatus: 'compliant' | 'partially_compliant' | 'non_compliant';
    complianceScore: number;
    totalControls: number;
    passedControls: number;
    failedControls: number;
    partialControls: number;
    notApplicable: number;
  };

  @ApiProperty({ description: 'Control evaluations by category' })
  controlsByCategory: {
    category: string;
    controls: {
      controlId: string;
      name: string;
      status: string;
      findings: string;
      recommendations: string;
      evidenceReferences: string[];
    }[];
  }[];

  @ApiProperty({ description: 'Evidence pack references' })
  evidenceReferences: {
    packId: string;
    executionId: string;
    botName: string;
    createdAt: Date;
    merkleRoot: string;
    signatureValid: boolean;
  }[];

  @ApiProperty({ description: 'Recommendations' })
  recommendations: string[];
}

// ─────────────────────────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────────────────────────

export class AuditorListResponseDto {
  @ApiProperty({ type: [Object] })
  auditors: {
    id: string;
    email: string;
    name: string;
    company: string;
    role: AuditorRole;
    isActive: boolean;
    accessExpiresAt: Date;
    lastAccessAt: Date | null;
    createdAt: Date;
  }[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class EvidencePackListDto {
  @ApiProperty({ type: [Object] })
  evidencePacks: {
    packId: string;
    executionId: string;
    botId: string;
    botName: string;
    createdAt: Date;
    merkleRoot: string;
    signatureAlgorithm: string;
    totalFiles: number;
    sizeBytes: number;
  }[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class SignatureVerificationResultDto {
  @ApiProperty()
  signatureValid: boolean;

  @ApiProperty()
  algorithm: string;

  @ApiProperty()
  signedAt: Date;

  @ApiPropertyOptional()
  tsaTimestamp?: Date;

  @ApiPropertyOptional()
  tsaAuthority?: string;

  @ApiProperty()
  certificateInfo: {
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
    serialNumber: string;
  };

  @ApiPropertyOptional()
  verificationErrors?: string[];
}

export class IntegrityVerificationResultDto {
  @ApiProperty()
  integrityValid: boolean;

  @ApiProperty()
  merkleRoot: string;

  @ApiProperty()
  totalFiles: number;

  @ApiProperty()
  validFiles: number;

  @ApiProperty({ type: [String] })
  tamperedFiles: string[];

  @ApiProperty({ type: [String] })
  missingFiles: string[];

  @ApiProperty({ type: [String] })
  newFiles: string[];

  @ApiPropertyOptional()
  verificationTime?: Date;
}

export class MerkleProofDto {
  @ApiProperty()
  filePath: string;

  @ApiProperty()
  fileHash: string;

  @ApiProperty()
  proofHashes: { hash: string; position: 'left' | 'right' }[];

  @ApiProperty()
  rootHash: string;

  @ApiProperty()
  proofValid: boolean;
}

export class CustodyChainDto {
  @ApiProperty({ type: [Object] })
  events: {
    eventId: string;
    action: string;
    actorId: string;
    actorType: string;
    actorName: string;
    timestamp: Date;
    ipAddress: string | null;
    location: string | null;
    details: Record<string, any>;
    previousEventHash: string | null;
    eventHash: string;
  }[];

  @ApiProperty()
  chainValid: boolean;

  @ApiPropertyOptional()
  brokenLinks?: { fromEvent: string; toEvent: string; reason: string }[];
}
