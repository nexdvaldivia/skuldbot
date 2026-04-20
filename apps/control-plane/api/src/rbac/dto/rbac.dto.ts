import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CpRoleScopeType } from '../entities/cp-role.entity';

export class ListRolesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CpRoleScopeType)
  scopeType?: CpRoleScopeType;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includePermissions?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeUserCount?: boolean;
}

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Role name must start with a letter and contain only lowercase letters, numbers, and underscores',
  })
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(CpRoleScopeType)
  scopeType?: CpRoleScopeType;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  permissionIds: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  permissionIds?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class AssignUserRolesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds: string[];
}

export class PermissionResponseDto {
  id: string;
  code: string;
  label: string;
  category: string;
  description: string | null;
}

export class RoleResponseDto {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  scopeType: CpRoleScopeType;
  clientId: string | null;
  clientName?: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions?: PermissionResponseDto[];
  userCount?: number;
  createdAt: Date;
  updatedAt: Date;
}
