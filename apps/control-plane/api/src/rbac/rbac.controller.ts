import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { User } from '../users/entities/user.entity';
import {
  AddRolePermissionDto,
  AssignUserRolesDto,
  CreateRoleDto,
  ListRolesQueryDto,
  PermissionResponseDto,
  ReplaceRolePermissionsDto,
  RoleResponseDto,
  UpdateRoleDto,
} from './dto/rbac.dto';
import { RbacService } from './rbac.service';

@Controller('rbac')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions')
  @RequirePermissions(CP_PERMISSIONS.ROLES_READ)
  async listPermissions(): Promise<PermissionResponseDto[]> {
    return this.rbacService.listPermissions();
  }

  @Get('roles')
  @RequirePermissions(CP_PERMISSIONS.ROLES_READ)
  async listRoles(@Query() query: ListRolesQueryDto): Promise<RoleResponseDto[]> {
    return this.rbacService.listRoles(query);
  }

  @Post('roles')
  @RequirePermissions(CP_PERMISSIONS.ROLES_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async createRole(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.rbacService.createRole(dto);
  }

  @Patch('roles/:roleId')
  @RequirePermissions(CP_PERMISSIONS.ROLES_WRITE)
  async updateRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rbacService.updateRole(roleId, dto);
  }

  @Get('roles/:roleId')
  @RequirePermissions(CP_PERMISSIONS.ROLES_READ)
  async getRole(@Param('roleId') roleId: string): Promise<RoleResponseDto> {
    return this.rbacService.getRole(roleId);
  }

  @Post('roles/:roleId/permissions')
  @RequirePermissions(CP_PERMISSIONS.ROLES_ASSIGN, CP_PERMISSIONS.ROLES_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async addRolePermission(
    @Param('roleId') roleId: string,
    @Body() dto: AddRolePermissionDto,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<PermissionResponseDto> {
    return this.rbacService.addRolePermission(
      roleId,
      dto.permissionId,
      currentUser,
      this.resolveRequestIp(request),
    );
  }

  @Delete('roles/:roleId/permissions/:permissionId')
  @RequirePermissions(CP_PERMISSIONS.ROLES_ASSIGN, CP_PERMISSIONS.ROLES_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRolePermission(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<void> {
    await this.rbacService.removeRolePermission(
      roleId,
      permissionId,
      currentUser,
      this.resolveRequestIp(request),
    );
  }

  @Put('roles/:roleId/permissions')
  @RequirePermissions(CP_PERMISSIONS.ROLES_ASSIGN, CP_PERMISSIONS.ROLES_WRITE)
  async replaceRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: ReplaceRolePermissionsDto,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<RoleResponseDto> {
    return this.rbacService.replaceRolePermissions(
      roleId,
      dto.permissionIds,
      currentUser,
      this.resolveRequestIp(request),
    );
  }

  @Delete('roles/:roleId')
  @RequirePermissions(CP_PERMISSIONS.ROLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(@Param('roleId') roleId: string): Promise<void> {
    return this.rbacService.deleteRole(roleId);
  }

  @Get('users/:userId/roles')
  @RequirePermissions(CP_PERMISSIONS.ROLES_READ)
  async getUserRoles(@Param('userId') userId: string): Promise<RoleResponseDto[]> {
    return this.rbacService.getUserRoles(userId);
  }

  @Put('users/:userId/roles')
  @RequirePermissions(CP_PERMISSIONS.ROLES_ASSIGN, CP_PERMISSIONS.USERS_WRITE)
  async assignUserRoles(
    @Param('userId') userId: string,
    @Body() dto: AssignUserRolesDto,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ): Promise<RoleResponseDto[]> {
    return this.rbacService.assignUserRoles(
      userId,
      dto,
      currentUser,
      this.resolveRequestIp(request),
    );
  }

  private resolveRequestIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || null;
    }
    return request.ip || null;
  }
}
