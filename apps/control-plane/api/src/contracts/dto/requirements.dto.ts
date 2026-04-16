import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ContractRequirementAction } from '../entities/contract-domain.enums';

export class ContractRequirementInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  planCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  addonCode?: string;

  @IsEnum(ContractRequirementAction)
  action: ContractRequirementAction;

  @IsString()
  @MaxLength(80)
  contractTypeCode: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ConfigureContractRequirementsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractRequirementInputDto)
  requirements: ContractRequirementInputDto[];
}

export class ListContractRequirementsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  planCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  addonCode?: string;

  @IsOptional()
  @IsEnum(ContractRequirementAction)
  action?: ContractRequirementAction;
}

export class ContractRequirementResponseDto {
  id: string;
  planCode: string | null;
  addonCode: string | null;
  action: ContractRequirementAction;
  contractTypeCode: string;
  isRequired: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class ResolveContractRequirementsDto {
  @IsString()
  @MaxLength(80)
  planCode: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addonCodes?: string[];

  @IsEnum(ContractRequirementAction)
  action: ContractRequirementAction;
}

export class ResolvedContractRequirementsResponseDto {
  action: ContractRequirementAction;
  contractTypeCodes: string[];
}

export class RecordContractAcceptanceDto {
  @IsUUID()
  contractId: string;

  @IsOptional()
  @IsUUID()
  envelopeId?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  templateVersionId?: string;

  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsString()
  @MaxLength(180)
  acceptedByName: string;

  @IsString()
  @MaxLength(180)
  acceptedByEmail: string;

  @IsString()
  @MaxLength(45)
  ipAddress: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
