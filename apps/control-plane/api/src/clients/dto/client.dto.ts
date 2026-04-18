import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClientDto {
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

  @IsEmail()
  billingEmail: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  plan?: string;
}

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  plan?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  status?: string;
}

export class ListClientsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  plan?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ClientResponseDto {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  billingEmail: string;
  tenantsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientDetailResponseDto extends ClientResponseDto {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  apiKeyPrefix: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export class RegenerateClientApiKeyResponseDto {
  status: 'success';
  message: string;
  oldKeyPrefix: string | null;
  newApiKey: string;
}

export class ClientGateStatusDto {
  key: string;
  passed: boolean;
  details: string;
}

export class ClientGatesResponseDto {
  clientId: string;
  overallPassed: boolean;
  gates: ClientGateStatusDto[];
}

export class ClientOverviewResponseDto {
  clientId: string;
  status: string;
  plan: string;
  tenantsTotal: number;
  tenantsActive: number;
  usersTotal: number;
  activeSubscriptions: number;
  hasApiKey: boolean;
  hasStripeCustomer: boolean;
}

export class ClientAuthorizationResponseDto {
  success: boolean;
  message: string;
  clientId: string;
  clientEmail: string;
  accessToken: string | null;
}

export class ResendAuthorizationQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  regenerateToken?: boolean;
}

export class DenyClientQueryDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}

export class SendClientContractsRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  templateTypes: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoSend?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
