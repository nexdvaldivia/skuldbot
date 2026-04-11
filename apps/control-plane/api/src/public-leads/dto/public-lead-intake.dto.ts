import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum PublicLeadSource {
  CONTACT_FORM = 'contact_form',
  DEMO_REQUEST = 'demo_request',
  NEWSLETTER = 'newsletter',
  SUPPORT_REQUEST = 'support_request',
  PARTNERSHIP_REQUEST = 'partnership_request',
}

export class PublicLeadIntakeDto {
  @IsUUID()
  tenantId: string;

  @IsEnum(PublicLeadSource)
  source: PublicLeadSource;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  fullName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(180)
  company?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  inquiryType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  employees?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(4000)
  message?: string;

  @IsISO8601()
  @IsOptional()
  sourceTimestamp?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export interface PublicLeadIntakeResult {
  leadId: string;
  deduplicated: boolean;
  intakeCount: number;
  receivedAt: string;
}
