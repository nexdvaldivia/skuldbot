import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionMode,
} from '../decorators/permissions.decorator';
import { User } from '../../users/entities/user.entity';

/**
 * Permissions Guard for granular access control.
 *
 * More fine-grained than RolesGuard - checks specific permissions
 * that can be assigned to roles.
 *
 * Supports two modes:
 * - 'all' (default): User must have ALL specified permissions
 * - 'any': User must have at least ONE of the specified permissions
 *
 * Usage:
 * ```typescript
 * @Post('bots/:id/execute')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @RequirePermissions('bots:read', 'bots:execute')
 * executeBot(@Param('id') id: string) {
 *   // Requires both permissions
 * }
 * ```
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permissions required - allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Get permission mode (default: 'all')
    const mode = this.reflector.getAllAndOverride<PermissionMode>(
      PERMISSIONS_MODE_KEY,
      [context.getHandler(), context.getClass()],
    ) || 'all';

    const request = context.switchToHttp().getRequest();
    const user = request.user as User;

    if (!user) {
      throw new ForbiddenException({
        code: 'NO_USER',
        message: 'User not found in request. Ensure JwtAuthGuard runs first.',
      });
    }

    // Check permissions based on mode
    let hasPermission: boolean;
    let missingPermissions: string[] = [];

    if (mode === 'any') {
      // OR logic - need at least one permission
      hasPermission = requiredPermissions.some((permission) =>
        user.hasPermission(permission),
      );
    } else {
      // AND logic - need all permissions
      missingPermissions = requiredPermissions.filter(
        (permission) => !user.hasPermission(permission),
      );
      hasPermission = missingPermissions.length === 0;
    }

    if (!hasPermission) {
      // Build helpful error message
      const userPermissions = this.getUserPermissions(user);

      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message:
          mode === 'any'
            ? `This action requires at least one of these permissions: ${requiredPermissions.join(', ')}`
            : `This action requires all of these permissions: ${requiredPermissions.join(', ')}`,
        requiredPermissions,
        missingPermissions: mode === 'all' ? missingPermissions : requiredPermissions,
        mode,
        userPermissions,
      });
    }

    return true;
  }

  /**
   * Extract all permissions from user's roles
   */
  private getUserPermissions(user: User): string[] {
    const permissions = new Set<string>();

    if (user.roles) {
      for (const role of user.roles) {
        if (role.permissions) {
          for (const permission of role.permissions) {
            permissions.add(permission.name);
          }
        }
      }
    }

    return Array.from(permissions);
  }
}
