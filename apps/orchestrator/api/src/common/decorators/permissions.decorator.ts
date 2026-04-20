import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to specify which permissions are required to access an endpoint.
 * More granular than roles - checks specific permission names.
 *
 * Usage:
 * ```typescript
 * @Get('bots')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @RequirePermissions('bots:read')
 * getAllBots() {
 *   // Requires 'bots:read' permission
 * }
 *
 * // Multiple permissions (AND logic by default)
 * @Post('bots/:id/execute')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @RequirePermissions('bots:read', 'bots:execute')
 * executeBot(@Param('id') id: string) {
 *   // Requires BOTH 'bots:read' AND 'bots:execute'
 * }
 * ```
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Alternative name for better readability in some contexts
 */
export const Permissions = RequirePermissions;

export const PERMISSIONS_MODE_KEY = 'permissions_mode';

export type PermissionMode = 'all' | 'any';

/**
 * Decorator to change permission check mode.
 * Default is 'all' (AND logic).
 *
 * Usage:
 * ```typescript
 * @Post('resource')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @RequirePermissions('bots:write', 'schedules:write')
 * @PermissionMode('any')  // OR logic: either permission grants access
 * createResource() {
 *   // Can create if has 'bots:write' OR 'schedules:write'
 * }
 * ```
 */
export const RequirePermissionMode = (mode: PermissionMode) =>
  SetMetadata(PERMISSIONS_MODE_KEY, mode);
