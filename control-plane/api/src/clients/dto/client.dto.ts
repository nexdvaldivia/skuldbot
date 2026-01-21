import {
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ClientPlan, ClientStatus } from '../entities/client.entity';

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

  @IsEnum(ClientPlan)
  @IsOptional()
  plan?: ClientPlan;
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

  @IsEnum(ClientPlan)
  @IsOptional()
  plan?: ClientPlan;

  @IsEnum(ClientStatus)
  @IsOptional()
  status?: ClientStatus;
}

export class ClientResponseDto {
  id: string;
  name: string;
  slug: string;
  plan: ClientPlan;
  status: ClientStatus;
  billingEmail: string;
  tenantsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientDetailResponseDto extends ClientResponseDto {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
