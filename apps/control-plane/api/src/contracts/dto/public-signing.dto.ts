import {
  IsIn,
  IsIP,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ContractEnvelopeRecipientStatus,
  ContractEnvelopeStatus,
  ContractSignatureType,
} from '../entities/contract-domain.enums';

export class PublicSigningDocumentDto {
  id: string;
  name: string;
  contentType: string;
  sortOrder: number;
  previewUrl: string;
  finalUrl: string;
  signedUrl: string;
}

export class PublicSigningRecipientDto {
  id: string;
  email: string;
  fullName: string;
  roleLabel: string;
  status: ContractEnvelopeRecipientStatus;
  sortOrder: number;
}

export class PublicSigningOtpStatusDto {
  emailRequired: boolean;
  smsRequired: boolean;
  emailVerified: boolean;
  smsVerified: boolean;
  canSign: boolean;
  verificationWindowMinutes: number;
}

export class PublicSigningPageResponseDto {
  envelopeId: string;
  subject: string;
  status: ContractEnvelopeStatus;
  expiresAt: Date | null;
  sentAt: Date | null;
  recipient: PublicSigningRecipientDto;
  otherRecipients: PublicSigningRecipientDto[];
  documents: PublicSigningDocumentDto[];
  canSign: boolean;
  alreadySigned: boolean;
  alreadyDeclined: boolean;
  isExpired: boolean;
  otpStatus: PublicSigningOtpStatusDto;
  clientInfo: Record<string, unknown> | null;
}

export class PublicMarkViewedResponseDto {
  success: boolean;
  viewedAt: Date | null;
}

export class UpdatePublicClientInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalEntityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;
}

export class PublicOtpStatusResponseDto {
  valid: boolean;
  emailRequired: boolean;
  smsRequired: boolean;
  emailVerified: boolean;
  smsVerified: boolean;
  canSign: boolean;
  verificationWindowMinutes: number;
  error: string | null;
}

export class PublicOtpSimpleResponseDto {
  success: boolean;
  message: string;
}

export class PublicRequestEmailOtpResponseDto extends PublicOtpSimpleResponseDto {
  maskedEmail: string | null;
}

export class PublicRequestSmsOtpDto {
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone: string;
}

export class PublicRequestSmsOtpResponseDto extends PublicOtpSimpleResponseDto {
  maskedPhone: string | null;
}

export class PublicVerifyOtpDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code: string;
}

export class PublicSignRequestDto {
  @IsIn([ContractSignatureType.TYPED, ContractSignatureType.DRAWN, ContractSignatureType.UPLOAD])
  signatureType: ContractSignatureType;

  @IsString()
  @IsNotEmpty()
  signatureValue: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class PublicSignResponseDto {
  success: boolean;
  message: string;
  envelopeCompleted: boolean;
  signedAt: Date | null;
}

export class PublicDeclineRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;
}

export class PublicDeclineResponseDto {
  success: boolean;
  message: string;
  declinedAt: Date | null;
}
