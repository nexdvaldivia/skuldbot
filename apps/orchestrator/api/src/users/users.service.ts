import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, ILike } from 'typeorm';
import { User, UserStatus, AuthProvider } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { AuditLog, AuditCategory, AuditAction, AuditResult } from '../audit/entities/audit-log.entity';
import { PasswordService, TokenService } from '../common/crypto/password.service';
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
} from './dto/user.dto';

/**
 * Users Service.
 *
 * Handles user management operations:
 * - CRUD operations on users
 * - Role assignment
 * - Status management
 * - User invitations
 * - Admin password reset
 *
 * All operations are tenant-scoped for multi-tenancy.
 * All mutations are audit logged.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  async findAll(
    tenantId: string,
    query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    const {
      search,
      status,
      roleId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
    } = query;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.tenantId = :tenantId', { tenantId });

    // Search filter
    if (search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Status filter
    if (status) {
      queryBuilder.andWhere('user.status = :status', { status });
    }

    // Role filter
    if (roleId) {
      queryBuilder.andWhere('role.id = :roleId', { roleId });
    }

    // Sorting
    const sortColumn = `user.${sortBy}`;
    queryBuilder.orderBy(sortColumn, sortOrder);

    // Pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      users: users.map(this.toUserResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(tenantId: string, userId: string): Promise<UserDetailResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      relations: ['roles', 'roles.permissions', 'tenant'],
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    return this.toUserDetailResponse(user);
  }

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase(), tenantId },
      relations: ['roles', 'roles.permissions'],
    });
  }

  async create(
    tenantId: string,
    dto: CreateUserDto,
    createdBy: User,
  ): Promise<UserDetailResponseDto> {
    // Check email uniqueness within tenant
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase(), tenantId },
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'A user with this email already exists.',
      });
    }

    // Validate roles exist and belong to tenant
    const roles = await this.roleRepository.find({
      where: { id: In(dto.roleIds), tenantId },
    });

    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ROLES',
        message: 'One or more role IDs are invalid.',
      });
    }

    // Create user
    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      title: dto.title,
      department: dto.department,
      phone: dto.phone,
      timezone: dto.timezone || 'UTC',
      locale: dto.locale || 'en',
      tenantId,
      roles,
      authProvider: AuthProvider.LOCAL,
      status: UserStatus.PENDING_VERIFICATION,
    });

    // Handle password
    if (dto.password) {
      user.passwordHash = await this.passwordService.hashPassword(dto.password);
      user.status = UserStatus.ACTIVE;
      user.emailVerified = true;
      user.emailVerifiedAt = new Date();
    } else if (dto.sendInvitation !== false) {
      // Generate invitation token
      user.emailVerificationToken = this.tokenService.generateSecureToken();
      user.emailVerificationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    await this.userRepository.save(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      createdBy,
      AuditAction.CREATE,
      'user',
      user.id,
      user.email,
      null,
      { email: user.email, roles: roles.map((r) => r.name) },
    );

    // TODO: Send invitation email if dto.sendInvitation !== false && !dto.password

    return this.toUserDetailResponse(user);
  }

  async update(
    tenantId: string,
    userId: string,
    dto: UpdateUserDto,
    updatedBy: User,
  ): Promise<UserDetailResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const previousState = {
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      department: user.department,
      phone: user.phone,
      timezone: user.timezone,
      locale: user.locale,
    };

    // Update fields
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.title !== undefined) user.title = dto.title;
    if (dto.department !== undefined) user.department = dto.department;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.timezone !== undefined) user.timezone = dto.timezone;
    if (dto.locale !== undefined) user.locale = dto.locale;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    await this.userRepository.save(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      updatedBy,
      AuditAction.UPDATE,
      'user',
      user.id,
      user.email,
      previousState,
      dto,
    );

    return this.toUserDetailResponse(user);
  }

  async updateRoles(
    tenantId: string,
    userId: string,
    dto: UpdateUserRolesDto,
    updatedBy: User,
  ): Promise<UserDetailResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    // Prevent removing all admin roles if this is the last admin
    const isRemovingAdminRole = user.roles.some(
      (r) => r.name === 'admin' && !dto.roleIds.includes(r.id),
    );

    if (isRemovingAdminRole) {
      const adminCount = await this.userRepository
        .createQueryBuilder('user')
        .innerJoin('user.roles', 'role')
        .where('user.tenantId = :tenantId', { tenantId })
        .andWhere('role.name = :roleName', { roleName: 'admin' })
        .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
        .getCount();

      if (adminCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_ADMIN',
          message: 'Cannot remove admin role from the last admin user.',
        });
      }
    }

    // Validate new roles
    const roles = await this.roleRepository.find({
      where: { id: In(dto.roleIds), tenantId },
    });

    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ROLES',
        message: 'One or more role IDs are invalid.',
      });
    }

    const previousRoles = user.roles.map((r) => r.name);

    user.roles = roles;
    await this.userRepository.save(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      updatedBy,
      AuditAction.UPDATE,
      'user_roles',
      user.id,
      user.email,
      { roles: previousRoles },
      { roles: roles.map((r) => r.name) },
    );

    return this.findOne(tenantId, userId);
  }

  async updateStatus(
    tenantId: string,
    userId: string,
    dto: UpdateUserStatusDto,
    updatedBy: User,
  ): Promise<UserDetailResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    // Prevent self-deactivation for admins
    if (user.id === updatedBy.id && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'You cannot deactivate your own account.',
      });
    }

    // Prevent deactivating last admin
    if (
      dto.status !== UserStatus.ACTIVE &&
      user.roles.some((r) => r.name === 'admin')
    ) {
      const adminCount = await this.userRepository
        .createQueryBuilder('user')
        .innerJoin('user.roles', 'role')
        .where('user.tenantId = :tenantId', { tenantId })
        .andWhere('role.name = :roleName', { roleName: 'admin' })
        .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
        .getCount();

      if (adminCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_ADMIN',
          message: 'Cannot deactivate the last admin user.',
        });
      }
    }

    const previousStatus = user.status;
    user.status = dto.status;

    await this.userRepository.save(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      updatedBy,
      AuditAction.UPDATE,
      'user_status',
      user.id,
      user.email,
      { status: previousStatus },
      { status: dto.status, reason: dto.reason },
    );

    return this.findOne(tenantId, userId);
  }

  async delete(
    tenantId: string,
    userId: string,
    deletedBy: User,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    // Prevent self-deletion
    if (user.id === deletedBy.id) {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_SELF',
        message: 'You cannot delete your own account.',
      });
    }

    // Prevent deleting last admin
    if (user.roles.some((r) => r.name === 'admin')) {
      const adminCount = await this.userRepository
        .createQueryBuilder('user')
        .innerJoin('user.roles', 'role')
        .where('user.tenantId = :tenantId', { tenantId })
        .andWhere('role.name = :roleName', { roleName: 'admin' })
        .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
        .getCount();

      if (adminCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_ADMIN',
          message: 'Cannot delete the last admin user.',
        });
      }
    }

    // Soft delete (set status to DEACTIVATED)
    user.status = UserStatus.DEACTIVATED;
    user.email = `deleted_${Date.now()}_${user.email}`; // Free up email
    await this.userRepository.save(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      deletedBy,
      AuditAction.DELETE,
      'user',
      user.id,
      user.email,
      { email: user.email, status: UserStatus.ACTIVE },
      null,
    );
  }

  // ============================================================================
  // ADMIN PASSWORD RESET
  // ============================================================================

  async adminResetPassword(
    tenantId: string,
    userId: string,
    dto: AdminResetPasswordDto,
    adminUser: User,
  ): Promise<{ message: string; temporaryPassword?: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    // Prevent resetting own password via admin endpoint
    if (user.id === adminUser.id) {
      throw new BadRequestException({
        code: 'USE_CHANGE_PASSWORD',
        message: 'Use the change password endpoint for your own password.',
      });
    }

    let temporaryPassword: string | undefined;

    if (dto.newPassword) {
      user.passwordHash = await this.passwordService.hashPassword(dto.newPassword);
    } else {
      // Generate temporary password
      temporaryPassword = this.tokenService.generateSecureToken(12);
      user.passwordHash = await this.passwordService.hashPassword(temporaryPassword);
    }

    user.passwordChangedAt = new Date();

    if (dto.requireChange) {
      // Force password change on next login
      user.passwordResetToken = 'FORCE_CHANGE';
    }

    await this.userRepository.save(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      adminUser,
      AuditAction.UPDATE,
      'user_password',
      user.id,
      user.email,
      null,
      { adminReset: true, requireChange: dto.requireChange },
    );

    // TODO: Send email with new password if dto.sendEmail

    return {
      message: temporaryPassword
        ? 'Password has been reset. Temporary password generated.'
        : 'Password has been reset.',
      temporaryPassword: dto.sendEmail ? undefined : temporaryPassword,
    };
  }

  // ============================================================================
  // INVITATIONS
  // ============================================================================

  async inviteUser(
    tenantId: string,
    dto: InviteUserDto,
    invitedBy: User,
  ): Promise<InvitationResponseDto> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase(), tenantId },
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'USER_EXISTS',
        message: 'A user with this email already exists.',
      });
    }

    // Validate roles
    const roles = await this.roleRepository.find({
      where: { id: In(dto.roleIds), tenantId },
    });

    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ROLES',
        message: 'One or more role IDs are invalid.',
      });
    }

    // Create user with pending invitation status
    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      tenantId,
      roles,
      authProvider: AuthProvider.LOCAL,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerificationToken: this.tokenService.generateSecureToken(),
      emailVerificationExpires: dto.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await this.userRepository.save(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      invitedBy,
      AuditAction.CREATE,
      'user_invitation',
      user.id,
      user.email,
      null,
      { email: user.email, roles: roles.map((r) => r.name) },
    );

    // TODO: Send invitation email with link containing emailVerificationToken

    return {
      id: user.id,
      email: user.email,
      status: 'pending',
      invitedBy: {
        id: invitedBy.id,
        email: invitedBy.email,
        fullName: `${invitedBy.firstName} ${invitedBy.lastName}`,
      },
      roles: roles.map((r) => ({ id: r.id, name: r.name })),
      createdAt: user.createdAt,
      expiresAt: user.emailVerificationExpires!,
    };
  }

  async resendInvitation(
    tenantId: string,
    userId: string,
    invitedBy: User,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId, status: UserStatus.PENDING_VERIFICATION },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Pending invitation not found.',
      });
    }

    // Regenerate token
    user.emailVerificationToken = this.tokenService.generateSecureToken();
    user.emailVerificationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.userRepository.save(user);

    // TODO: Send invitation email

    return { message: 'Invitation has been resent.' };
  }

  async revokeInvitation(
    tenantId: string,
    userId: string,
    revokedBy: User,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId, status: UserStatus.PENDING_VERIFICATION },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Pending invitation not found.',
      });
    }

    // Delete the pending user
    await this.userRepository.remove(user);

    // Audit log
    await this.createAuditLog(
      tenantId,
      revokedBy,
      AuditAction.DELETE,
      'user_invitation',
      userId,
      user.email,
      { email: user.email },
      null,
    );
  }

  // ============================================================================
  // PROFILE (for authenticated user)
  // ============================================================================

  async getProfile(user: User): Promise<any> {
    const fullUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['roles', 'roles.permissions', 'tenant'],
    });

    if (!fullUser) {
      throw new NotFoundException('User not found');
    }

    // Collect all unique permissions
    const permissions = new Set<string>();
    for (const role of fullUser.roles) {
      for (const permission of role.permissions) {
        permissions.add(permission.name);
      }
    }

    return {
      id: fullUser.id,
      email: fullUser.email,
      firstName: fullUser.firstName,
      lastName: fullUser.lastName,
      fullName: `${fullUser.firstName} ${fullUser.lastName}`,
      title: fullUser.title,
      department: fullUser.department,
      phone: fullUser.phone,
      avatarUrl: fullUser.avatarUrl,
      emailVerified: fullUser.emailVerified,
      mfaEnabled: fullUser.mfaEnabled,
      roles: fullUser.roles.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.displayName,
      })),
      permissions: Array.from(permissions),
      tenantId: fullUser.tenantId,
      timezone: fullUser.timezone,
      locale: fullUser.locale,
      lastLoginAt: fullUser.lastLoginAt,
      createdAt: fullUser.createdAt,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private toUserResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      title: user.title,
      department: user.department,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      roles: user.roles?.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.displayName,
      })) || [],
      timezone: user.timezone,
      locale: user.locale,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toUserDetailResponse(user: User): UserDetailResponseDto {
    // Collect all unique permissions
    const permissions = new Set<string>();
    for (const role of user.roles || []) {
      for (const permission of role.permissions || []) {
        permissions.add(permission.name);
      }
    }

    return {
      ...this.toUserResponse(user),
      tenantId: user.tenantId,
      authProvider: user.authProvider,
      emailVerifiedAt: user.emailVerifiedAt,
      mfaEnabledAt: user.mfaEnabledAt,
      lastLoginIp: user.lastLoginIp,
      failedLoginAttempts: user.failedLoginAttempts,
      lockoutUntil: user.lockoutUntil,
      passwordChangedAt: user.passwordChangedAt,
      permissions: Array.from(permissions),
    };
  }

  private async createAuditLog(
    tenantId: string,
    user: User,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    resourceName: string,
    previousState: any,
    newState: any,
  ): Promise<void> {
    await this.auditRepository.save({
      tenantId,
      userId: user.id,
      userEmail: user.email,
      category: AuditCategory.USER,
      action,
      result: AuditResult.SUCCESS,
      resourceType,
      resourceId,
      resourceName,
      previousState,
      newState,
    });
  }
}
