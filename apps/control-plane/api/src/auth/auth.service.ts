import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User, UserStatus } from '../users/entities/user.entity';
import { getUserGrantedPermissions, getUserRoleNames } from '../common/authz/permissions';
import {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: ['client', 'roles', 'roles.permissions'],
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    return this.generateTokens(user);
  }

  async register(_dto: RegisterDto): Promise<AuthResponseDto> {
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

  async forgotPassword(_dto: ForgotPasswordDto): Promise<{ message: string }> {
    throw new ForbiddenException({
      code: 'PASSWORD_RECOVERY_DISABLED',
      message: 'Password recovery is disabled. Contact your administrator for credential reset.',
    });
  }

  async resetPassword(_dto: ResetPasswordDto): Promise<{ message: string }> {
    throw new ForbiddenException({
      code: 'PASSWORD_RECOVERY_DISABLED',
      message: 'Password reset via self-service is disabled. Contact your administrator.',
    });
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

  private generateTokens(user: User): AuthResponseDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
    };

    const accessToken = this.jwtService.sign(payload as object, {
      secret: this.configService.get<string>('JWT_SECRET', 'change-this-secret'),
      expiresIn: 900, // 15 minutes
    });

    const refreshToken = this.jwtService.sign(payload as object, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'change-this-refresh-secret'),
      expiresIn: 604800, // 7 days
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
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
