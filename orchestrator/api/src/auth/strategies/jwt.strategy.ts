import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../users/entities/user.entity';

/**
 * JWT payload structure.
 * Keep minimal to reduce token size.
 */
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  tenantId: string;
  roles: string[]; // Role names for quick access
  sessionId?: string; // For session tracking
  iat: number; // Issued at
  exp: number; // Expiration
}

/**
 * JWT Strategy for Passport authentication.
 *
 * Validates JWT tokens and loads the full user object.
 * Used by JwtAuthGuard to protect endpoints.
 *
 * Token extraction:
 * 1. Authorization: Bearer <token>
 * 2. Cookie: access_token (for web clients)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // First try Authorization header
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Then try cookie
        (request: any) => {
          return request?.cookies?.access_token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret-change-in-production',
      algorithms: ['HS256'],
    } as any);
  }

  /**
   * Validate the JWT payload and return the user.
   * Called automatically by Passport after token verification.
   *
   * @param payload - Decoded JWT payload
   * @returns User object to be attached to request
   */
  async validate(payload: JwtPayload): Promise<User> {
    // Load full user with roles and permissions
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['roles', 'roles.permissions', 'tenant'],
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User no longer exists.',
      });
    }

    // Verify user status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: `User account is ${user.status}.`,
      });
    }

    // Verify tenant hasn't changed (security measure)
    if (user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException({
        code: 'TENANT_MISMATCH',
        message: 'Token tenant does not match user tenant.',
      });
    }

    // Check if password was changed after token was issued
    if (
      user.passwordChangedAt &&
      payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException({
        code: 'PASSWORD_CHANGED',
        message: 'Password was changed. Please log in again.',
      });
    }

    return user;
  }
}

/**
 * Refresh Token Strategy.
 * Validates refresh tokens for token rotation.
 */
@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Refresh token typically comes from body or cookie
        (request: any) => {
          return (
            request?.body?.refreshToken ||
            request?.cookies?.refresh_token
          );
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') || 'default-refresh-secret-change-in-production',
      algorithms: ['HS256'],
      passReqToCallback: true, // Pass request to validate for token extraction
    } as any);
  }

  async validate(request: any, payload: JwtPayload): Promise<any> {
    // Get the refresh token from the request
    const refreshToken =
      request?.body?.refreshToken || request?.cookies?.refresh_token;

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'USER_INVALID',
        message: 'User is not valid.',
      });
    }

    return {
      ...user,
      refreshToken, // Pass token for rotation in auth service
    };
  }
}
