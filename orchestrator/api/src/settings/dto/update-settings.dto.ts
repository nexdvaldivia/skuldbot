import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  organizationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  organizationSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoUrl?: string;

  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}
