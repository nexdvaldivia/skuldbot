import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async findAll(clientId?: string): Promise<UserResponseDto[]> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.client', 'client');

    if (clientId) {
      query.where('user.client_id = :clientId', { clientId });
    }

    const users = await query.orderBy('user.created_at', 'DESC').getMany();
    return users.map((user) => this.toResponseDto(user));
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['client'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.toResponseDto(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['client'],
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
      passwordHash = await argon2.hash(dto.password);
    }

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      clientId: dto.clientId || null,
      status: dto.password ? UserStatus.ACTIVE : UserStatus.PENDING,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`Created user ${saved.email} with role ${saved.role}`);

    // Reload with relations
    const loaded = await this.userRepository.findOne({
      where: { id: saved.id },
      relations: ['client'],
    });

    return this.toResponseDto(loaded!);
  }

  async update(id: string, dto: UpdateUserDto, currentUser: User): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['client'],
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

    Object.assign(user, dto);
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
      relations: ['client'],
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
      relations: ['client'],
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

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
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
}
