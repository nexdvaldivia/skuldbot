import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CP_PERMISSIONS } from '../../common/authz/permissions';
import { UserRole } from '../../users/entities/user.entity';

@Injectable()
export class UsageIngestApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.headerValue(request.headers['x-api-key']);
    const licenseKey = this.headerValue(request.headers['x-license-key']);
    const orchestratorId = this.headerValue(request.headers['x-orchestrator-id']);

    if (!apiKey && !licenseKey) {
      throw new UnauthorizedException('Missing authentication credentials');
    }

    if (!orchestratorId) {
      throw new UnauthorizedException('Missing orchestrator ID');
    }

    this.assertKeyAllowList('USAGE_INGEST_API_KEYS', apiKey);
    this.assertKeyAllowList('USAGE_INGEST_LICENSE_KEYS', licenseKey);

    // The ingest endpoint is service-to-service auth. Provide scoped permission context.
    request.user = {
      role: UserRole.CLIENT_USER,
      metadata: {
        rbac: {
          extraPermissions: [CP_PERMISSIONS.BILLING_WRITE],
        },
      },
      authType: 'usage-ingest-api-key',
      orchestratorId,
    };

    return true;
  }

  private headerValue(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) {
      return this.clean(value[0]);
    }
    return this.clean(value);
  }

  private clean(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private assertKeyAllowList(configKey: string, suppliedValue: string | null): void {
    if (!suppliedValue) {
      return;
    }

    const raw = this.configService.get<string>(configKey);
    if (!raw) {
      return;
    }

    const allowList = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (allowList.length === 0) {
      return;
    }

    if (!allowList.includes(suppliedValue)) {
      throw new UnauthorizedException(`Invalid credential for ${configKey}`);
    }
  }
}
