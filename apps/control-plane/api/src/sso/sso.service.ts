import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { License, LicenseFeatures } from '../licenses/entities/license.entity';
import { User, UserRole } from '../users/entities/user.entity';
import {
  ConfigureTenantSsoDto,
  SsoProviderDto,
  SsoProtocolDto,
  TenantSsoConfigResponseDto,
  TestTenantSsoDto,
} from './dto/sso.dto';
import {
  CP_PERMISSIONS,
  getUserGrantedPermissions,
  hasPermission,
} from '../common/authz/permissions';

type OidcSsoConfig = {
  protocol: SsoProtocolDto.OIDC;
  enabled: boolean;
  enforced: boolean;
  autoProvision: boolean;
  jitProvisioning: boolean;
  allowedDomains: string[];
  defaultRoleId?: string;
  provider: SsoProviderDto;
  clientId: string;
  clientSecretEncrypted?: string;
  discoveryUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  jwksUrl?: string;
  scopes: string[];
  pkce: boolean;
  claimMapping: {
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string;
    picture?: string;
  };
  groupMapping?: Record<string, string>;
};

@Injectable()
export class SsoService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    private readonly configService: ConfigService,
  ) {}

  async getTenantSsoConfig(
    tenantId: string,
    currentUser: User,
  ): Promise<TenantSsoConfigResponseDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    this.ensureTenantAccess(currentUser, tenant, 'read');

    const license = await this.getTenantLicense(tenantId);
    if (!license) {
      return this.emptyConfig(tenant);
    }

    const features = (license.features || {}) as LicenseFeatures;
    const rawConfig = this.getRawSsoConfig(features);
    const oidc = rawConfig && rawConfig.protocol === SsoProtocolDto.OIDC ? rawConfig : null;

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      licenseId: license.id,
      enabled: Boolean(features.ssoEnabled ?? features.sso ?? false),
      enforced: Boolean(features.ssoEnforced ?? false),
      provider: (features.ssoProvider as SsoProviderDto) || oidc?.provider || null,
      protocol: oidc?.protocol || null,
      autoProvision: Boolean(oidc?.autoProvision ?? false),
      jitProvisioning: Boolean(oidc?.jitProvisioning ?? false),
      allowedDomains: Array.isArray(oidc?.allowedDomains) ? oidc.allowedDomains : [],
      defaultRoleId: oidc?.defaultRoleId,
      oidc: oidc
        ? {
            clientId: oidc.clientId,
            hasClientSecret: Boolean(oidc.clientSecretEncrypted),
            discoveryUrl: oidc.discoveryUrl,
            authorizationUrl: oidc.authorizationUrl,
            tokenUrl: oidc.tokenUrl,
            userInfoUrl: oidc.userInfoUrl,
            jwksUrl: oidc.jwksUrl,
            scopes: Array.isArray(oidc.scopes) ? oidc.scopes : [],
            pkce: Boolean(oidc.pkce),
            claimMapping: oidc.claimMapping,
            groupMapping: oidc.groupMapping,
          }
        : null,
      updatedAt: license.updatedAt?.toISOString() || null,
    };
  }

  async configureTenantSso(
    tenantId: string,
    dto: ConfigureTenantSsoDto,
    currentUser: User,
  ): Promise<TenantSsoConfigResponseDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    this.ensureTenantAccess(currentUser, tenant, 'write');
    this.validateOidcConfiguration(dto);

    const license = await this.getTenantLicenseOrThrow(tenantId);
    const currentFeatures = (license.features || {}) as LicenseFeatures;
    const currentConfig = this.getRawSsoConfig(currentFeatures);

    const clientSecretEncrypted =
      dto.clientSecret && dto.clientSecret.trim().length > 0
        ? this.encryptSecret(dto.clientSecret)
        : currentConfig?.clientSecretEncrypted;

    if (!clientSecretEncrypted) {
      throw new BadRequestException({
        code: 'MISSING_CLIENT_SECRET',
        message:
          'OIDC clientSecret is required on first configuration. Provide clientSecret or keep an existing secret.',
      });
    }

    const normalizedConfig: OidcSsoConfig = {
      protocol: SsoProtocolDto.OIDC,
      enabled: dto.enabled,
      enforced: Boolean(dto.enforced),
      autoProvision: Boolean(dto.autoProvision),
      jitProvisioning: Boolean(dto.jitProvisioning),
      allowedDomains: (dto.allowedDomains || []).map((domain) => domain.trim()).filter(Boolean),
      defaultRoleId: dto.defaultRoleId?.trim() || undefined,
      provider: dto.provider,
      clientId: dto.clientId.trim(),
      clientSecretEncrypted,
      discoveryUrl: dto.discoveryUrl?.trim() || undefined,
      authorizationUrl: dto.authorizationUrl?.trim() || undefined,
      tokenUrl: dto.tokenUrl?.trim() || undefined,
      userInfoUrl: dto.userInfoUrl?.trim() || undefined,
      jwksUrl: dto.jwksUrl?.trim() || undefined,
      scopes: dto.scopes.map((scope) => scope.trim()).filter(Boolean),
      pkce: dto.pkce !== false,
      claimMapping: {
        email: dto.claimMapping.email.trim(),
        firstName: dto.claimMapping.firstName?.trim() || undefined,
        lastName: dto.claimMapping.lastName?.trim() || undefined,
        displayName: dto.claimMapping.displayName?.trim() || undefined,
        groups: dto.claimMapping.groups?.trim() || undefined,
        picture: dto.claimMapping.picture?.trim() || undefined,
      },
      groupMapping: dto.groupMapping || undefined,
    };

    const updatedFeatures: LicenseFeatures = {
      ...currentFeatures,
      sso: dto.enabled,
      ssoEnabled: dto.enabled,
      ssoEnforced: Boolean(dto.enforced),
      ssoProvider: dto.provider,
      ssoConfig: normalizedConfig,
    };

    license.features = updatedFeatures;
    await this.licenseRepository.save(license);

    return this.getTenantSsoConfig(tenant.id, currentUser);
  }

  async testTenantSsoConnection(
    tenantId: string,
    dto: TestTenantSsoDto,
    currentUser: User,
  ): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    this.ensureTenantAccess(currentUser, tenant, 'read');

    if (dto.discoveryUrl) {
      try {
        const response = await fetch(dto.discoveryUrl);
        if (!response.ok) {
          return {
            success: false,
            message: `OIDC discovery failed with status ${response.status}.`,
          };
        }

        const discovery = (await response.json()) as Record<string, unknown>;
        return {
          success: true,
          message: 'OIDC discovery successful.',
          details: {
            issuer: discovery.issuer,
            authorizationEndpoint: discovery.authorization_endpoint,
            tokenEndpoint: discovery.token_endpoint,
          },
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'OIDC discovery failed.',
        };
      }
    }

    if (dto.authorizationUrl && dto.tokenUrl) {
      return {
        success: true,
        message: 'OIDC manual endpoints look valid.',
      };
    }

    return {
      success: false,
      message: 'Provide discoveryUrl or both authorizationUrl and tokenUrl.',
    };
  }

  private emptyConfig(tenant: Tenant): TenantSsoConfigResponseDto {
    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      licenseId: null,
      enabled: false,
      enforced: false,
      provider: null,
      protocol: null,
      autoProvision: false,
      jitProvisioning: false,
      allowedDomains: [],
      oidc: null,
      updatedAt: null,
    };
  }

  private getRawSsoConfig(features: LicenseFeatures): OidcSsoConfig | null {
    const raw = features?.ssoConfig;
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    return raw as OidcSsoConfig;
  }

  private async getTenantLicense(tenantId: string): Promise<License | null> {
    const active = await this.licenseRepository.findOne({
      where: { tenantId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    if (active) return active;

    return this.licenseRepository.findOne({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
    });
  }

  private async getTenantLicenseOrThrow(tenantId: string): Promise<License> {
    const license = await this.getTenantLicense(tenantId);
    if (!license) {
      throw new BadRequestException({
        code: 'TENANT_LICENSE_REQUIRED',
        message: 'Tenant must have a license before configuring SSO.',
      });
    }
    return license;
  }

  private ensureTenantAccess(currentUser: User, tenant: Tenant, mode: 'read' | 'write'): void {
    if (currentUser.role === UserRole.SKULD_ADMIN) {
      return;
    }

    const grantedPermissions = getUserGrantedPermissions(currentUser);
    const canReadSso = hasPermission(grantedPermissions, CP_PERMISSIONS.SSO_READ);
    const canWriteSso = hasPermission(grantedPermissions, CP_PERMISSIONS.SSO_WRITE);
    const isGlobalScope = currentUser.clientId === null;
    const canAccessTenantScope = isGlobalScope || currentUser.clientId === tenant.clientId;

    if (mode === 'read' && canReadSso && canAccessTenantScope) {
      return;
    }

    if (mode === 'write' && canWriteSso && canAccessTenantScope) {
      return;
    }

    throw new ForbiddenException({
      code: 'TENANT_ACCESS_DENIED',
      message: 'You do not have access to this tenant configuration.',
    });
  }

  private validateOidcConfiguration(dto: ConfigureTenantSsoDto): void {
    if (!dto.discoveryUrl && (!dto.authorizationUrl || !dto.tokenUrl)) {
      throw new BadRequestException({
        code: 'OIDC_ENDPOINTS_REQUIRED',
        message: 'Provide discoveryUrl or both authorizationUrl and tokenUrl.',
      });
    }

    if (!dto.claimMapping?.email) {
      throw new BadRequestException({
        code: 'OIDC_CLAIM_MAPPING_INVALID',
        message: 'claimMapping.email is required.',
      });
    }
  }

  private encryptSecret(secret: string): string {
    const encryptionKey = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(secret, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return [
      'v1',
      salt.toString('base64'),
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted,
    ].join(':');
  }

  private getEncryptionKey(): string {
    const key =
      this.configService.get<string>('SSO_ENCRYPTION_KEY') ||
      this.configService.get<string>('INTEGRATIONS_ENCRYPTION_KEY');

    if (!key) {
      throw new BadRequestException({
        code: 'SSO_ENCRYPTION_KEY_MISSING',
        message:
          'SSO_ENCRYPTION_KEY or INTEGRATIONS_ENCRYPTION_KEY must be configured in Control Plane.',
      });
    }

    return key;
  }
}
