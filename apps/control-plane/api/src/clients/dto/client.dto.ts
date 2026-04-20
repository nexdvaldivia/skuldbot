import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

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
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
