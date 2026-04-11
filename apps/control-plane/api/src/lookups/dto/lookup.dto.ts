import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertLookupValueDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(120)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
