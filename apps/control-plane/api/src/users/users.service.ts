import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { UserLoginHistory } from './entities/user-login-history.entity';
import { Client } from '../clients/entities/client.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  UserLoginHistoryResponseDto,
  UserResponseDto,
} from './dto/user.dto';
import { CpRole, CpRoleScopeType } from '../rbac/entities/cp-role.entity';

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
    @InjectRepository(UserLoginHistory)
    private readonly loginHistoryRepository: Repository<UserLoginHistory>,
  ) {}

  async findAll(clientId?: string): Promise<UserResponseDto[]> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.client', 'client')
      .leftJoinAndSelect('user.roles', 'roles');

    if (clientId) {
      query.where('user.client_id = :clientId', { clientId });
    }

    const users = await query.orderBy('user.created_at', 'DESC').getMany();
    return users.map((user) => this.toResponseDto(user));
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['client', 'roles'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.toResponseDto(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['client', 'roles', 'roles.permissions'],
    });
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    // Verify client exists if specified
    if (dto.clientId) {
      const client = await this.clientRepository.findOne({
        where: { id: dto.clientId },
      });

      if (!client) {
        throw new NotFoundException(`Client with ID ${dto.clientId} not found`);
      }
    }

    // Hash password if provided
    let passwordHash: string | null = null;
    if (dto.password) {
      this.assertPasswordPolicy(dto.password);
      passwordHash = await argon2.hash(dto.password);
    }

    const roles = await this.resolveRoleAssignments(dto.role, dto.roleIds, dto.clientId || null);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      clientId: dto.clientId || null,
      status: dto.password ? UserStatus.ACTIVE : UserStatus.PENDING,
      passwordChangedAt: dto.password ? new Date() : null,
      roles,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`Created user ${saved.email} with role ${saved.role}`);

    // Reload with relations
    const loaded = await this.userRepository.findOne({
      where: { id: saved.id },
      relations: ['client', 'roles'],
    });

    return this.toResponseDto(loaded!);
  }

  async update(id: string, dto: UpdateUserDto, currentUser: User): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['client', 'roles'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Prevent demoting yourself
    if (user.id === currentUser.id && dto.role && dto.role !== user.role) {
      throw new ForbiddenException('Cannot change your own role');
    }

    // Prevent deactivating yourself
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
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.id === currentUser.id) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    await this.userRepository.remove(user);
    this.logger.log(`Deleted user ${user.email}`);
  }

  async activate(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['client', 'roles'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    user.status = UserStatus.ACTIVE;
    const saved = await this.userRepository.save(user);
    return this.toResponseDto(saved);
  }

  async suspend(id: string, currentUser: User): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['client', 'roles'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.id === currentUser.id) {
      throw new ForbiddenException('Cannot suspend your own account');
    }

    user.status = UserStatus.SUSPENDED;
    const saved = await this.userRepository.save(user);
    return this.toResponseDto(saved);
  }

  async getLoginHistory(
    userId: string,
    currentUser: User,
    limit = 100,
  ): Promise<UserLoginHistoryResponseDto[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!currentUser.isSkuld()) {
      if (!currentUser.clientId || !user.clientId || currentUser.clientId !== user.clientId) {
        throw new ForbiddenException('Cannot access login history across client boundaries');
      }
    }

    const sanitizedLimit = Math.max(1, Math.min(limit, 500));
    const history = await this.loginHistoryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: sanitizedLimit,
    });

    return history.map((entry) => ({
      id: entry.id,
      ip: entry.ip,
      userAgent: entry.userAgent,
      success: entry.success,
      failureReason: entry.failureReason,
      createdAt: entry.createdAt,
    }));
  }

  private toResponseDto(user: User): UserResponseDto {
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async resolveRoleAssignments(
    legacyRole: UserRole,
    roleIds?: string[],
    userClientId?: string | null,
  ): Promise<CpRole[]> {
    if (roleIds && roleIds.length > 0) {
      return this.resolveRolesByIds(roleIds, userClientId ?? null);
    }

    const systemRole = await this.roleRepository.findOne({
      where: { name: legacyRole },
    });

    return systemRole ? [systemRole] : [];
  }

  private async resolveRolesByIds(
    roleIds: string[],
    userClientId: string | null,
  ): Promise<CpRole[]> {
    const uniqueRoleIds = Array.from(new Set(roleIds));

    const roles = await this.roleRepository.find({
      where: { id: In(uniqueRoleIds) },
    });

    if (roles.length !== uniqueRoleIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_IDS',
        message: 'One or more roleIds are invalid.',
      });
    }

    for (const role of roles) {
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

    return roles;
  }

  private assertPasswordPolicy(password: string): void {
    const hasMinLength = password.length >= 12;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!(hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message:
          'Password must include at least 12 characters, uppercase, lowercase, number, and special character.',
      });
    }
  }
}
