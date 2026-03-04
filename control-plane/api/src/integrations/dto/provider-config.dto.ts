import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IntegrationType } from '../../common/interfaces/integration.interface';

export class ListProviderConfigsQueryDto {
  @IsOptional()
  @IsEnum(IntegrationType)
  type?: IntegrationType;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class CreateOrUpdateProviderConfigDto {
  @IsEnum(IntegrationType)
  type: IntegrationType;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateProviderConfigDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

