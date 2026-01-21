import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/current-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Audit } from '../common/interceptors/audit.interceptor';
import { AuditCategory, AuditAction } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateRoleDto,
  UpdateRoleDto,
  CloneRoleDto,
  ListRolesQueryDto,
  RoleDetailResponseDto,
  PermissionsByCategory,
  AssignPermissionsDto,
  RemovePermissionsDto,
  CompareRolesDto,
  RoleComparisonResponseDto,
} from './dto/role.dto';

/**
 * Roles Controller.
 *
 * Provides REST API endpoints for role and permission management.
 *
 * Role endpoints:
 * - GET    /roles                         - List all roles
 * - GET    /roles/:id                     - Get role by ID
 * - POST   /roles                         - Create new role
 * - PATCH  /roles/:id                     - Update role
 * - DELETE /roles/:id                     - Delete role
 * - POST   /roles/:id/clone               - Clone an existing role
 *
 * Permission endpoints:
 * - GET    /roles/permissions             - List all available permissions
 * - POST   /roles/:id/permissions         - Assign permissions to role
 * - DELETE /roles/:id/permissions         - Remove permissions from role
 *
 * Comparison endpoints:
 * - POST   /roles/compare                 - Compare permissions across roles
 *
 * All endpoints are:
 * - Protected by JWT authentication
 * - Tenant-isolated
 * - Permission-controlled
 * - Audit logged
 */
@Controller('roles')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // ============================================================================
  // PERMISSIONS (Global - must come before :id routes)
  // ============================================================================

  @Get('permissions')
  @RequirePermissions('roles:read')
  async getAllPermissions(): Promise<PermissionsByCategory[]> {
    return this.rolesService.getAllPermissions();
  }

  @Post('compare')
  @RequirePermissions('roles:read')
  async compareRoles(
    @TenantId() tenantId: string,
    @Body() dto: CompareRolesDto,
  ): Promise<RoleComparisonResponseDto> {
    return this.rolesService.compareRoles(tenantId, dto.roleIds);
  }

  // ============================================================================
  // ROLE CRUD
  // ============================================================================

  @Get()
  @RequirePermissions('roles:read')
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ListRolesQueryDto,
  ): Promise<RoleDetailResponseDto[]> {
    return this.rolesService.findAll(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') roleId: string,
  ): Promise<RoleDetailResponseDto> {
    return this.rolesService.findOne(tenantId, roleId);
  }

  @Post()
  @RequirePermissions('roles:write')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.ROLE,
    action: AuditAction.CREATE,
    resourceType: 'role',
    getResourceId: (_req, res) => res?.id,
    getResourceName: (_req, res) => res?.name,
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleDetailResponseDto> {
    return this.rolesService.create(tenantId, dto, currentUser);
  }

  @Patch(':id')
  @RequirePermissions('roles:write')
  @Audit({
    category: AuditCategory.ROLE,
    action: AuditAction.UPDATE,
    resourceType: 'role',
    getResourceId: (req) => req.params.id,
  })
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') roleId: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleDetailResponseDto> {
    return this.rolesService.update(tenantId, roleId, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions('roles:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.ROLE,
    action: AuditAction.DELETE,
    resourceType: 'role',
    getResourceId: (req) => req.params.id,
  })
  async delete(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') roleId: string,
  ): Promise<void> {
    return this.rolesService.delete(tenantId, roleId, currentUser);
  }

  @Post(':id/clone')
  @RequirePermissions('roles:write')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.ROLE,
    action: AuditAction.CREATE,
    resourceType: 'role',
    getResourceId: (_req, res) => res?.id,
    getResourceName: (_req, res) => res?.name,
  })
  async clone(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') roleId: string,
    @Body() dto: CloneRoleDto,
  ): Promise<RoleDetailResponseDto> {
    return this.rolesService.clone(tenantId, roleId, dto, currentUser);
  }

  // ============================================================================
  // PERMISSION ASSIGNMENT
  // ============================================================================

  @Post(':id/permissions')
  @RequirePermissions('roles:write')
  @Audit({
    category: AuditCategory.ROLE,
    action: AuditAction.UPDATE,
    resourceType: 'role_permissions',
    getResourceId: (req) => req.params.id,
  })
  async assignPermissions(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') roleId: string,
    @Body() dto: AssignPermissionsDto,
  ): Promise<RoleDetailResponseDto> {
    return this.rolesService.assignPermissions(
      tenantId,
      roleId,
      dto.permissionIds,
      currentUser,
    );
  }

  @Delete(':id/permissions')
  @RequirePermissions('roles:write')
  @Audit({
    category: AuditCategory.ROLE,
    action: AuditAction.UPDATE,
    resourceType: 'role_permissions',
    getResourceId: (req) => req.params.id,
  })
  async removePermissions(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') roleId: string,
    @Body() dto: RemovePermissionsDto,
  ): Promise<RoleDetailResponseDto> {
    return this.rolesService.removePermissions(
      tenantId,
      roleId,
      dto.permissionIds,
      currentUser,
    );
  }
}
