import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsUUID,
} from 'class-validator';
import {
  TenantEnvironment,
  TenantDeploymentType,
  TenantStatus,
} from '../entities/tenant.entity';

export class CreateTenantDto {
  @IsUUID()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsEnum(TenantEnvironment)
  @IsOptional()
  environment?: TenantEnvironment;

  @IsEnum(TenantDeploymentType)
  @IsOptional()
  deploymentType?: TenantDeploymentType;

  @IsString()
  @IsOptional()
  region?: string;
}

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsEnum(TenantEnvironment)
  @IsOptional()
  environment?: TenantEnvironment;

  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;

  @IsString()
  @IsOptional()
  apiUrl?: string;

  @IsString()
  @IsOptional()
  uiUrl?: string;
}

export class TenantResponseDto {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  environment: TenantEnvironment;
  deploymentType: TenantDeploymentType;
  status: TenantStatus;
  region: string | null;
  apiUrl: string | null;
  uiUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TenantDetailResponseDto extends TenantResponseDto {
  dbHost: string | null;
  dbPort: number | null;
  dbName: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  activeLicenseId: string | null;
}
