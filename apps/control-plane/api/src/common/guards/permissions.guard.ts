import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../../users/entities/user.entity';
import {
  PERMISSION_CONSTRAINT_KEY,
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionConstraint,
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

    const constraint = this.reflector.getAllAndOverride<PermissionConstraint>(
      PERMISSION_CONSTRAINT_KEY,
      [context.getHandler(), context.getClass()],
    );

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

    if (constraint && constraint.scope === 'client') {
      this.assertClientScope(constraint, request, user);
    }

    return true;
  }

  private assertClientScope(
    constraint: PermissionConstraint,
    request: {
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    },
    user: User,
  ): void {
    if (constraint.allowSkuldBypass !== false && user.isSkuld()) {
      return;
    }

    const sourceOrder: Array<'params' | 'body' | 'query'> = constraint.source
      ? [constraint.source]
      : ['params', 'body', 'query'];

    let rawValue: unknown;
    for (const source of sourceOrder) {
      rawValue = request[source]?.[constraint.key];
      if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
        break;
      }
      rawValue = undefined;
    }

    if (!rawValue || typeof rawValue !== 'string') {
      throw new ForbiddenException({
        code: 'RESOURCE_SCOPE_MISSING',
        message: `Missing required scoped field "${constraint.key}" for client permission check.`,
      });
    }

    if (!user.clientId || user.clientId !== rawValue) {
      throw new ForbiddenException({
        code: 'RESOURCE_SCOPE_VIOLATION',
        message: `User is not authorized for client scope "${rawValue}".`,
      });
    }
  }
}
