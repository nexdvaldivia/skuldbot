import { applyDecorators, SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissions_mode';
export const PERMISSION_CONSTRAINT_KEY = 'permission_constraint';

export type PermissionMode = 'all' | 'any';
export type PermissionConstraintSource = 'params' | 'body' | 'query';

export interface PermissionConstraint {
  scope: 'client';
  key: string;
  source?: PermissionConstraintSource;
  allowSkuldBypass?: boolean;
}

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequirePermissionMode = (mode: PermissionMode) =>
  SetMetadata(PERMISSIONS_MODE_KEY, mode);

export const RequirePermission = (permission: string, constraint?: PermissionConstraint) => {
  if (!constraint) {
    return RequirePermissions(permission);
  }

  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, [permission]),
    SetMetadata(PERMISSION_CONSTRAINT_KEY, constraint),
  );
};
