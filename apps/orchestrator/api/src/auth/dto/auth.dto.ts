import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsBoolean,
  IsUUID,
  IsArray,
  IsIP,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Password requirements for enterprise security:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

const PASSWORD_MESSAGE =
  'Password must be at least 12 characters with uppercase, lowercase, number, and special character';

// ============================================================================
// LOGIN DTOs
// ============================================================================

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsString()
  mfaCode?: string;

  @IsOptional()
  @IsString()
  backupCode?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId: string;
    roles: string[];
    mfaEnabled: boolean;
  };
}

export class MfaRequiredResponseDto {
  mfaRequired: true;
  mfaMethod: 'totp' | 'webauthn' | 'backup';
  sessionToken: string; // Temporary token to complete MFA
}

// ============================================================================
// REGISTRATION DTOs
// ============================================================================

export class RegisterDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  invitationToken?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  organizationName?: string;
}

export class RegisterResponseDto {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  message: string;
  verificationRequired: boolean;
}

// ============================================================================
// TOKEN DTOs
// ============================================================================

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// ============================================================================
// PASSWORD DTOs
// ============================================================================

export class ForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

// ============================================================================
// EMAIL VERIFICATION DTOs
// ============================================================================

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ResendVerificationDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}

// ============================================================================
// MFA DTOs
// ============================================================================

export class EnableMfaDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class EnableMfaResponseDto {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class VerifyMfaDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'MFA code must be 6 digits' })
  code: string;
}

export class DisableMfaDto {
  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'MFA code must be 6 digits' })
  code: string;
}

export class RegenerateBackupCodesDto {
  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'MFA code must be 6 digits' })
  code: string;
}

// ============================================================================
// SESSION DTOs
// ============================================================================

export class SessionResponseDto {
  id: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  lastActiveAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

export class RevokeSessionDto {
  @IsUUID()
  sessionId: string;
}

export class RevokeAllSessionsDto {
  @IsOptional()
  @IsBoolean()
  exceptCurrent?: boolean;
}

// ============================================================================
// API KEY DTOs
// ============================================================================

export enum ApiKeyScope {
  BOTS_READ = 'bots:read',
  BOTS_WRITE = 'bots:write',
  BOTS_EXECUTE = 'bots:execute',
  RUNS_READ = 'runs:read',
  RUNS_WRITE = 'runs:write',
  RUNNERS_READ = 'runners:read',
  RUNNERS_WRITE = 'runners:write',
  SCHEDULES_READ = 'schedules:read',
  SCHEDULES_WRITE = 'schedules:write',
  WEBHOOKS = 'webhooks',
}

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  scopes: ApiKeyScope[];

  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  allowedIps?: string[];

  @IsOptional()
  expiresAt?: Date;

  @IsOptional()
  @IsEnum(['live', 'test'])
  environment?: 'live' | 'test';
}

export class CreateApiKeyResponseDto {
  id: string;
  name: string;
  key: string; // Only shown once!
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
  warning: string;
}

export class ApiKeyResponseDto {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  allowedIps: string[];
  lastUsedAt: Date | null;
  usageCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

// ============================================================================
// IMPERSONATION DTOs (Admin only)
// ============================================================================

export class ImpersonateUserDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ImpersonateResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  impersonating: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  originalUser: {
    id: string;
    email: string;
  };
}

// ============================================================================
// SSO DTOs
// ============================================================================

export class SamlCallbackDto {
  @IsString()
  SAMLResponse: string;

  @IsOptional()
  @IsString()
  RelayState?: string;
}

export class OidcCallbackDto {
  @IsString()
  code: string;

  @IsString()
  state: string;
}

export class SsoInitiateDto {
  @IsString()
  provider: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;
}
