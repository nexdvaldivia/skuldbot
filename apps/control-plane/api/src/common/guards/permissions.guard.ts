import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../../users/entities/user.entity';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionMode,
} from '../decorators/permissions.decorator';
import { getUserGrantedPermissions, hasPermission } from '../authz/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const mode =
      this.reflector.getAllAndOverride<PermissionMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || 'all';

    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) {
      throw new ForbiddenException({
        code: 'NO_USER_CONTEXT',
        message: 'User context is required for permission checks.',
      });
    }

    const grantedPermissions = getUserGrantedPermissions(user);
    const missingPermissions = requiredPermissions.filter(
      (required) => !hasPermission(grantedPermissions, required),
    );

    const authorized =
      mode === 'any'
        ? missingPermissions.length < requiredPermissions.length
        : missingPermissions.length === 0;

    if (!authorized) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message:
          mode === 'any'
            ? `Requires one of: ${requiredPermissions.join(', ')}`
            : `Requires all of: ${requiredPermissions.join(', ')}`,
        requiredPermissions,
        missingPermissions: mode === 'all' ? missingPermissions : requiredPermissions,
        grantedPermissions,
        mode,
      });
    }

    return true;
  }
}
