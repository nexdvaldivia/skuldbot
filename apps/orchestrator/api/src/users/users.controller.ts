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
import { UsersService } from './users.service';
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
import { User } from './entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserRolesDto,
  UpdateUserStatusDto,
  AdminResetPasswordDto,
  ListUsersQueryDto,
  UserResponseDto,
  UserDetailResponseDto,
  PaginatedUsersResponseDto,
  InviteUserDto,
  InvitationResponseDto,
  UpdateProfileDto,
  ProfileResponseDto,
} from './dto/user.dto';

/**
 * Users Controller.
 *
 * Provides REST API endpoints for user management.
 *
 * Endpoints:
 * - GET    /users                    - List all users (paginated)
 * - GET    /users/:id                - Get user by ID
 * - POST   /users                    - Create new user
 * - PATCH  /users/:id                - Update user
 * - PATCH  /users/:id/roles          - Update user roles
 * - PATCH  /users/:id/status         - Update user status
 * - DELETE /users/:id                - Delete user
 * - POST   /users/:id/reset-password - Admin reset password
 *
 * Invitation endpoints:
 * - POST   /users/invite             - Invite new user
 * - POST   /users/:id/resend-invite  - Resend invitation
 * - DELETE /users/:id/invitation     - Revoke invitation
 *
 * Profile endpoints (for authenticated user):
 * - GET    /users/me                 - Get current user profile
 * - PATCH  /users/me                 - Update current user profile
 *
 * All endpoints are:
 * - Protected by JWT authentication
 * - Tenant-isolated (users can only see their tenant's users)
 * - Permission-controlled
 * - Audit logged
 */
@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ============================================================================
  // PROFILE ENDPOINTS (for authenticated user)
  // These must come before :id routes to avoid conflicts
  // ============================================================================

  @Get('me')
  async getProfile(@CurrentUser() user: User): Promise<ProfileResponseDto> {
    return this.usersService.getProfile(user);
  }

  @Patch('me')
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.UPDATE,
    resourceType: 'profile',
    getResourceId: (req) => req.user?.id,
    getResourceName: (req) => req.user?.email,
  })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    await this.usersService.update(user.tenantId, user.id, dto, user);
    return this.usersService.getProfile(user);
  }

  // ============================================================================
  // LIST / READ ENDPOINTS
  // ============================================================================

  @Get()
  @RequirePermissions('users:read')
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.usersService.findAll(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') userId: string,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.findOne(tenantId, userId);
  }

  // ============================================================================
  // CREATE ENDPOINTS
  // ============================================================================

  @Post()
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.CREATE,
    resourceType: 'user',
    getResourceId: (_req, res) => res?.id,
    getResourceName: (_req, res) => res?.email,
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Body() dto: CreateUserDto,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.create(tenantId, dto, currentUser);
  }

  @Post('invite')
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.CREATE,
    resourceType: 'user_invitation',
    getResourceId: (_req, res) => res?.id,
    getResourceName: (_req, res) => res?.email,
  })
  async inviteUser(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Body() dto: InviteUserDto,
  ): Promise<InvitationResponseDto> {
    return this.usersService.inviteUser(tenantId, dto, currentUser);
  }

  // ============================================================================
  // UPDATE ENDPOINTS
  // ============================================================================

  @Patch(':id')
  @RequirePermissions('users:write')
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.UPDATE,
    resourceType: 'user',
    getResourceId: (req) => req.params.id,
  })
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.update(tenantId, userId, dto, currentUser);
  }

  @Patch(':id/roles')
  @RequirePermissions('users:write', 'roles:assign')
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.UPDATE,
    resourceType: 'user_roles',
    getResourceId: (req) => req.params.id,
  })
  async updateRoles(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') userId: string,
    @Body() dto: UpdateUserRolesDto,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.updateRoles(tenantId, userId, dto, currentUser);
  }

  @Patch(':id/status')
  @RequirePermissions('users:write')
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.UPDATE,
    resourceType: 'user_status',
    getResourceId: (req) => req.params.id,
  })
  async updateStatus(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.updateStatus(tenantId, userId, dto, currentUser);
  }

  // ============================================================================
  // DELETE ENDPOINTS
  // ============================================================================

  @Delete(':id')
  @RequirePermissions('users:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.DELETE,
    resourceType: 'user',
    getResourceId: (req) => req.params.id,
  })
  async delete(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') userId: string,
  ): Promise<void> {
    return this.usersService.delete(tenantId, userId, currentUser);
  }

  // ============================================================================
  // PASSWORD MANAGEMENT (Admin)
  // ============================================================================

  @Post(':id/reset-password')
  @RequirePermissions('users:write')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'user_password',
    getResourceId: (req) => req.params.id,
  })
  async adminResetPassword(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') userId: string,
    @Body() dto: AdminResetPasswordDto,
  ): Promise<{ message: string; temporaryPassword?: string }> {
    return this.usersService.adminResetPassword(
      tenantId,
      userId,
      dto,
      currentUser,
    );
  }

  // ============================================================================
  // INVITATION MANAGEMENT
  // ============================================================================

  @Post(':id/resend-invite')
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.UPDATE,
    resourceType: 'user_invitation',
    getResourceId: (req) => req.params.id,
  })
  async resendInvitation(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') userId: string,
  ): Promise<{ message: string }> {
    return this.usersService.resendInvitation(tenantId, userId, currentUser);
  }

  @Delete(':id/invitation')
  @RequirePermissions('users:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.USER,
    action: AuditAction.DELETE,
    resourceType: 'user_invitation',
    getResourceId: (req) => req.params.id,
  })
  async revokeInvitation(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: User,
    @Param('id') userId: string,
  ): Promise<void> {
    return this.usersService.revokeInvitation(tenantId, userId, currentUser);
  }
}
