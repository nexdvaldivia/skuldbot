import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class ContractSignatorySummaryDto {
  id: string;
  name: string;
  title: string | null;
  email: string;
  isActive: boolean;
  isDefault: boolean;
  hasSignature: boolean;
}

export class ContractSignatoryPolicyResponseDto {
  id: string;
  contractType: string;
  contractTypeName: string | null;
  signatoryId: string;
  priority: number;
  isActive: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  signatory: ContractSignatorySummaryDto;
}

export class ContractSignatoryPolicyListResponseDto {
  policies: ContractSignatoryPolicyResponseDto[];
  total: number;
}

export class ContractSignatoryPolicyToggleResponseDto {
  success: boolean;
  policy: ContractSignatoryPolicyResponseDto;
}

export class ListContractSignatoryPoliciesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractType?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateContractSignatoryPolicyDto {
  @IsString()
  @MaxLength(80)
  contractType: string;

  @IsUUID()
  signatoryId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateContractSignatoryPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractType?: string;

  @IsOptional()
  @IsUUID()
  signatoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  clearValidFrom?: boolean;

  @IsOptional()
  @IsBoolean()
  clearValidTo?: boolean;

  @IsOptional()
  @IsBoolean()
  clearNotes?: boolean;
}

export class ContractSignatoryResolutionPreviewRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractType?: string;

  @IsOptional()
  @IsUUID()
  overrideSignatoryId?: string;

  @IsOptional()
  @IsBoolean()
  requireReady?: boolean;
}

export class ContractSignatoryResolutionPreviewResponseDto {
  contractType: string | null;
  overrideSignatoryId: string | null;
  resolutionSource: string;
  policyId: string | null;
  resolvedAt: Date;
  signatoryId: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  signatoryEmail: string | null;
  signatoryIsActive: boolean | null;
  hasSignature: boolean | null;
  signatureHash: string | null;
  ready: boolean;
  message: string;
}
