import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ContractTemplateStatus } from '../entities/contract-domain.enums';

export class TemplateVariableDefinitionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  key: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;

  @IsOptional()
  required?: boolean;

  @IsOptional()
  defaultValue?: unknown;
}

export class CreateContractTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  templateKey: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsObject()
  documentJson?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDefinitionDto)
  variableDefinitions?: TemplateVariableDefinitionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeLog?: string;
}

export class UpdateContractTemplateDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsObject()
  documentJson?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDefinitionDto)
  variableDefinitions?: TemplateVariableDefinitionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeLog?: string;
}

export class PublishContractTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeLog?: string;
}

export class DeprecateContractTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ContractTemplateVersionResponseDto {
  id: string;
  templateId: string;
  versionNumber: number;
  status: ContractTemplateStatus;
  documentJson: Record<string, unknown>;
  variableDefinitions: Record<string, unknown>;
  renderedHtml: string | null;
  changeLog: string | null;
  supersedesVersionId: string | null;
  publishedAt: Date | null;
  deprecatedAt: Date | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class ContractTemplateResponseDto {
  id: string;
  templateKey: string;
  title: string;
  description: string | null;
  status: ContractTemplateStatus;
  activeVersionId: string | null;
  latestVersionNumber: number;
  metadata: Record<string, unknown>;
  versions: ContractTemplateVersionResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class SendTemplateSignerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleLabel?: string;
}

export class SendTemplateForSignatureDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  subject?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SendTemplateSignerDto)
  signers: SendTemplateSignerDto[];
}
