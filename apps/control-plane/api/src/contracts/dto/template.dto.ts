import { Type } from 'class-transformer';
import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsEnum,
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

export class ListContractTemplatesQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean;
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

export class CreateContractTemplateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeLog?: string;
}

export class TemplateVariableItemDto {
  key: string;
  label: string | null;
  description: string | null;
  type: string | null;
  required: boolean;
  defaultValue: unknown;
  source: 'template' | 'system';
  category: string;
}

export class ContractTemplateVariablesResponseDto {
  templateId: string;
  templateKey: string;
  versionId: string;
  variables: TemplateVariableItemDto[];
}

export class TemplateVariableCatalogCategoryDto {
  category: string;
  label: string;
  variables: TemplateVariableItemDto[];
}

export class ContractTemplateVariableCatalogResponseDto {
  templateId: string;
  templateKey: string;
  categories: TemplateVariableCatalogCategoryDto[];
}

export enum TemplateLintSeverity {
  ERROR = 'error',
  WARNING = 'warning',
}

export class TemplateLintIssueDto {
  code: string;
  severity: TemplateLintSeverity;
  message: string;
  path: string | null;
}

export class ContractTemplateLintResponseDto {
  templateId: string;
  templateKey: string;
  versionId: string;
  valid: boolean;
  issues: TemplateLintIssueDto[];
}

export class ResolveTemplateVariablesDto {
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class ResolveTemplateVariablesResponseDto {
  templateId: string;
  templateKey: string;
  versionId: string;
  resolved: Record<string, unknown>;
  missingRequired: string[];
  unresolved: string[];
}

export class UploadTemplatePdfDto {
  @IsBase64()
  contentBase64: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;
}

export class ContractTemplatePdfPreviewResponseDto {
  templateId: string;
  templateKey: string;
  versionId: string;
  hasPdf: boolean;
  contentType: string | null;
  uploadedAt: Date | null;
  signedUrl: string | null;
}

export enum TemplateSignatureFieldType {
  SIGNATURE = 'signature',
  INITIALS = 'initials',
  DATE = 'date',
  TEXT = 'text',
  CHECKBOX = 'checkbox',
}

export class TemplateSignatureFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  id: string;

  @IsEnum(TemplateSignatureFieldType)
  type: TemplateSignatureFieldType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variableKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsObject()
  placement?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class UpdateTemplateSignatureFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateSignatureFieldDto)
  fields: TemplateSignatureFieldDto[];
}

export class ContractTemplateSignatureFieldsResponseDto {
  templateId: string;
  templateKey: string;
  versionId: string;
  fields: TemplateSignatureFieldDto[];
}

export class ListContractTemplatesGroupedQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean;
}

export class ListTemplateVersionChainQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean;
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

export class ContractTemplateVersionSummaryDto {
  id: string;
  versionNumber: number;
  status: ContractTemplateStatus;
  publishedAt: Date | null;
  deprecatedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
}

export class ContractTemplateGroupedResponseDto {
  id: string;
  templateKey: string;
  title: string;
  description: string | null;
  status: ContractTemplateStatus;
  totalVersions: number;
  activeVersion: ContractTemplateVersionSummaryDto | null;
  draftVersion: ContractTemplateVersionSummaryDto | null;
  latestVersion: ContractTemplateVersionSummaryDto | null;
  updatedAt: Date;
}

export class ContractTemplateGroupedListResponseDto {
  templates: ContractTemplateGroupedResponseDto[];
  total: number;
}

export class ContractTemplateVersionChainNodeDto {
  id: string;
  versionNumber: number;
  status: ContractTemplateStatus;
  supersedesVersionId: string | null;
  publishedAt: Date | null;
  deprecatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ContractTemplateVersionChainResponseDto {
  templateId: string;
  templateKey: string;
  title: string;
  versions: ContractTemplateVersionChainNodeDto[];
  integrity: {
    hasBrokenLinks: boolean;
    brokenNodeIds: string[];
    hasVersionGaps: boolean;
    expectedNextVersion: number;
  };
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
