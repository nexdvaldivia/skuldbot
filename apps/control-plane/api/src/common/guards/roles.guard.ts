import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  hasPermission,
  getUserGrantedPermissions,
  getUserRoleNames,
} from '../authz/permissions';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionMode,
} from '../decorators/permissions.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      return false;
    }

    const roleNames = getUserRoleNames(user);

    if (roleNames.includes(UserRole.SKULD_ADMIN)) {
      return true;
    }

    if (requiredRoles.some((requiredRole) => roleNames.includes(requiredRole))) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return false;
    }

    const mode =
      this.reflector.getAllAndOverride<PermissionMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || 'all';

    const grantedPermissions = getUserGrantedPermissions(user);
    const missingPermissions = requiredPermissions.filter(
      (required) => !hasPermission(grantedPermissions, required),
    );

    return mode === 'any'
      ? missingPermissions.length < requiredPermissions.length
      : missingPermissions.length === 0;
  }
}
