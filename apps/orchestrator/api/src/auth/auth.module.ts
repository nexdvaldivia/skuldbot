import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy, RefreshTokenStrategy } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';
import { RefreshToken, Session, ApiKey } from '../users/entities/api-key.entity';
import { Role } from '../roles/entities/role.entity';
import { Permission } from '../roles/entities/permission.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { PasswordService, TokenService } from '../common/crypto/password.service';

/**
 * Authentication Module.
 *
 * Provides enterprise-grade authentication for the Orchestrator:
 *
 * Features:
 * - JWT-based authentication with access & refresh tokens
 * - Token rotation for enhanced security
 * - MFA support (TOTP)
 * - Session management
 * - Password reset flow
 * - Email verification
 * - User impersonation (admin)
 * - Comprehensive audit logging
 *
 * Configuration (environment variables):
 * - JWT_SECRET: Secret for signing access tokens
 * - JWT_REFRESH_SECRET: Secret for signing refresh tokens
 * - JWT_ACCESS_EXPIRY: Access token expiration (default: 15m)
 * - JWT_REFRESH_EXPIRY: Refresh token expiration (default: 7d)
 * - AUTH_MAX_FAILED_ATTEMPTS: Failed login attempts before lockout (default: 5)
 * - AUTH_LOCKOUT_DURATION: Lockout duration in ms (default: 1800000 = 30min)
 *
 * Security considerations:
 * - Passwords hashed with Argon2id (OWASP recommended)
 * - Refresh tokens are single-use with family tracking
 * - Token reuse triggers full session revocation
 * - All auth events are audit logged
 * - Account lockout after failed attempts
 */
@Module({
  imports: [
    // Passport configuration
    PassportModule.register({
      defaultStrategy: 'jwt',
      property: 'user',
      session: false,
    }),

    // JWT configuration
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRY', '15m') as any,
          algorithm: 'HS256' as const,
          issuer: 'skuldbot',
          audience: 'skuldbot-api',
        },
        verifyOptions: {
          algorithms: ['HS256' as const],
          issuer: 'skuldbot',
          audience: 'skuldbot-api',
        },
      }),
    }),

    // TypeORM entities
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      Session,
      ApiKey,
      Role,
      Permission,
      AuditLog,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenStrategy,
    PasswordService,
    TokenService,
  ],
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    PasswordService,
    TokenService,
  ],
})
export class AuthModule {}
