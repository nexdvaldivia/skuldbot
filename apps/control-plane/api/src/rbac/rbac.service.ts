import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import {
  AssignUserRolesDto,
  CreateRoleDto,
  ListRolesQueryDto,
  PermissionResponseDto,
  RoleResponseDto,
  UpdateRoleDto,
} from './dto/rbac.dto';
import { CpPermission } from './entities/cp-permission.entity';
import { CpRole, CpRoleScopeType } from './entities/cp-role.entity';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(CpRole)
    private readonly roleRepository: Repository<CpRole>,
    @InjectRepository(CpPermission)
    private readonly permissionRepository: Repository<CpPermission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async listPermissions(): Promise<PermissionResponseDto[]> {
    const permissions = await this.permissionRepository.find({
      order: { category: 'ASC', code: 'ASC' },
    });

    return permissions.map((permission) => this.toPermissionResponse(permission));
  }

  async listRoles(query: ListRolesQueryDto): Promise<RoleResponseDto[]> {
    const roleQuery = this.roleRepository.createQueryBuilder('role');
    roleQuery.leftJoinAndSelect('role.client', 'client');

    if (query.includePermissions) {
      roleQuery.leftJoinAndSelect('role.permissions', 'permission');
    }

    if (query.search) {
      roleQuery.andWhere(
        '(role.name ILIKE :search OR role.displayName ILIKE :search OR role.description ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.scopeType) {
      roleQuery.andWhere('role.scopeType = :scopeType', {
        scopeType: query.scopeType,
      });
    }

    if (query.clientId) {
      roleQuery.andWhere('role.clientId = :clientId', { clientId: query.clientId });
    }

    roleQuery.orderBy('role.isSystem', 'DESC').addOrderBy('role.displayName', 'ASC');

    const roles = await roleQuery.getMany();

    let userCountsByRole = new Map<string, number>();
    if (query.includeUserCount) {
      const roleIds = roles.map((role) => role.id);
      if (roleIds.length > 0) {
        const raw = await this.userRepository
          .createQueryBuilder('user')
          .innerJoin('user.roles', 'role')
          .select('role.id', 'roleId')
          .addSelect('COUNT(user.id)', 'count')
          .where('role.id IN (:...roleIds)', { roleIds })
          .groupBy('role.id')
          .getRawMany<{ roleId: string; count: string }>();

        userCountsByRole = new Map(raw.map((entry) => [entry.roleId, Number(entry.count)]));
      }
    }

    return roles.map((role) =>
      this.toRoleResponse(
        role,
        query.includePermissions ?? false,
        query.includeUserCount ? (userCountsByRole.get(role.id) ?? 0) : undefined,
      ),
    );
  }

  async createRole(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const name = dto.name.trim().toLowerCase();

    const existing = await this.roleRepository.findOne({
      where: { name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ROLE_NAME_EXISTS',
        message: `Role ${name} already exists.`,
      });
    }

    const scopeType = dto.scopeType ?? CpRoleScopeType.PLATFORM;
    let clientId: string | null = dto.clientId ?? null;

    if (scopeType === CpRoleScopeType.CLIENT && !clientId) {
      throw new BadRequestException({
        code: 'CLIENT_SCOPE_REQUIRES_CLIENT',
        message: 'clientId is required for client-scoped roles.',
      });
    }

    if (scopeType === CpRoleScopeType.PLATFORM) {
      clientId = null;
    }

    if (clientId) {
      await this.ensureClientExists(clientId);
    }

    const permissions = await this.resolvePermissions(dto.permissionIds);

    if (dto.isDefault) {
      await this.unsetDefaultRoles(scopeType, clientId);
    }

    const role = this.roleRepository.create({
      name,
      displayName: dto.displayName.trim(),
      description: dto.description?.trim() || null,
      scopeType,
      clientId,
      isDefault: dto.isDefault ?? false,
      isSystem: false,
      permissions,
    });

    const saved = await this.roleRepository.save(role);
    const loaded = await this.roleRepository.findOne({
      where: { id: saved.id },
      relations: ['permissions', 'client'],
    });

    return this.toRoleResponse(loaded!, true);
  }

  async getRole(roleId: string): Promise<RoleResponseDto> {
    const role = await this.requireRole(roleId, ['permissions', 'client']);
    return this.toRoleResponse(role, true);
  }

  async updateRole(roleId: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const role = await this.requireRole(roleId, ['permissions', 'client']);

    if (role.isSystem && dto.displayName) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_IMMUTABLE',
        message: 'System role displayName cannot be changed.',
      });
    }

    if (role.isSystem && dto.description !== undefined) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_IMMUTABLE',
        message: 'System role description cannot be changed.',
      });
    }

    if (dto.displayName !== undefined) {
      role.displayName = dto.displayName.trim();
    }

    if (dto.description !== undefined) {
      role.description = dto.description.trim() || null;
    }

    if (dto.permissionIds) {
      role.permissions = await this.resolvePermissions(dto.permissionIds);
    }

    if (dto.isDefault !== undefined) {
      if (dto.isDefault) {
        await this.unsetDefaultRoles(role.scopeType, role.clientId);
      }
      role.isDefault = dto.isDefault;
    }

    const saved = await this.roleRepository.save(role);
    return this.toRoleResponse(saved, true);
  }

  async addRolePermission(roleId: string, permissionId: string): Promise<PermissionResponseDto> {
    const role = await this.requireRole(roleId, ['permissions', 'client']);
    if (role.isSystem) {
      this.throwSystemRoleImmutable();
    }

    const permission = await this.permissionRepository.findOne({ where: { id: permissionId } });
    if (!permission) {
      throw new NotFoundException({
        code: 'PERMISSION_NOT_FOUND',
        message: `Permission ${permissionId} was not found.`,
      });
    }

    if ((role.permissions ?? []).some((existing) => existing.id === permission.id)) {
      throw new ConflictException({
        code: 'ROLE_PERMISSION_EXISTS',
        message: 'Permission already assigned to this role.',
      });
    }

    role.permissions = [...(role.permissions ?? []), permission];
    await this.roleRepository.save(role);

    return this.toPermissionResponse(permission);
  }

  async removeRolePermission(roleId: string, permissionId: string): Promise<void> {
    const role = await this.requireRole(roleId, ['permissions', 'client']);
    if (role.isSystem) {
      this.throwSystemRoleImmutable();
    }

    const nextPermissions = (role.permissions ?? []).filter(
      (permission) => permission.id !== permissionId,
    );

    if (nextPermissions.length === (role.permissions ?? []).length) {
      throw new NotFoundException({
        code: 'ROLE_PERMISSION_NOT_FOUND',
        message: `Permission ${permissionId} is not assigned to role ${roleId}.`,
      });
    }

    role.permissions = nextPermissions;
    await this.roleRepository.save(role);
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[]): Promise<RoleResponseDto> {
    const role = await this.requireRole(roleId, ['permissions', 'client']);
    if (role.isSystem) {
      this.throwSystemRoleImmutable();
    }

    role.permissions = await this.resolvePermissions(permissionIds);
    const saved = await this.roleRepository.save(role);
    return this.toRoleResponse(saved, true);
  }

  async deleteRole(roleId: string): Promise<void> {
    const role = await this.requireRole(roleId, ['users']);

    if (role.isSystem) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_DELETE_FORBIDDEN',
        message: 'System roles cannot be deleted.',
      });
    }

    if (role.users?.length > 0) {
      throw new BadRequestException({
        code: 'ROLE_IN_USE',
        message: 'Role cannot be deleted while assigned to users.',
      });
    }

    await this.roleRepository.remove(role);
  }

  async getUserRoles(userId: string): Promise<RoleResponseDto[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.permissions', 'roles.client'],
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User ${userId} was not found.`,
      });
    }

    return (user.roles ?? []).map((role) => this.toRoleResponse(role, true));
  }

  async assignUserRoles(userId: string, dto: AssignUserRolesDto): Promise<RoleResponseDto[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User ${userId} was not found.`,
      });
    }

    const roles = await this.roleRepository.find({
      where: { id: In(dto.roleIds) },
      relations: ['permissions', 'client'],
    });

    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_IDS',
        message: 'One or more roleIds are invalid.',
      });
    }

    for (const role of roles) {
      this.ensureRoleAssignableToUser(role, user.clientId);
    }

    user.roles = roles;
    await this.userRepository.save(user);

    return roles.map((role) => this.toRoleResponse(role, true));
  }

  private async resolvePermissions(permissionIds: string[]): Promise<CpPermission[]> {
    const uniqueIds = Array.from(new Set(permissionIds));
    const permissions = await this.permissionRepository.find({
      where: { id: In(uniqueIds) },
    });

    if (permissions.length !== uniqueIds.length) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION_IDS',
        message: 'One or more permissionIds are invalid.',
      });
    }

    return permissions;
  }

  private async unsetDefaultRoles(
    scopeType: CpRoleScopeType,
    clientId: string | null,
  ): Promise<void> {
    const query = this.roleRepository
      .createQueryBuilder()
      .update(CpRole)
      .set({ isDefault: false })
      .where('scopeType = :scopeType', { scopeType });

    if (clientId) {
      query.andWhere('clientId = :clientId', { clientId });
    } else {
      query.andWhere('clientId IS NULL');
    }

    await query.execute();
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      select: ['id'],
    });

    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${clientId} not found.`,
      });
    }
  }

  private async requireRole(roleId: string, relations: string[] = []): Promise<CpRole> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations,
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Role ${roleId} was not found.`,
      });
    }

    return role;
  }

  private throwSystemRoleImmutable(): never {
    throw new BadRequestException({
      code: 'SYSTEM_ROLE_IMMUTABLE',
      message: 'System roles cannot be modified.',
    });
  }

  private toPermissionResponse(permission: CpPermission): PermissionResponseDto {
    return {
      id: permission.id,
      code: permission.code,
      label: permission.label,
      category: permission.category,
      description: permission.description,
    };
  }

  private toRoleResponse(
    role: CpRole,
    includePermissions = false,
    userCount?: number,
  ): RoleResponseDto {
    return {
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      scopeType: role.scopeType,
      clientId: role.clientId,
      clientName: role.client?.name ?? null,
      isSystem: role.isSystem,
      isDefault: role.isDefault,
      permissions: includePermissions
        ? (role.permissions ?? []).map((permission) => this.toPermissionResponse(permission))
        : undefined,
      userCount,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private ensureRoleAssignableToUser(role: CpRole, userClientId: string | null): void {
    if (role.scopeType === CpRoleScopeType.CLIENT) {
      if (!userClientId) {
        throw new BadRequestException({
          code: 'CLIENT_ROLE_REQUIRES_CLIENT_USER',
          message: `Role ${role.name} requires a client-bound user.`,
        });
      }

      if (role.clientId && role.clientId !== userClientId) {
        throw new BadRequestException({
          code: 'CLIENT_ROLE_SCOPE_MISMATCH',
          message: `Role ${role.name} is scoped to a different client.`,
        });
      }
    }
  }
}
