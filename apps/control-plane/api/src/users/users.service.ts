import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { Client } from '../clients/entities/client.entity';
import { StorageProvider } from '../common/interfaces/integration.interface';
import { STORAGE_PROVIDER } from '../integrations/storage/storage.module';
import { CpRole, CpRoleScopeType } from '../rbac/entities/cp-role.entity';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UploadUserAvatarDto,
  UserResponseDto,
  UserStatsResponseDto,
} from './dto/user.dto';
import { User, UserRole, UserStatus } from './entities/user.entity';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(CpRole)
    private readonly roleRepository: Repository<CpRole>,
    @InjectRepository(SecurityAuditEvent)
    private readonly securityAuditRepository: Repository<SecurityAuditEvent>,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<UserResponseDto[]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.client', 'client')
      .leftJoinAndSelect('user.roles', 'roles');

    if (query.clientId) {
      qb.andWhere('user.client_id = :clientId', { clientId: query.clientId });
    }

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (query.isActive !== undefined) {
      if (query.isActive) {
        qb.andWhere('user.status = :activeStatus', { activeStatus: UserStatus.ACTIVE });
      } else {
        qb.andWhere('user.status != :activeStatus', { activeStatus: UserStatus.ACTIVE });
      }
    }

    if (query.search) {
      qb.andWhere(
        '(LOWER(user.email) LIKE :search OR LOWER(user.first_name) LIKE :search OR LOWER(user.last_name) LIKE :search)',
        {
          search: `%${query.search.toLowerCase()}%`,
        },
      );
    }

    qb.orderBy('user.created_at', 'DESC')
      .offset(query.skip ?? 0)
      .limit(query.limit ?? 50);

    const users = await qb.getMany();
    return Promise.all(users.map((user) => this.toResponseDto(user)));
  }

  async getStats(): Promise<UserStatsResponseDto> {
    const totalUsers = await this.userRepository.count();
    const activeUsers = await this.userRepository.count({ where: { status: UserStatus.ACTIVE } });

    const roleRows = await this.userRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(user.id)', 'count')
      .groupBy('user.role')
      .getRawMany<{ role: string; count: string }>();

    const byRole = roleRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.role] = Number(row.count);
      return acc;
    }, {});

    return {
      totalUsers,
      activeUsers,
      inactiveUsers: Math.max(totalUsers - activeUsers, 0),
      byRole,
    };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    return this.toResponseDto(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['client', 'roles', 'roles.permissions'],
    });
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    await this.ensureClientExistsIfProvided(dto.clientId);

    const passwordHash = dto.password ? await argon2.hash(dto.password) : null;
    const roles = await this.resolveRoleAssignments(dto.role, dto.roleIds, dto.clientId || null);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      clientId: dto.clientId || null,
      status: dto.password ? UserStatus.ACTIVE : UserStatus.PENDING,
      roles,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`Created user ${saved.email} with role ${saved.role}`);

    const loaded = await this.requireUser(saved.id);
    return this.toResponseDto(loaded);
  }

  async update(id: string, dto: UpdateUserDto, currentUser: User): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    if (user.id === currentUser.id && dto.role && dto.role !== user.role) {
      throw new ForbiddenException('Cannot change your own role');
    }

    if (user.id === currentUser.id && dto.status && dto.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    if (dto.roleIds) {
      user.roles = await this.resolveRolesByIds(dto.roleIds, user.clientId);
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.status !== undefined) user.status = dto.status;

    const saved = await this.userRepository.save(user);
    return this.toResponseDto(saved);
  }

  async delete(id: string, currentUser: User): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.id === currentUser.id) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    await this.userRepository.remove(user);
    this.logger.log(`Deleted user ${user.email}`);
  }

  async activate(
    id: string,
    currentUser: User,
    requestIp: string | null,
  ): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    const previousStatus = user.status;
    user.status = UserStatus.ACTIVE;
    const saved = await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'users.activate',
      targetId: saved.id,
      actor: currentUser,
      requestIp,
      details: {
        previousStatus,
        newStatus: saved.status,
      },
    });
    return this.toResponseDto(saved);
  }

  async suspend(id: string, currentUser: User, requestIp: string | null): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    if (user.id === currentUser.id) {
      throw new ForbiddenException('Cannot suspend your own account');
    }

    const previousStatus = user.status;
    user.status = UserStatus.SUSPENDED;
    const saved = await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'users.suspend',
      targetId: saved.id,
      actor: currentUser,
      requestIp,
      details: {
        previousStatus,
        newStatus: saved.status,
      },
    });
    return this.toResponseDto(saved);
  }

  async toggleActive(
    id: string,
    currentUser: User,
    requestIp: string | null,
  ): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    if (user.id === currentUser.id) {
      throw new ForbiddenException('Cannot toggle your own account status');
    }

    const previousStatus = user.status;
    user.status = user.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
    const saved = await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'users.toggle_status',
      targetId: saved.id,
      actor: currentUser,
      requestIp,
      details: {
        previousStatus,
        newStatus: saved.status,
      },
    });
    return this.toResponseDto(saved);
  }

  async resetPassword(
    id: string,
    password: string,
    currentUser: User,
    requestIp: string | null,
  ): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    if (user.id === currentUser.id) {
      throw new ForbiddenException('Cannot reset your own password from this endpoint');
    }

    user.passwordHash = await argon2.hash(password);
    user.status = UserStatus.ACTIVE;
    user.metadata = {
      ...user.metadata,
      passwordResetAt: new Date().toISOString(),
      passwordResetBy: currentUser.id,
    };

    const saved = await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'users.reset_password',
      targetId: saved.id,
      actor: currentUser,
      requestIp,
      details: {
        status: saved.status,
      },
    });
    return this.toResponseDto(saved);
  }

  async uploadAvatar(
    id: string,
    dto: UploadUserAvatarDto,
    currentUser: User,
    requestIp: string | null,
  ): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    this.ensureAvatarContentType(dto.contentType);

    if (!this.storageProvider.isConfigured()) {
      throw new BadRequestException({
        code: 'STORAGE_PROVIDER_NOT_CONFIGURED',
        message: 'Storage provider is required for avatar upload.',
      });
    }

    const decoded = this.decodeAvatarBase64(dto.contentBase64);
    const avatarSha256 = createHash('sha256').update(decoded).digest('hex');

    if (user.avatarStorageKey) {
      await this.safeDeleteAvatar(user.avatarStorageKey);
    }

    const avatarKey = this.buildAvatarStorageKey(user.id, dto.contentType);
    await this.storageProvider.upload({
      key: avatarKey,
      body: decoded,
      contentType: dto.contentType,
      metadata: {
        userId: user.id,
        sha256: avatarSha256,
      },
    });

    user.avatarStorageKey = avatarKey;
    user.avatarContentType = dto.contentType;
    user.avatarSha256 = avatarSha256;
    user.avatarUploadedAt = new Date();

    const saved = await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'users.upload_avatar',
      targetId: saved.id,
      actor: currentUser,
      requestIp,
      details: {
        avatarStorageKey: saved.avatarStorageKey,
        avatarContentType: saved.avatarContentType,
        avatarSha256: saved.avatarSha256,
      },
    });
    return this.toResponseDto(saved);
  }

  async deleteAvatar(
    id: string,
    currentUser: User,
    requestIp: string | null,
  ): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    if (user.avatarStorageKey) {
      await this.safeDeleteAvatar(user.avatarStorageKey);
    }

    user.avatarStorageKey = null;
    user.avatarContentType = null;
    user.avatarSha256 = null;
    user.avatarUploadedAt = null;

    const saved = await this.userRepository.save(user);
    await this.recordSecurityAuditEvent({
      action: 'users.delete_avatar',
      targetId: saved.id,
      actor: currentUser,
      requestIp,
      details: {},
    });
    return this.toResponseDto(saved);
  }

  private async toResponseDto(user: User): Promise<UserResponseDto> {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      roles:
        user.roles?.map((role) => ({
          id: role.id,
          name: role.name,
          displayName: role.displayName,
        })) ?? [],
      status: user.status,
      clientId: user.clientId,
      clientName: user.client?.name || null,
      lastLoginAt: user.lastLoginAt,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      avatarUrl: await this.resolveAvatarUrl(user.avatarStorageKey),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async resolveAvatarUrl(avatarStorageKey: string | null): Promise<string | null> {
    if (!avatarStorageKey || !this.storageProvider.isConfigured()) {
      return null;
    }

    try {
      return await this.storageProvider.getSignedUrl(avatarStorageKey, 3600);
    } catch (error) {
      this.logger.warn(`Failed to resolve avatar signed URL for ${avatarStorageKey}: ${error}`);
      return null;
    }
  }

  private async requireUser(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['client', 'roles'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  private async ensureClientExistsIfProvided(clientId?: string): Promise<void> {
    if (!clientId) {
      return;
    }

    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }
  }

  private ensureAvatarContentType(contentType: string): void {
    if (!AVATAR_ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException({
        code: 'INVALID_AVATAR_CONTENT_TYPE',
        message: 'Avatar contentType must be image/png, image/jpeg, image/jpg, or image/webp.',
      });
    }
  }

  private decodeAvatarBase64(contentBase64: string): Buffer {
    let normalized = contentBase64.trim();
    const markerIndex = normalized.indexOf('base64,');
    if (markerIndex >= 0) {
      normalized = normalized.slice(markerIndex + 'base64,'.length);
    }

    const buffer = Buffer.from(normalized, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException({
        code: 'AVATAR_EMPTY_PAYLOAD',
        message: 'Avatar payload cannot be empty.',
      });
    }

    if (buffer.length > AVATAR_MAX_BYTES) {
      throw new BadRequestException({
        code: 'AVATAR_FILE_TOO_LARGE',
        message: 'Avatar payload exceeds 2MB limit.',
      });
    }

    return buffer;
  }

  private buildAvatarStorageKey(userId: string, contentType: string): string {
    const extension =
      contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    return `users/${userId}/avatar-${Date.now()}.${extension}`;
  }

  private async safeDeleteAvatar(storageKey: string): Promise<void> {
    if (!this.storageProvider.isConfigured()) {
      return;
    }

    try {
      await this.storageProvider.delete(storageKey);
    } catch (error) {
      this.logger.warn(`Unable to delete previous avatar ${storageKey}: ${error}`);
    }
  }

  private async resolveRoleAssignments(
    legacyRole: UserRole,
    roleIds?: string[],
    userClientId?: string | null,
  ): Promise<CpRole[]> {
    if (roleIds && roleIds.length > 0) {
      return this.resolveRolesByIds(roleIds, userClientId ?? null);
    }

    const systemRole = await this.roleRepository.findOne({ where: { name: legacyRole } });
    return systemRole ? [systemRole] : [];
  }

  private async resolveRolesByIds(
    roleIds: string[],
    userClientId: string | null,
  ): Promise<CpRole[]> {
    const uniqueRoleIds = Array.from(new Set(roleIds));
    const roles = await this.roleRepository.find({ where: { id: In(uniqueRoleIds) } });

    if (roles.length !== uniqueRoleIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_IDS',
        message: 'One or more roleIds are invalid.',
      });
    }

    for (const role of roles) {
      if (role.scopeType === CpRoleScopeType.CLIENT) {
        this.assertClientRoleScope(role, userClientId);
      }
    }

    return roles;
  }

  private assertClientRoleScope(role: CpRole, userClientId: string | null): void {
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

  private async recordSecurityAuditEvent(input: {
    action: string;
    targetId: string;
    actor: User;
    requestIp: string | null;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.securityAuditRepository.save(
      this.securityAuditRepository.create({
        category: 'users',
        action: input.action,
        targetType: 'user',
        targetId: input.targetId,
        actorUserId: input.actor.id ?? null,
        actorEmail: input.actor.email ?? null,
        requestIp: input.requestIp,
        details: input.details,
      }),
    );
  }
}
