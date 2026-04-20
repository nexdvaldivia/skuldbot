import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { getUserGrantedPermissions, getUserRoleNames } from '../common/authz/permissions';
import { UserLoginHistory } from '../users/entities/user-login-history.entity';
import { UserPasswordHistory } from '../users/entities/user-password-history.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { AuthResponseDto, ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const PASSWORD_POLICY_ERROR =
  'Password must include at least 12 characters, uppercase, lowercase, number, and special character.';

type LoginMetadata = {
  ip?: string;
  userAgent?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLoginHistory)
    private readonly loginHistoryRepository: Repository<UserLoginHistory>,
    @InjectRepository(UserPasswordHistory)
    private readonly passwordHistoryRepository: Repository<UserPasswordHistory>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto, metadata: LoginMetadata = {}): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase().trim() },
      relations: ['client', 'roles', 'roles.permissions'],
    });

    const ip = metadata.ip ?? 'unknown';
    const userAgent = metadata.userAgent ?? null;

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.isLocked(user)) {
      await this.recordLoginHistory(user.id, ip, userAgent, false, 'account_locked');
      throw new UnauthorizedException('Account is temporarily locked');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user, ip, userAgent, 'invalid_credentials');
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.recordLoginHistory(user.id, ip, userAgent, false, 'account_inactive');
      throw new UnauthorizedException('Account is not active');
    }

    if (this.isPasswordExpired(user)) {
      await this.recordLoginHistory(user.id, ip, userAgent, false, 'password_expired');
      throw new UnauthorizedException('Password expired, please rotate credentials');
    }

    user.lastLoginAt = new Date();
    user.lastLoginIp = ip;
    user.loginCount = (user.loginCount ?? 0) + 1;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.userRepository.save(user);
    await this.recordLoginHistory(user.id, ip, userAgent, true, null);

    return this.generateTokens(user);
  }

  async register(): Promise<AuthResponseDto> {
    throw new ForbiddenException({
      code: 'SELF_REGISTRATION_DISABLED',
      message: 'Self-registration is disabled. Accounts must be created by an administrator.',
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'change-this-refresh-secret'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['client', 'roles', 'roles.permissions'],
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(): Promise<{ message: string }> {
    throw new ForbiddenException({
      code: 'PASSWORD_RECOVERY_DISABLED',
      message: 'Password recovery is disabled. Contact your administrator for credential reset.',
    });
  }

  async resetPassword(): Promise<{ message: string }> {
    throw new ForbiddenException({
      code: 'PASSWORD_RECOVERY_DISABLED',
      message: 'Password reset via self-service is disabled. Contact your administrator.',
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new NotFoundException('User not found');
    }

    const currentPasswordValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is invalid');
    }

    this.assertPasswordPolicy(dto.newPassword);
    await this.assertPasswordNotReused(user.id, dto.newPassword, user.passwordHash);

    await this.passwordHistoryRepository.save(
      this.passwordHistoryRepository.create({
        userId: user.id,
        passwordHash: user.passwordHash,
      }),
    );

    user.passwordHash = await argon2.hash(dto.newPassword);
    user.passwordChangedAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    await this.userRepository.save(user);

    return { message: 'Password updated successfully' };
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['client', 'roles', 'roles.permissions'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  assertPasswordPolicy(password: string): void {
    const hasMinLength = password.length >= 12;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!(hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: PASSWORD_POLICY_ERROR,
      });
    }
  }

  private async assertPasswordNotReused(
    userId: string,
    candidatePassword: string,
    currentHash: string,
  ): Promise<void> {
    if (await argon2.verify(currentHash, candidatePassword)) {
      throw new BadRequestException({
        code: 'PASSWORD_REUSE_NOT_ALLOWED',
        message: 'Password was used recently. Choose a new password.',
      });
    }

    const history = await this.passwordHistoryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    for (const entry of history) {
      if (await argon2.verify(entry.passwordHash, candidatePassword)) {
        throw new BadRequestException({
          code: 'PASSWORD_REUSE_NOT_ALLOWED',
          message: 'Password was used recently. Choose a new password.',
        });
      }
    }
  }

  private isPasswordExpired(user: User): boolean {
    const expiryDays = Number(this.configService.get('PASSWORD_EXPIRY_DAYS', 90));
    if (!Number.isFinite(expiryDays) || expiryDays <= 0) {
      return false;
    }

    if (!user.passwordChangedAt) {
      return false;
    }

    const expiryMs = expiryDays * 24 * 60 * 60 * 1000;
    return user.passwordChangedAt.getTime() + expiryMs < Date.now();
  }

  private isLocked(user: User): boolean {
    if (!user.lockedUntil) {
      return false;
    }

    return user.lockedUntil.getTime() > Date.now();
  }

  private async handleFailedLogin(
    user: User,
    ip: string,
    userAgent: string | null,
    reason: string,
  ): Promise<void> {
    const maxAttempts = Number(this.configService.get('AUTH_LOCKOUT_ATTEMPTS', 5));
    const lockoutMinutes = Number(this.configService.get('AUTH_LOCKOUT_MINUTES', 30));

    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    user.failedLoginAttempts = attempts;

    let failureReason = reason;
    if (attempts >= maxAttempts) {
      user.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      failureReason = 'account_locked';
    }

    await this.userRepository.save(user);
    await this.recordLoginHistory(user.id, ip, userAgent, false, failureReason);
  }

  private async recordLoginHistory(
    userId: string,
    ip: string,
    userAgent: string | null,
    success: boolean,
    failureReason: string | null,
  ): Promise<void> {
    const entry = this.loginHistoryRepository.create({
      userId,
      ip,
      userAgent,
      success,
      failureReason,
    });

    await this.loginHistoryRepository.save(entry);
  }

  private generateTokens(user: User): AuthResponseDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
    };

    const accessToken = this.jwtService.sign(payload as object, {
      secret: this.configService.get<string>('JWT_SECRET', 'change-this-secret'),
      expiresIn: 900,
    });

    const refreshToken = this.jwtService.sign(payload as object, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'change-this-refresh-secret'),
      expiresIn: 604800,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: getUserRoleNames(user),
        clientId: user.clientId,
        permissions: getUserGrantedPermissions(user),
      },
    };
  }
}
