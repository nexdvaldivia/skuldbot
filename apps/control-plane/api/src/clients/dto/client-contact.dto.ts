import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ClientContactType } from '../entities/client-contact.entity';

const CONTACT_TYPES = Object.values(ClientContactType);

export class CreateClientContactDto {
  @IsString()
  @IsIn(CONTACT_TYPES)
  contactType: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedinUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isContractSigner?: boolean;

  @IsOptional()
  @IsBoolean()
  isInstaller?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceiveMarketing?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceiveUpdates?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClientContactDto {
  @IsOptional()
  @IsString()
  @IsIn(CONTACT_TYPES)
  contactType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedinUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isContractSigner?: boolean;

  @IsOptional()
  @IsBoolean()
  isInstaller?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceiveMarketing?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceiveUpdates?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateClientContactsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientContactDto)
  contacts: CreateClientContactDto[];
}

export class ListClientContactsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(CONTACT_TYPES)
  contactType?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;
}

export class DeleteClientContactQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hardDelete?: boolean;
}

export class ClientContactResponseDto {
  id: string;
  clientId: string;
  contactType: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  mobile: string | null;
  jobTitle: string | null;
  department: string | null;
  linkedinUrl: string | null;
  isPrimary: boolean;
  isContractSigner: boolean;
  isInstaller: boolean;
  isActive: boolean;
  canReceiveMarketing: boolean;
  canReceiveUpdates: boolean;
  preferredLanguage: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientContactListResponseDto {
  contacts: ClientContactResponseDto[];
  total: number;
}

export class ClientContactBulkResponseDto {
  created: ClientContactResponseDto[];
  errors: string[];
}

export class ClientContactParamDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  contactId: string;
}
