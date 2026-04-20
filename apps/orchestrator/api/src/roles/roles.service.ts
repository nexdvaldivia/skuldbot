import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike } from 'typeorm';
import { Role, RoleType } from './entities/role.entity';
import { Permission, PermissionCategory, CATEGORY_DISPLAY_NAMES } from './entities/permission.entity';
import { User } from '../users/entities/user.entity';
import { AuditLog, AuditCategory, AuditAction, AuditResult } from '../audit/entities/audit-log.entity';
import {
  CreateRoleDto,
  UpdateRoleDto,
  CloneRoleDto,
  ListRolesQueryDto,
  RoleResponseDto,
  RoleDetailResponseDto,
  PermissionResponseDto,
  PermissionsByCategory,
  RoleComparisonResponseDto,
} from './dto/role.dto';

/**
 * Roles Service.
 *
 * Handles role and permission management:
 * - CRUD operations on roles
 * - Permission assignment
 * - Role cloning
 * - Role comparison
 *
 * Role types:
 * - SYSTEM: Built-in roles that cannot be deleted (admin, operator, developer, viewer)
 * - CUSTOM: User-created roles specific to the tenant
 *
 * All operations are tenant-scoped for multi-tenancy.
 * All mutations are audit logged.
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  // ============================================================================
  // ROLE CRUD
  // ============================================================================

  async findAll(
    tenantId: string,
    query: ListRolesQueryDto,
  ): Promise<RoleDetailResponseDto[]> {
    const {
      search,
      type,
      includePermissions = false,
      includeUserCount = false,
      sortBy = 'name',
      sortOrder = 'ASC',
    } = query;

    const queryBuilder = this.roleRepository
      .createQueryBuilder('role')
      .where('role.tenantId = :tenantId', { tenantId });

    // Include permissions if requested
    if (includePermissions) {
      queryBuilder.leftJoinAndSelect('role.permissions', 'permission');
    }

    // Search filter
    if (search) {
      queryBuilder.andWhere(
        '(role.name ILIKE :search OR role.displayName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Type filter
    if (type) {
      queryBuilder.andWhere('role.type = :type', { type });
    }

    // Sorting
    if (sortBy === 'userCount') {
      // Special handling for user count sorting
      queryBuilder
        .loadRelationCountAndMap('role.userCount', 'role.users')
        .orderBy('role.userCount', sortOrder);
    } else {
      queryBuilder.orderBy(`role.${sortBy}`, sortOrder);
    }

    const roles = await queryBuilder.getMany();

    // Get user counts if requested
    if (includeUserCount) {
      const userCounts = await this.getUserCountsForRoles(
        roles.map((r) => r.id),
      );
      return roles.map((role) => ({
        ...this.toRoleDetailResponse(role),
        userCount: userCounts[role.id] || 0,
      }));
    }

    return roles.map((role) => this.toRoleDetailResponse(role));
  }

  async findOne(tenantId: string, roleId: string): Promise<RoleDetailResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    const userCount = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('role.id = :roleId', { roleId })
      .getCount();

    return {
      ...this.toRoleDetailResponse(role),
      userCount,
    };
  }

  async findByName(tenantId: string, name: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { name, tenantId },
      relations: ['permissions'],
    });
  }

  async create(
    tenantId: string,
    dto: CreateRoleDto,
    createdBy: User,
  ): Promise<RoleDetailResponseDto> {
    // Check name uniqueness within tenant
    const existingRole = await this.roleRepository.findOne({
      where: { name: dto.name, tenantId },
    });

    if (existingRole) {
      throw new ConflictException({
        code: 'ROLE_EXISTS',
        message: 'A role with this name already exists.',
      });
    }

    // Validate permissions exist
    const permissions = await this.permissionRepository.find({
      where: { id: In(dto.permissionIds) },
    });

    if (permissions.length !== dto.permissionIds.length) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSIONS',
        message: 'One or more permission IDs are invalid.',
      });
    }

    // Create role
    const role = this.roleRepository.create({
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description,
      tenantId,
      type: RoleType.CUSTOM,
      isDefault: dto.isDefault || false,
      permissions,
    });

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.roleRepository.update(
        { tenantId, isDefault: true },
        { isDefault: false },
      );
    }

    await this.roleRepository.save(role);

    // Audit log
    await this.createAuditLog(
      tenantId,
      createdBy,
      AuditAction.CREATE,
      'role',
      role.id,
      role.name,
      null,
      {
        name: role.name,
        displayName: role.displayName,
        permissions: permissions.map((p) => p.name),
      },
    );

    return this.findOne(tenantId, role.id);
  }

  async update(
    tenantId: string,
    roleId: string,
    dto: UpdateRoleDto,
    updatedBy: User,
  ): Promise<RoleDetailResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    // System roles can only have permissions modified, not name/type
    if (role.type === RoleType.SYSTEM) {
      if (dto.displayName !== undefined || dto.description !== undefined) {
        throw new ForbiddenException({
          code: 'SYSTEM_ROLE_PROTECTED',
          message: 'System role metadata cannot be modified.',
        });
      }
    }

    const previousState = {
      displayName: role.displayName,
      description: role.description,
      permissions: role.permissions.map((p) => p.name),
      isDefault: role.isDefault,
    };

    // Update fields
    if (dto.displayName !== undefined) role.displayName = dto.displayName;
    if (dto.description !== undefined) role.description = dto.description;

    // Update permissions
    if (dto.permissionIds !== undefined) {
      const permissions = await this.permissionRepository.find({
        where: { id: In(dto.permissionIds) },
      });

      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException({
          code: 'INVALID_PERMISSIONS',
          message: 'One or more permission IDs are invalid.',
        });
      }

      role.permissions = permissions;
    }

    // Update default status
    if (dto.isDefault !== undefined) {
      if (dto.isDefault) {
        await this.roleRepository.update(
          { tenantId, isDefault: true },
          { isDefault: false },
        );
      }
      role.isDefault = dto.isDefault;
    }

    await this.roleRepository.save(role);

    // Audit log
    await this.createAuditLog(
      tenantId,
      updatedBy,
      AuditAction.UPDATE,
      'role',
      role.id,
      role.name,
      previousState,
      {
        displayName: role.displayName,
        description: role.description,
        permissions: role.permissions.map((p) => p.name),
        isDefault: role.isDefault,
      },
    );

    return this.findOne(tenantId, role.id);
  }

  async delete(
    tenantId: string,
    roleId: string,
    deletedBy: User,
  ): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId },
      relations: ['users'],
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    // Cannot delete system roles
    if (role.type === RoleType.SYSTEM) {
      throw new ForbiddenException({
        code: 'SYSTEM_ROLE_PROTECTED',
        message: 'System roles cannot be deleted.',
      });
    }

    // Check if role is assigned to users
    const userCount = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('role.id = :roleId', { roleId })
      .getCount();

    if (userCount > 0) {
      throw new BadRequestException({
        code: 'ROLE_IN_USE',
        message: `Cannot delete role. It is assigned to ${userCount} user(s).`,
      });
    }

    await this.roleRepository.remove(role);

    // Audit log
    await this.createAuditLog(
      tenantId,
      deletedBy,
      AuditAction.DELETE,
      'role',
      roleId,
      role.name,
      { name: role.name, displayName: role.displayName },
      null,
    );
  }

  async clone(
    tenantId: string,
    roleId: string,
    dto: CloneRoleDto,
    clonedBy: User,
  ): Promise<RoleDetailResponseDto> {
    // Check source role exists
    const sourceRole = await this.roleRepository.findOne({
      where: { id: roleId, tenantId },
      relations: ['permissions'],
    });

    if (!sourceRole) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Source role not found.',
      });
    }

    // Check new name uniqueness
    const existingRole = await this.roleRepository.findOne({
      where: { name: dto.name, tenantId },
    });

    if (existingRole) {
      throw new ConflictException({
        code: 'ROLE_EXISTS',
        message: 'A role with this name already exists.',
      });
    }

    // Create cloned role
    const clonedRole = this.roleRepository.create({
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description || sourceRole.description,
      tenantId,
      type: RoleType.CUSTOM,
      isDefault: false,
      permissions: sourceRole.permissions,
    });

    await this.roleRepository.save(clonedRole);

    // Audit log
    await this.createAuditLog(
      tenantId,
      clonedBy,
      AuditAction.CREATE,
      'role',
      clonedRole.id,
      clonedRole.name,
      null,
      {
        name: clonedRole.name,
        displayName: clonedRole.displayName,
        clonedFrom: sourceRole.name,
        permissions: sourceRole.permissions.map((p) => p.name),
      },
    );

    return this.findOne(tenantId, clonedRole.id);
  }

  // ============================================================================
  // PERMISSIONS
  // ============================================================================

  async getAllPermissions(): Promise<PermissionsByCategory[]> {
    const permissions = await this.permissionRepository.find({
      order: { category: 'ASC', name: 'ASC' },
    });

    // Group by category
    const grouped = new Map<PermissionCategory, Permission[]>();

    for (const permission of permissions) {
      const existing = grouped.get(permission.category) || [];
      existing.push(permission);
      grouped.set(permission.category, existing);
    }

    // Convert to response format
    const result: PermissionsByCategory[] = [];

    for (const [category, perms] of grouped) {
      result.push({
        category,
        categoryDisplayName: CATEGORY_DISPLAY_NAMES[category],
        permissions: perms.map((p) => ({
          id: p.id,
          name: p.name,
          displayName: p.displayName,
          description: p.description,
          category: p.category,
        })),
      });
    }

    return result;
  }

  async assignPermissions(
    tenantId: string,
    roleId: string,
    permissionIds: string[],
    updatedBy: User,
  ): Promise<RoleDetailResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    const permissions = await this.permissionRepository.find({
      where: { id: In(permissionIds) },
    });

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSIONS',
        message: 'One or more permission IDs are invalid.',
      });
    }

    const previousPermissions = role.permissions.map((p) => p.name);

    // Add new permissions (avoiding duplicates)
    const existingIds = new Set(role.permissions.map((p) => p.id));
    const newPermissions = permissions.filter((p) => !existingIds.has(p.id));
    role.permissions = [...role.permissions, ...newPermissions];

    await this.roleRepository.save(role);

    // Audit log
    await this.createAuditLog(
      tenantId,
      updatedBy,
      AuditAction.UPDATE,
      'role_permissions',
      role.id,
      role.name,
      { permissions: previousPermissions },
      { permissions: role.permissions.map((p) => p.name) },
    );

    return this.findOne(tenantId, role.id);
  }

  async removePermissions(
    tenantId: string,
    roleId: string,
    permissionIds: string[],
    updatedBy: User,
  ): Promise<RoleDetailResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    const previousPermissions = role.permissions.map((p) => p.name);

    // Remove specified permissions
    const removeSet = new Set(permissionIds);
    role.permissions = role.permissions.filter((p) => !removeSet.has(p.id));

    await this.roleRepository.save(role);

    // Audit log
    await this.createAuditLog(
      tenantId,
      updatedBy,
      AuditAction.UPDATE,
      'role_permissions',
      role.id,
      role.name,
      { permissions: previousPermissions },
      { permissions: role.permissions.map((p) => p.name) },
    );

    return this.findOne(tenantId, role.id);
  }

  // ============================================================================
  // ROLE COMPARISON
  // ============================================================================

  async compareRoles(
    tenantId: string,
    roleIds: string[],
  ): Promise<RoleComparisonResponseDto> {
    const roles = await this.roleRepository.find({
      where: { id: In(roleIds), tenantId },
      relations: ['permissions'],
    });

    if (roles.length !== roleIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ROLES',
        message: 'One or more role IDs are invalid.',
      });
    }

    // Collect all unique permissions
    const allPermissions = new Map<
      string,
      { permission: Permission; assignedTo: string[] }
    >();

    for (const role of roles) {
      for (const permission of role.permissions) {
        if (!allPermissions.has(permission.id)) {
          allPermissions.set(permission.id, {
            permission,
            assignedTo: [role.id],
          });
        } else {
          allPermissions.get(permission.id)!.assignedTo.push(role.id);
        }
      }
    }

    // Sort permissions by category and name
    const sortedPermissions = Array.from(allPermissions.values()).sort(
      (a, b) => {
        if (a.permission.category !== b.permission.category) {
          return a.permission.category.localeCompare(b.permission.category);
        }
        return a.permission.name.localeCompare(b.permission.name);
      },
    );

    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.displayName,
      })),
      permissions: sortedPermissions.map(({ permission, assignedTo }) => ({
        id: permission.id,
        name: permission.name,
        displayName: permission.displayName,
        category: permission.category,
        assignedTo,
      })),
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getUserCountsForRoles(
    roleIds: string[],
  ): Promise<Record<string, number>> {
    const results = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .select('role.id', 'roleId')
      .addSelect('COUNT(user.id)', 'count')
      .where('role.id IN (:...roleIds)', { roleIds })
      .groupBy('role.id')
      .getRawMany();

    const counts: Record<string, number> = {};
    for (const result of results) {
      counts[result.roleId] = parseInt(result.count, 10);
    }

    return counts;
  }

  private toRoleDetailResponse(role: Role): RoleDetailResponseDto {
    return {
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      type: role.type,
      isDefault: role.isDefault,
      permissions:
        role.permissions?.map((p) => ({
          id: p.id,
          name: p.name,
          displayName: p.displayName,
          description: p.description,
          category: p.category,
        })) || [],
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
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
      category: AuditCategory.ROLE,
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
