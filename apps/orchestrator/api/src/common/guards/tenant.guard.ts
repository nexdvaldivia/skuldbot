import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { LicenseService } from '../../license/license.service';
import { User } from '../../users/entities/user.entity';

/**
 * Tenant Guard - Validates license for single-tenant orchestrator.
 *
 * In the new architecture:
 * - Each Orchestrator instance IS a single tenant
 * - The license defines what tenant this orchestrator belongs to
 * - Users are validated against their roles, not tenant assignment
 *
 * This guard ensures:
 * 1. The orchestrator has a valid license
 * 2. The user is authenticated
 *
 * Should be applied after JwtAuthGuard.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly licenseService: LicenseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User;

    if (!user) {
      throw new ForbiddenException({
        code: 'NO_USER',
        message: 'User not found. Ensure JwtAuthGuard runs before TenantGuard.',
      });
    }

    // Check license validity
    const license = this.licenseService.getLicenseInfo();

    if (!license.valid) {
      throw new ForbiddenException({
        code: 'LICENSE_INVALID',
        message: license.message || 'Orchestrator license is invalid or expired.',
      });
    }

    // Attach tenant info from license to request for downstream use
    request.tenant = {
      id: license.tenantId,
      slug: license.tenantSlug,
      type: license.type,
      features: license.features,
    };

    return true;
  }
}

/**
 * @deprecated In single-tenant mode, all resources belong to the same tenant.
 * This function is kept for backwards compatibility but does nothing in the new architecture.
 */
export function createTenantResourceGuard(
  resourceName: string,
  getResourceTenantId: (request: unknown) => Promise<string | null>,
) {
  @Injectable()
  class TenantResourceGuard implements CanActivate {
    async canActivate(_context: ExecutionContext): Promise<boolean> {
      // In single-tenant mode, all resources belong to the same tenant
      // Just return true as the license guard already validated
      return true;
    }
  }

  return TenantResourceGuard;
}
