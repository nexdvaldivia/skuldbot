import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ContractAcceptanceMethod,
  ContractEnvelopeRecipientStatus,
  ContractEnvelopeStatus,
  ContractSignatureType,
} from '../entities/contract-domain.enums';

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
  acceptanceMethod: ContractAcceptanceMethod;
  ipAddress: string;
  userAgent: string | null;
  acceptedAt: Date;
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
