import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    roles?: string[];
    clientId: string | null;
    permissions: string[];
  };
}

export class MfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code: string;
}

export class EnableMfaResponseDto {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

export class VerifyMfaResponseDto {
  verified: true;
  method: 'totp' | 'backup_code';
}

export class DisableMfaResponseDto {
  disabled: true;
}

export class RegenerateBackupCodesResponseDto {
  backupCodes: string[];
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @IsString()
  @MinLength(12)
  newPassword: string;
}
