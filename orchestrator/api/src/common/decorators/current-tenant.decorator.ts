import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Tenant info from license - attached to request by TenantGuard.
 */
export interface TenantInfo {
  id: string;
  slug: string;
  type: string;
  features: Record<string, any>;
}

/**
 * Decorator to extract the current tenant from the request.
 * In single-tenant mode, tenant info comes from the license.
 *
 * Usage:
 * ```typescript
 * @Get('settings')
 * @UseGuards(JwtAuthGuard, TenantGuard)
 * getSettings(@CurrentTenant() tenant: TenantInfo) {
 *   return tenant.features;
 * }
 *
 * // Get tenant ID only
 * @Get('bots')
 * @UseGuards(JwtAuthGuard, TenantGuard)
 * getBots(@CurrentTenant('id') tenantId: string) {
 *   return this.botsService.findAll(tenantId);
 * }
 * ```
 */
export const CurrentTenant = createParamDecorator(
  (data: keyof TenantInfo | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenant = request.tenant as TenantInfo;

    if (!tenant) {
      // Fallback to user's tenantId if tenant object not loaded
      const user = request.user;
      if (user && data === 'id') {
        return user.tenantId;
      }
      return null;
    }

    return data ? tenant[data] : tenant;
  },
);

/**
 * Decorator to get just the tenant ID (shorthand).
 *
 * Usage:
 * ```typescript
 * @Get('bots')
 * @UseGuards(JwtAuthGuard, TenantGuard)
 * getBots(@TenantId() tenantId: string) {
 *   return this.botsService.findAll(tenantId);
 * }
 * ```
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();

    // First check if tenant is loaded from license
    if (request.tenant?.id) {
      return request.tenant.id;
    }

    // Fallback to user's tenantId
    if (request.user?.tenantId) {
      return request.user.tenantId;
    }

    // Return empty string as fallback to satisfy TypeScript
    // Guards should prevent reaching this point
    return '';
  },
);
