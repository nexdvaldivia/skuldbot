import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateContractLegalInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(220)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  legalAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  legalAddressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  legalPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  representativeTitle?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  representativeEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  websiteUrl?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supportPhone?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ContractLegalInfoResponseDto {
  id: string;
  legalName: string | null;
  tradeName: string | null;
  legalAddressLine1: string | null;
  legalAddressLine2: string | null;
  legalCity: string | null;
  legalState: string | null;
  legalPostalCode: string | null;
  legalCountry: string | null;
  representativeName: string | null;
  representativeTitle: string | null;
  representativeEmail: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  metadata: Record<string, unknown>;
  updatedAt: Date;
}

export class CreateContractSignatoryDto {
  @IsString()
  @MaxLength(180)
  fullName: string;

  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  policies?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateContractSignatoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  policies?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ContractSignatoryResponseDto {
  id: string;
  fullName: string;
  email: string;
  title: string | null;
  isActive: boolean;
  isDefault: boolean;
  policies: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class ListContractSignatoriesQueryDto {
  @IsOptional()
  @IsBoolean()
  onlyActive?: boolean;
}

export class BulkUpsertContractSignatoriesDto {
  @IsArray()
  signatories: CreateContractSignatoryDto[];
}

export class ContractLookupsGroupItemDto {
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
}

export class ContractLookupsResponseDto {
  contractTypes: ContractLookupsGroupItemDto[];
  jurisdictions: ContractLookupsGroupItemDto[];
  complianceFrameworks: ContractLookupsGroupItemDto[];
}

export class RemoveContractSignatoryQueryDto {
  @IsOptional()
  @IsUUID()
  replacementId?: string;
}
