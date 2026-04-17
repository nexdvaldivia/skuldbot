import { Type } from 'class-transformer';
import {
  IsArray,
  IsBase64,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsIP,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ContractAcceptanceMethod,
  ContractEnvelopeRecipientStatus,
  ContractEnvelopeStatus,
  ContractSignatureType,
} from '../entities/contract-domain.enums';

const OFFLINE_EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;
const OFFLINE_EVIDENCE_MAX_BASE64_LENGTH = Math.ceil((OFFLINE_EVIDENCE_MAX_BYTES * 4) / 3) + 4;
const OFFLINE_EVIDENCE_ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
] as const;

export class ContractEnvelopeRecipientResponseDto {
  id: string;
  signerId: string | null;
  email: string;
  fullName: string;
  roleLabel: string;
  sortOrder: number;
  status: ContractEnvelopeRecipientStatus;
  otpVerifiedAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  declinedAt: Date | null;
  signatureType: ContractSignatureType | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
}

export class ContractEnvelopeResponseDto {
  id: string;
  contractId: string | null;
  templateId: string | null;
  templateVersionId: string | null;
  clientId: string;
  tenantId: string | null;
  subject: string;
  status: ContractEnvelopeStatus;
  externalProvider: string | null;
  externalEnvelopeId: string | null;
  expiresAt: Date | null;
  sentAt: Date | null;
  completedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  metadata: Record<string, unknown>;
  recipients: ContractEnvelopeRecipientResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class EnvelopeStatusSummaryDto {
  envelopeId: string;
  status: ContractEnvelopeStatus;
  recipientCounts: Record<string, number>;
  totalRecipients: number;
  completedRecipients: number;
  declinedRecipients: number;
  pendingRecipients: number;
  updatedAt: Date;
}

export class EnvelopeDeliveryHistoryItemDto {
  id: string;
  envelopeId: string;
  recipientId: string | null;
  eventType: string;
  eventSource: string | null;
  eventPayload: Record<string, unknown>;
  occurredAt: Date;
}

export class EnvelopeDeliveryHistoryResponseDto {
  envelopeId: string;
  events: EnvelopeDeliveryHistoryItemDto[];
}

export class SigningDocumentResponseDto {
  id: string;
  envelopeId: string;
  name: string;
  contentType: string;
  contentHash: string;
  sortOrder: number;
  templateId: string | null;
  templateVersionId: string | null;
  variables: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateEnvelopeRecipientDto {
  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateEnvelopeDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  templateVersionId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(220)
  subject: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEnvelopeRecipientDto)
  recipients: CreateEnvelopeRecipientDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEnvelopeFromTemplatesDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  subject?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  templateIds: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEnvelopeRecipientDto)
  recipients: CreateEnvelopeRecipientDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEnvelopeDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(220)
  subject?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReassignEnvelopeRecipientDto {
  @IsUUID()
  recipientId: string;

  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleLabel?: string;
}

export class ResendEnvelopeDto {
  @IsOptional()
  @IsUUID()
  recipientId?: string;
}

export class UploadEnvelopeOfflineEvidenceDto {
  @IsBase64()
  @MaxLength(OFFLINE_EVIDENCE_MAX_BASE64_LENGTH)
  contentBase64: string;

  @IsOptional()
  @IsString()
  @IsIn(OFFLINE_EVIDENCE_ALLOWED_CONTENT_TYPES)
  @MaxLength(160)
  contentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class CompleteEnvelopeOfflineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  acceptedByName: string;

  @IsEmail()
  @MaxLength(180)
  acceptedByEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  acceptedByTitle?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;
}

export class CreateSigningDocumentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contentType?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  templateVersionId?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateSigningDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contentType?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListSentContractsQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(ContractEnvelopeStatus)
  status?: ContractEnvelopeStatus;
}

export class ContractAcceptanceResponseDto {
  id: string;
  contractId: string;
  envelopeId: string | null;
  templateId: string | null;
  templateVersionId: string | null;
  clientId: string;
  tenantId: string | null;
  acceptedByName: string;
  acceptedByEmail: string;
  acceptedByTitle: string | null;
  acceptanceMethod: ContractAcceptanceMethod;
  ipAddress: string;
  userAgent: string | null;
  acceptedAt: Date;
  contentSnapshotHash: string | null;
  contentSnapshot: string | null;
  signatureHash: string | null;
  countersignedAt: Date | null;
  countersignedBy: string | null;
  skuldSignatoryId: string | null;
  skuldSignatoryName: string | null;
  skuldSignatoryTitle: string | null;
  skuldSignatoryEmail: string | null;
  skuldSignatureHash: string | null;
  skuldResolutionSource: string | null;
  skuldResolvedAt: Date | null;
  signedPdfUrl: string | null;
  signedPdfHash: string | null;
  variablesUsed: Record<string, unknown> | null;
  effectiveDate: Date;
  expirationDate: Date | null;
  supersededById: string | null;
  revokedAt: Date | null;
  revocationReason: string | null;
  evidence: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class ListContractAcceptancesQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;
}

export class AcceptContractDto {
  @IsUUID()
  contractId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  acceptedByName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  acceptedByEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  acceptedByTitle?: string;

  @IsOptional()
  @IsEnum(ContractAcceptanceMethod)
  acceptanceMethod?: ContractAcceptanceMethod;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsString()
  signatureData?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}

export class CountersignAcceptanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  countersignedBy?: string;
}

export class RevokeAcceptanceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}

export class ContractEvidenceVerificationResponseDto {
  acceptanceId: string;
  contentSnapshotHashExpected: string | null;
  contentSnapshotHashActual: string | null;
  contentSnapshotHashMatches: boolean;
  signatureHashExpected: string | null;
  signatureHashActual: string | null;
  signatureHashMatches: boolean | null;
  signedPdfUrl: string | null;
  signedPdfHash: string | null;
  signedPdfHashValidFormat: boolean;
  envelopeId: string | null;
  issues: string[];
  verified: boolean;
}

export class ClientContractStatusItemDto {
  acceptanceId: string;
  templateId: string | null;
  templateVersionId: string | null;
  templateName: string | null;
  version: number | null;
  acceptedAt: string;
  acceptedBy: string;
}

export class ClientContractStatusResponseDto {
  clientId: string;
  acceptedContracts: Record<string, ClientContractStatusItemDto[]>;
  totalActiveAcceptances: number;
}

export class RenderedAcceptanceResponseDto {
  acceptanceId: string;
  contractId: string;
  templateId: string | null;
  templateVersionId: string | null;
  templateName: string | null;
  templateVersion: number | null;
  clientId: string;
  acceptedAt: string;
  acceptedByName: string;
  acceptedByEmail: string;
  acceptedByTitle: string | null;
  contentSnapshot: string | null;
  contentSnapshotHash: string | null;
  variablesUsed: Record<string, unknown> | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

export class VerifyEnvelopeOtpDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code: string;
}

export class SignEnvelopeRecipientDto {
  @IsEnum(ContractSignatureType)
  signatureType: ContractSignatureType;

  @IsString()
  @IsNotEmpty()
  signatureValue: string;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class DeclineEnvelopeRecipientDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class ContractsLookupResponseDto {
  contractTypes: Array<Record<string, unknown>>;
  jurisdictions: Array<Record<string, unknown>>;
  complianceFrameworks: Array<Record<string, unknown>>;
}

export class ContractLookupsGroupedResponseDto {
  values: ContractsLookupResponseDto;
}

export class UpdateEnvelopeRecipientStatusDto {
  @IsEnum(ContractEnvelopeRecipientStatus)
  status: ContractEnvelopeRecipientStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SigningAuditTrailEntryDto {
  id: string;
  envelopeId: string;
  recipientId: string | null;
  eventType: string;
  eventSource: string | null;
  eventPayload: Record<string, unknown>;
  occurredAt: Date;
}

export class SigningAuditTrailResponseDto {
  @IsArray()
  entries: SigningAuditTrailEntryDto[];
}
