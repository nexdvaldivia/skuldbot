import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

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

export class AddPaymentMethodDto {
  @IsString()
  @Length(3, 255)
  paymentMethodId: string;

  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class SetDefaultPaymentMethodDto {
  @IsString()
  @Length(3, 255)
  paymentMethodId: string;
}

export class AcceptMyContractDto {
  @IsString()
  @Length(2, 120)
  templateType: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  contractId?: string;
}

export class UpdateMyNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  billingEmails?: boolean;

  @IsOptional()
  @IsBoolean()
  contractEmails?: boolean;

  @IsOptional()
  @IsBoolean()
  securityEmails?: boolean;
}

export enum AddonBillingCycle {
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
}

export class AddMyAddonDto {
  @IsOptional()
  @IsEnum(AddonBillingCycle)
  billingCycle?: AddonBillingCycle;
}

export class UpdateMyUserProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;
}

export class UploadMyAvatarDto {
  @IsString()
  @Length(1, 120)
  contentType: string;

  @IsString()
  @Length(16, 2_800_000)
  contentBase64: string;
}

export class SetMyRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleIds: string[];
}
