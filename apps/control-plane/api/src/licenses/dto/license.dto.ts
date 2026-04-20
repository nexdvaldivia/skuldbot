import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsObject,
  IsNumber,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { LicenseFeatures } from '../entities/license.entity';

export class CreateLicenseDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MaxLength(80)
  type: string;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validUntil: string;

  @IsObject()
  @IsOptional()
  features?: Partial<LicenseFeatures>;
}

export class UpdateLicenseDto {
  @IsString()
  @IsOptional()
  @MaxLength(80)
  status?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsObject()
  @IsOptional()
  features?: Partial<LicenseFeatures>;
}

export class ValidateLicenseDto {
  @IsString()
  key: string;
}

export class LicenseResponseDto {
  id: string;
  tenantId: string;
  key: string;
  type: string;
  status: string;
  validFrom: Date;
  validUntil: Date;
  isValid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class LicenseDetailResponseDto extends LicenseResponseDto {
  features: LicenseFeatures;
  lastValidatedAt: Date | null;
  metadata: Record<string, unknown>;
}

export class LicenseValidationResponseDto {
  valid: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  type: string | null;
  features: LicenseFeatures | null;
  expiresAt: Date | null;
  message: string;
}

export class LicenseTenantStatusResponseDto {
  tenantId: string;
  hasLicense: boolean;
  licenseId: string | null;
  type: string | null;
  status: string;
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  daysRemaining: number | null;
  quotaState: string;
  features: LicenseFeatures | null;
}

export class FeaturesDto {
  @IsNumber()
  @IsOptional()
  maxBots?: number;

  @IsNumber()
  @IsOptional()
  maxRunners?: number;

  @IsNumber()
  @IsOptional()
  maxConcurrentRuns?: number;

  @IsNumber()
  @IsOptional()
  maxRunsPerMonth?: number;

  @IsBoolean()
  @IsOptional()
  aiAssistant?: boolean;

  @IsBoolean()
  @IsOptional()
  customNodes?: boolean;

  @IsBoolean()
  @IsOptional()
  apiAccess?: boolean;

  @IsBoolean()
  @IsOptional()
  sso?: boolean;

  @IsBoolean()
  @IsOptional()
  auditLog?: boolean;

  @IsBoolean()
  @IsOptional()
  prioritySupport?: boolean;
}

export class EntitlementCheckDto {
  @IsString()
  tenantId: string;

  @IsString()
  resourceType: string;

  @IsNumber()
  @IsOptional()
  requestedCount?: number;
}

export class QuotaCheckDto {
  @IsString()
  tenantId: string;

  @IsString()
  resourceType: string;

  @IsNumber()
  @IsOptional()
  requestedAmount?: number;

  @IsString()
  @IsOptional()
  period?: string;
}

export class QuotaConsumeDto {
  @IsString()
  tenantId: string;

  @IsString()
  resourceType: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  period?: string;
}

export class EntitlementCheckResponseDto {
  tenantId: string;
  resourceType: string;
  requestedCount: number;
  allowed: boolean;
  reason: string;
  licenseType: string | null;
  licenseStatus: string;
  limit: number | null;
  currentUsage: number;
  projectedUsage: number;
  state: string;
}

export class QuotaCheckResponseDto {
  tenantId: string;
  resourceType: string;
  period: string;
  limit: number | null;
  currentUsage: number;
  requestedAmount: number;
  projectedUsage: number;
  warningThresholdPercent: number;
  graceThresholdPercent: number;
  state: string;
  allowed: boolean;
  reason: string;
}

export class QuotaConsumeResponseDto extends QuotaCheckResponseDto {
  consumed: boolean;
}

export class RuntimeDecisionDto {
  id: string;
  tenantId: string;
  decisionType: 'entitlement_check' | 'quota_check' | 'quota_consume';
  resourceType: string;
  requested: number;
  projected: number;
  limit: number | null;
  period: string | null;
  state: string | null;
  allowed: boolean;
  consumed: boolean | null;
  reason: string | null;
  orchestratorId: string | null;
  traceId: string | null;
  createdAt: Date;
}

export class UpdateLicenseTemplateDto {
  @IsObject()
  features: Partial<LicenseFeatures>;
}

export class LicenseTemplateResponseDto {
  licenseType: string;
  features: LicenseFeatures;
}
