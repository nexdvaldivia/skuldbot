import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissions_mode';

export type PermissionMode = 'all' | 'any';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequirePermissionMode = (mode: PermissionMode) =>
  SetMetadata(PERMISSIONS_MODE_KEY, mode);
