import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ClientAddressType } from '../entities/client-address.entity';

const ADDRESS_TYPES = Object.values(ClientAddressType);

export class CreateClientAddressDto {
  @IsString()
  @IsIn(ADDRESS_TYPES)
  addressType: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClientAddressDto {
  @IsOptional()
  @IsString()
  @IsIn(ADDRESS_TYPES)
  addressType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateClientAddressesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientAddressDto)
  addresses: CreateClientAddressDto[];
}

export class ListClientAddressesQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(ADDRESS_TYPES)
  addressType?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;
}

export class DeleteClientAddressQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hardDelete?: boolean;
}

export class ClientAddressResponseDto {
  id: string;
  clientId: string;
  addressType: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  country: string;
  isPrimary: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientAddressListResponseDto {
  addresses: ClientAddressResponseDto[];
  total: number;
}

export class ClientAddressBulkResponseDto {
  created: ClientAddressResponseDto[];
  errors: string[];
}
