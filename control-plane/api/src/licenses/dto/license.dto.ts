import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsDateString,
  IsObject,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { LicenseType, LicenseStatus, LicenseFeatures } from '../entities/license.entity';

export class CreateLicenseDto {
  @IsUUID()
  tenantId: string;

  @IsEnum(LicenseType)
  type: LicenseType;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validUntil: string;

  @IsObject()
  @IsOptional()
  features?: Partial<LicenseFeatures>;
}

export class UpdateLicenseDto {
  @IsEnum(LicenseStatus)
  @IsOptional()
  status?: LicenseStatus;

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
  type: LicenseType;
  status: LicenseStatus;
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
  type: LicenseType | null;
  features: LicenseFeatures | null;
  expiresAt: Date | null;
  message: string;
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
