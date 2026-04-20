import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsArray,
  IsInt,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole, UserStatus } from '../entities/user.entity';

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  roleIds?: string[];
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  roleIds?: string[];
}

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

export class UploadUserAvatarDto {
  @IsString()
  @Matches(/^image\/(png|jpeg|jpg|webp)$/)
  contentType: string;

  @IsString()
  @MaxLength(5_000_000)
  contentBase64: string;
}

export class UserStatsResponseDto {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  byRole: Record<string, number>;
}

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  roles?: Array<{
    id: string;
    name: string;
    displayName: string;
  }>;
  status: UserStatus;
  clientId: string | null;
  clientName: string | null;
  lastLoginAt: Date | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserLoginHistoryResponseDto {
  id: string;
  ip: string;
  userAgent: string | null;
  success: boolean;
  failureReason: string | null;
  createdAt: Date;
}
