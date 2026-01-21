import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { EmailProvider } from '../common/interfaces/integration.interface';
import { EMAIL_PROVIDER } from '../integrations/email/email.module';
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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: ['client'],
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

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: UserRole.CLIENT_USER,
      status: UserStatus.PENDING,
    });

    const saved = await this.userRepository.save(user);

    // TODO: Send verification email
    this.logger.log(`New user registered: ${saved.email}`);

    return this.generateTokens(saved);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'change-this-refresh-secret'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['client'],
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal if user exists
      return { message: 'If the email exists, a reset link will be sent' };
    }

    // Generate reset token
    const resetToken = this.jwtService.sign(
      { sub: user.id, type: 'reset' } as object,
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: 3600, // 1 hour
      },
    );

    // Send reset email
    if (this.emailProvider.isConfigured()) {
      try {
        const resetUrl = `${this.configService.get<string>('APP_URL')}/reset-password?token=${resetToken}`;
        await this.emailProvider.send({
          to: user.email,
          subject: 'Reset your password - Skuld Control Plane',
          html: `
            <h2>Reset your password</h2>
            <p>Click the link below to reset your password:</p>
            <a href="${resetUrl}">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
          `,
        });
      } catch (error) {
        this.logger.error('Failed to send reset email', error);
      }
    }

    return { message: 'If the email exists, a reset link will be sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    try {
      const payload = this.jwtService.verify<{ sub: string; type: string }>(dto.token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (payload.type !== 'reset') {
        throw new UnauthorizedException('Invalid reset token');
      }

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      user.passwordHash = await argon2.hash(dto.newPassword);
      await this.userRepository.save(user);

      return { message: 'Password reset successfully' };
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['client'],
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
        clientId: user.clientId,
      },
    };
  }
}
