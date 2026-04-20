import { Transform, Type } from 'class-transformer';
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
import {
  ContractRequirementAction,
  ContractTemplateStatus,
} from '../entities/contract-domain.enums';

const toCodeArray = ({
  value,
}: {
  value: string[] | string | null | undefined;
}): string[] | undefined => {
  if (value == null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return undefined;
};

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

export class GetRequiredContractsQueryDto {
  @IsString()
  @MaxLength(80)
  planTier: string;

  @IsOptional()
  @Transform(toCodeArray)
  @IsArray()
  @IsString({ each: true })
  addonCodes?: string[];

  @IsOptional()
  @IsEnum(ContractRequirementAction)
  action?: ContractRequirementAction;
}

export class ValidateSubscriptionContractsDto extends GetRequiredContractsQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class ValidateVerticalContractsDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsString()
  @MaxLength(120)
  verticalSlug: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  planTier?: string;

  @IsOptional()
  @IsEnum(ContractRequirementAction)
  action?: ContractRequirementAction;
}

export class GetRequiredContractsForVerticalQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  planTier?: string;

  @IsOptional()
  @IsEnum(ContractRequirementAction)
  action?: ContractRequirementAction;
}

export class ValidateAddonContractsDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsString()
  @MaxLength(120)
  addonCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  planTier?: string;

  @IsOptional()
  @IsEnum(ContractRequirementAction)
  action?: ContractRequirementAction;
}

export class ContractRequirementTemplateSummaryDto {
  templateId: string;
  templateKey: string;
  title: string;
  status: ContractTemplateStatus;
  contractTypeCode: string | null;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
}

export class ContractValidationResponseDto {
  valid: boolean;
  clientId: string;
  action: ContractRequirementAction;
  requiredContractTypes: string[];
  presentContractTypes: string[];
  missingContractTypes: string[];
  requiredContracts: ContractRequirementTemplateSummaryDto[];
  missingContracts: ContractRequirementTemplateSummaryDto[];
}

export class RenderContractForClientResponseDto {
  templateId: string;
  templateKey: string;
  versionId: string;
  versionNumber: number;
  clientId: string;
  clientName: string;
  renderedHtml: string;
  variables: Record<string, unknown>;
  missingRequired: string[];
  unresolved: string[];
  renderedAt: string;
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
