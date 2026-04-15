import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../entities/user.entity';

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
