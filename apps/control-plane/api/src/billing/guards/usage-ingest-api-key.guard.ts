import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CP_PERMISSIONS } from '../../common/authz/permissions';
import { UserRole } from '../../users/entities/user.entity';
import { Client } from '../../clients/entities/client.entity';
import { hashSecretSha256 } from '../../common/utils/secret-crypto.util';

@Injectable()
export class UsageIngestApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const licenseKeyStatus = this.validateAllowList('USAGE_INGEST_LICENSE_KEYS', licenseKey);
    if (licenseKeyStatus === 'mismatch') {
      throw new UnauthorizedException('Invalid credential for USAGE_INGEST_LICENSE_KEYS');
    }
    const isLicenseAuthenticated = Boolean(licenseKey);

    const apiKeyStatus = this.validateAllowList('USAGE_INGEST_API_KEYS', apiKey);
    if (apiKeyStatus === 'mismatch') {
      throw new UnauthorizedException('Invalid credential for USAGE_INGEST_API_KEYS');
    }

    let matchedClientId: string | null = null;
    if (apiKey) {
      matchedClientId = await this.resolveClientIdFromApiKey(apiKey);
    }
    const isApiAuthenticated = apiKeyStatus === 'matched' || Boolean(matchedClientId);

    if (!isApiAuthenticated && !isLicenseAuthenticated) {
      throw new UnauthorizedException('Invalid API key or license key');
    }

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
      clientId: matchedClientId,
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

  private validateAllowList(
    configKey: string,
    suppliedValue: string | null,
  ): 'not_configured' | 'matched' | 'mismatch' {
    if (!suppliedValue) {
      return 'not_configured';
    }

    const raw = this.configService.get<string>(configKey);
    if (!raw) {
      return 'not_configured';
    }

    const allowList = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (allowList.length === 0) {
      return 'not_configured';
    }

    return allowList.includes(suppliedValue) ? 'matched' : 'mismatch';
  }

  private async resolveClientIdFromApiKey(apiKey: string): Promise<string | null> {
    const hash = hashSecretSha256(apiKey);
    const byHash = await this.clientRepository.findOne({
      where: { apiKeyHash: hash },
      select: ['id'],
    });
    if (byHash) {
      return byHash.id;
    }

    // Legacy fallback for deployments that still persisted plaintext API keys.
    const byLegacyValue = await this.clientRepository.findOne({
      where: { apiKey },
      select: ['id'],
    });
    return byLegacyValue?.id ?? null;
  }
}
