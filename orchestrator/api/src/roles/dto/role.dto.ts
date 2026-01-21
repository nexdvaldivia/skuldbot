import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RoleType } from '../entities/role.entity';
import { PermissionCategory } from '../entities/permission.entity';

// ============================================================================
// ROLE DTOs
// ============================================================================

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'Role name must start with a letter and contain only lowercase letters, numbers, and underscores',
  })
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

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
  @MaxLength(100)
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

export class CloneRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'Role name must start with a letter and contain only lowercase letters, numbers, and underscores',
  })
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

// ============================================================================
// QUERY DTOs
// ============================================================================

export enum RoleSortField {
  NAME = 'name',
  DISPLAY_NAME = 'displayName',
  TYPE = 'type',
  CREATED_AT = 'createdAt',
  USER_COUNT = 'userCount',
}

export class ListRolesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RoleType)
  type?: RoleType;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  includePermissions?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  includeUserCount?: boolean;

  @IsOptional()
  @IsEnum(RoleSortField)
  sortBy?: RoleSortField;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class RoleResponseDto {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  type: RoleType;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class RoleDetailResponseDto extends RoleResponseDto {
  permissions: PermissionResponseDto[];
  userCount?: number;
}

export class PermissionResponseDto {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: PermissionCategory;
}

export class PermissionsByCategory {
  category: PermissionCategory;
  categoryDisplayName: string;
  permissions: PermissionResponseDto[];
}

// ============================================================================
// PERMISSION ASSIGNMENT DTOs
// ============================================================================

export class AssignPermissionsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  permissionIds: string[];
}

export class RemovePermissionsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  permissionIds: string[];
}

// ============================================================================
// ROLE COMPARISON DTO
// ============================================================================

export class CompareRolesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds: string[];
}

export class RoleComparisonResponseDto {
  roles: {
    id: string;
    name: string;
    displayName: string;
  }[];
  permissions: {
    id: string;
    name: string;
    displayName: string;
    category: PermissionCategory;
    assignedTo: string[]; // Role IDs that have this permission
  }[];
}
