import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles can access an endpoint.
 *
 * Usage:
 * ```typescript
 * @Post('users')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('admin')
 * createUser(@Body() dto: CreateUserDto) {
 *   // Only admins can access
 * }
 *
 * // Multiple roles (OR logic)
 * @Delete('bots/:id')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('admin', 'operator')
 * deleteBot(@Param('id') id: string) {
 *   // Admins OR operators can access
 * }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
