import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../../users/entities/user.entity';

/**
 * Roles Guard for Role-Based Access Control.
 *
 * Checks if the authenticated user has at least one of the required roles.
 * Uses OR logic - user needs ANY of the specified roles.
 *
 * Usage:
 * ```typescript
 * @Controller('admin')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('admin')
 * export class AdminController {
 *   // All endpoints require 'admin' role
 * }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No roles required - allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as User;

    if (!user) {
      throw new ForbiddenException({
        code: 'NO_USER',
        message: 'User not found in request. Ensure JwtAuthGuard runs first.',
      });
    }

    if (!user.roles || user.roles.length === 0) {
      throw new ForbiddenException({
        code: 'NO_ROLES',
        message: 'You do not have any roles assigned.',
        requiredRoles,
      });
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some((role) => user.hasRole(role));

    if (!hasRole) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: `This action requires one of these roles: ${requiredRoles.join(', ')}`,
        requiredRoles,
        userRoles: user.roles.map((r) => r.name),
      });
    }

    return true;
  }
}
