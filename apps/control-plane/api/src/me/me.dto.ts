import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;
}

export class MyInfoDto {
  id: string;
  name: string;
  slug: string;
  billingEmail: string;
  plan: string;
  status: string;
}
