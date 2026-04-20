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
  UseGuards,
} from '@nestjs/common';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  AssignUserRolesDto,
  CreateRoleDto,
  ListRolesQueryDto,
  PermissionResponseDto,
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
  ): Promise<RoleResponseDto[]> {
    return this.rbacService.assignUserRoles(userId, dto);
  }
}
