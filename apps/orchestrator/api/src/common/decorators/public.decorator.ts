import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark an endpoint as publicly accessible (no auth required).
 * Use sparingly - most endpoints should require authentication.
 *
 * Usage:
 * ```typescript
 * @Get('health')
 * @Public()
 * healthCheck() {
 *   return { status: 'ok' };
 * }
 *
 * @Post('auth/login')
 * @Public()
 * login(@Body() dto: LoginDto) {
 *   // Login endpoint must be public
 * }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Alternative decorator names for clarity
 */
export const SkipAuth = Public;
export const AllowAnonymous = Public;
