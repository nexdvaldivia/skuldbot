import {
  IsString,
  IsEmail,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserStatus } from '../entities/user.entity';

/**
 * Password requirements (same as auth DTOs).
 */
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

const PASSWORD_MESSAGE =
  'Password must be at least 12 characters with uppercase, lowercase, number, and special character';

// ============================================================================
// CREATE / UPDATE DTOs
// ============================================================================

export class CreateUserDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

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
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsBoolean()
  sendInvitation?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateUserRolesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds: string[];
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminResetPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  requireChange?: boolean;
}

// ============================================================================
// QUERY DTOs
// ============================================================================

export enum UserSortField {
  EMAIL = 'email',
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  STATUS = 'status',
  CREATED_AT = 'createdAt',
  LAST_LOGIN_AT = 'lastLoginAt',
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsEnum(UserSortField)
  sortBy?: UserSortField;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string;
  department?: string;
  phone?: string;
  avatarUrl?: string;
  status: UserStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  roles: {
    id: string;
    name: string;
    displayName: string;
  }[];
  timezone: string;
  locale: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class UserDetailResponseDto extends UserResponseDto {
  tenantId: string;
  authProvider: string;
  emailVerifiedAt?: Date;
  mfaEnabledAt?: Date;
  lastLoginIp?: string;
  failedLoginAttempts: number;
  lockoutUntil?: Date;
  passwordChangedAt?: Date;
  permissions: string[];
}

export class PaginatedUsersResponseDto {
  users: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// INVITATION DTOs
// ============================================================================

export class InviteUserDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  expiresAt?: Date;
}

export class InvitationResponseDto {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedBy: {
    id: string;
    email: string;
    fullName: string;
  };
  roles: {
    id: string;
    name: string;
  }[];
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
}

export class BulkInviteUsersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteUserDto)
  invitations: InviteUserDto[];
}

export class BulkInviteResponseDto {
  successful: {
    email: string;
    invitationId: string;
  }[];
  failed: {
    email: string;
    reason: string;
  }[];
}

// ============================================================================
// PROFILE DTOs (for authenticated user)
// ============================================================================

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class ProfileResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string;
  department?: string;
  phone?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  roles: {
    id: string;
    name: string;
    displayName: string;
  }[];
  permissions: string[];
  tenant: {
    id: string;
    name: string;
  };
  timezone: string;
  locale: string;
  lastLoginAt?: Date;
  createdAt: Date;
}
