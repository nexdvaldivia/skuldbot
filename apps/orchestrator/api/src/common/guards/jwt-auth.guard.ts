import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JWT Authentication Guard.
 *
 * This guard:
 * 1. Checks if endpoint is marked as @Public() - if so, allows access
 * 2. Validates the JWT token from Authorization header
 * 3. Attaches the user to the request object
 *
 * Applied globally in app.module.ts to protect all endpoints by default.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Proceed with JWT validation
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Handle specific JWT errors with descriptive messages
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: 'TOKEN_EXPIRED',
          message: 'Your session has expired. Please log in again.',
        });
      }

      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token.',
        });
      }

      if (info?.name === 'NotBeforeError') {
        throw new UnauthorizedException({
          code: 'TOKEN_NOT_ACTIVE',
          message: 'Token is not yet active.',
        });
      }

      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    // Check if user account is active
    if (user.status !== 'active') {
      if (user.status === 'suspended') {
        throw new UnauthorizedException({
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended. Contact support.',
        });
      }

      if (user.status === 'locked') {
        throw new UnauthorizedException({
          code: 'ACCOUNT_LOCKED',
          message: 'Your account is temporarily locked due to too many failed login attempts.',
        });
      }

      if (user.status === 'pending_verification') {
        throw new UnauthorizedException({
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email address to continue.',
        });
      }

      throw new UnauthorizedException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account is not active.',
      });
    }

    return user;
  }
}
