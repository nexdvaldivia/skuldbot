import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../roles/entities/role.entity';
import { AuditLog, AuditCategory, AuditAction, AuditResult } from '../../audit/entities/audit-log.entity';
import { Session, RefreshToken } from '../../users/entities/api-key.entity';
import { TokenService } from '../../common/crypto/password.service';
import { OidcService } from './oidc.strategy';
import { LicenseService } from '../../license/license.service';

// TODO: Fix SAML strategy compatibility with @node-saml/passport-saml v5
// import { generateSamlMetadata } from './saml.strategy';
function generateSamlMetadata(_config: SamlConfig): string {
  throw new Error('SAML support is temporarily unavailable. Please use OIDC.');
}
import {
  SsoProtocol,
  SamlConfig,
  OidcConfig,
  SsoState,
  PROVIDER_TEMPLATES,
} from './sso.types';
import {
  ConfigureSamlDto,
  ConfigureOidcDto,
  TestSsoConnectionDto,
  SsoConfigResponseDto,
  SsoMetadataResponseDto,
} from './sso.dto';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * Tenant SSO info from license.
 */
interface TenantSsoInfo {
  id: string;
  slug: string;
  ssoEnabled: boolean;
  ssoEnforced: boolean;
  ssoProvider: string | null;
  ssoConfig: SamlConfig | OidcConfig | null;
}

/**
 * SSO Service.
 *
 * Handles SSO configuration and authentication flows:
 * - SAML 2.0 configuration and authentication
 * - OIDC configuration and authentication
 * - Token generation after successful SSO
 * - Audit logging
 *
 * Security features:
 * - State parameter for CSRF protection
 * - Nonce validation for OIDC
 * - Certificate validation for SAML
 * - Automatic session creation
 */
@Injectable()
export class SsoService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly oidcService: OidcService,
    private readonly licenseService: LicenseService,
  ) {}

  /**
   * Get tenant SSO info from license.
   */
  private async getTenantSsoInfo(tenantId?: string): Promise<TenantSsoInfo> {
    const license = await this.licenseService.getLicense();
    if (!license) {
      throw new NotFoundException('License not found');
    }

    // In single-tenant mode, tenantId should match license tenant
    if (tenantId && license.tenant.id !== tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    // SSO config is stored in license features.ssoConfig
    const ssoConfig = license.features?.ssoConfig as SamlConfig | OidcConfig | null;
    const ssoEnabled = license.features?.ssoEnabled === true;
    const ssoEnforced = license.features?.ssoEnforced === true;
    const ssoProvider = license.features?.ssoProvider as string | null;

    return {
      id: license.tenant.id,
      slug: license.tenant.slug,
      ssoEnabled,
      ssoEnforced,
      ssoProvider,
      ssoConfig,
    };
  }

  /**
   * Get tenant SSO info by slug.
   */
  private async getTenantSsoInfoBySlug(slug: string): Promise<TenantSsoInfo> {
    const license = await this.licenseService.getLicense();
    if (!license || license.tenant.slug !== slug) {
      throw new NotFoundException('Tenant not found');
    }

    const ssoConfig = license.features?.ssoConfig as SamlConfig | OidcConfig | null;
    const ssoEnabled = license.features?.ssoEnabled === true;
    const ssoEnforced = license.features?.ssoEnforced === true;
    const ssoProvider = license.features?.ssoProvider as string | null;

    return {
      id: license.tenant.id,
      slug: license.tenant.slug,
      ssoEnabled,
      ssoEnforced,
      ssoProvider,
      ssoConfig,
    };
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  async getConfig(tenantId: string): Promise<SsoConfigResponseDto> {
    const tenant = await this.getTenantSsoInfo(tenantId);

    if (!tenant.ssoEnabled || !tenant.ssoConfig) {
      return {
        enabled: false,
        enforced: false,
        autoProvision: false,
        allowedDomains: [],
      };
    }

    const config = tenant.ssoConfig;
    const baseResponse = {
      enabled: tenant.ssoEnabled,
      enforced: tenant.ssoEnforced,
      autoProvision: config.autoProvision || false,
      allowedDomains: config.allowedDomains || [],
      defaultRoleId: config.defaultRoleId,
    };

    if ((config as any).protocol === SsoProtocol.SAML) {
      const samlConfig = config as SamlConfig;
      return {
        ...baseResponse,
        protocol: SsoProtocol.SAML,
        saml: {
          entityId: samlConfig.idp.entityId,
          ssoUrl: samlConfig.idp.ssoUrl,
          sloUrl: samlConfig.idp.sloUrl,
          hasCertificate: !!samlConfig.idp.certificate,
          signRequests: samlConfig.signRequests || false,
          wantAssertionsSigned: samlConfig.wantAssertionsSigned ?? true,
          attributeMapping: samlConfig.attributeMapping,
          groupMapping: samlConfig.groupMapping,
          sp: samlConfig.sp,
        },
      };
    } else {
      const oidcConfig = config as OidcConfig;
      return {
        ...baseResponse,
        protocol: SsoProtocol.OIDC,
        provider: oidcConfig.protocol as any,
        oidc: {
          provider: oidcConfig.protocol as any,
          clientId: oidcConfig.clientId,
          hasClientSecret: !!oidcConfig.clientSecret,
          discoveryUrl: oidcConfig.discoveryUrl,
          scopes: oidcConfig.scopes,
          pkce: oidcConfig.pkce || false,
          claimMapping: oidcConfig.claimMapping,
          groupMapping: oidcConfig.groupMapping,
        },
      };
    }
  }

  async configureSaml(
    tenantId: string,
    dto: ConfigureSamlDto,
    configuredBy: User,
  ): Promise<SsoConfigResponseDto> {
    // In single-tenant mode, SSO configuration is managed via the Control Plane.
    // This method is kept for API compatibility but will throw an error.
    throw new BadRequestException({
      code: 'SSO_CONFIG_VIA_CONTROL_PLANE',
      message: 'SSO configuration must be done via the Control Plane. Please contact your administrator.',
    });
  }

  async configureOidc(
    tenantId: string,
    dto: ConfigureOidcDto,
    configuredBy: User,
  ): Promise<SsoConfigResponseDto> {
    // In single-tenant mode, SSO configuration is managed via the Control Plane.
    // This method is kept for API compatibility but will throw an error.
    throw new BadRequestException({
      code: 'SSO_CONFIG_VIA_CONTROL_PLANE',
      message: 'SSO configuration must be done via the Control Plane. Please contact your administrator.',
    });
  }

  async disableSso(
    tenantId: string,
    disabledBy: User,
  ): Promise<{ message: string }> {
    // In single-tenant mode, SSO configuration is managed via the Control Plane.
    throw new BadRequestException({
      code: 'SSO_CONFIG_VIA_CONTROL_PLANE',
      message: 'SSO configuration must be done via the Control Plane. Please contact your administrator.',
    });
  }

  async testConnection(
    tenantId: string,
    dto: TestSsoConnectionDto,
  ): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      if (dto.protocol === SsoProtocol.SAML && dto.saml) {
        // Test SAML: Validate certificate format
        const cert = dto.saml.idp.certificate;
        if (!cert.includes('-----BEGIN CERTIFICATE-----')) {
          return {
            success: false,
            message: 'Invalid certificate format. Must be PEM encoded.',
          };
        }

        // Test IdP SSO URL reachability
        try {
          const response = await fetch(dto.saml.idp.ssoUrl, { method: 'HEAD' });
          if (!response.ok && response.status !== 405) {
            return {
              success: false,
              message: `IdP SSO URL is not reachable: ${response.status}`,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            message: `Cannot reach IdP: ${error.message}`,
          };
        }

        return {
          success: true,
          message: 'SAML configuration appears valid.',
          details: {
            entityId: dto.saml.idp.entityId,
            ssoUrl: dto.saml.idp.ssoUrl,
          },
        };
      } else if (dto.protocol === SsoProtocol.OIDC && dto.oidc) {
        // Test OIDC: Fetch discovery document
        if (dto.oidc.discoveryUrl) {
          try {
            const response = await fetch(dto.oidc.discoveryUrl);
            if (!response.ok) {
              return {
                success: false,
                message: `Cannot fetch OIDC discovery: ${response.status}`,
              };
            }

            const discovery = await response.json();
            return {
              success: true,
              message: 'OIDC discovery successful.',
              details: {
                issuer: discovery.issuer,
                authorizationEndpoint: discovery.authorization_endpoint,
                tokenEndpoint: discovery.token_endpoint,
              },
            };
          } catch (error: any) {
            return {
              success: false,
              message: `OIDC discovery failed: ${error.message}`,
            };
          }
        } else {
          // Test manual endpoints
          if (!dto.oidc.authorizationUrl || !dto.oidc.tokenUrl) {
            return {
              success: false,
              message: 'Either discoveryUrl or manual endpoints are required.',
            };
          }

          return {
            success: true,
            message: 'OIDC configuration validated (manual mode).',
          };
        }
      }

      return {
        success: false,
        message: 'Invalid test configuration.',
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Test failed: ${error.message}`,
      };
    }
  }

  async getSamlMetadata(tenantId: string): Promise<SsoMetadataResponseDto> {
    const tenant = await this.getTenantSsoInfo(tenantId);

    if (!tenant.ssoConfig) {
      throw new NotFoundException('SSO not configured');
    }

    const config = tenant.ssoConfig as SamlConfig;
    if ((config as any).protocol !== SsoProtocol.SAML) {
      throw new BadRequestException('SAML is not configured');
    }

    const xml = generateSamlMetadata(config);
    const baseUrl = this.configService.get('APP_URL', 'https://app.skuldbot.com');

    return {
      xml,
      entityId: config.sp.entityId,
      assertionConsumerServiceUrl: config.sp.assertionConsumerServiceUrl,
      singleLogoutServiceUrl: config.sp.singleLogoutServiceUrl,
      downloadUrl: `${baseUrl}/auth/sso/saml/${tenant.slug}/metadata`,
    };
  }

  async getPublicSamlMetadata(tenantSlug: string): Promise<string> {
    const tenant = await this.getTenantSsoInfoBySlug(tenantSlug);

    if (!tenant.ssoEnabled || !tenant.ssoConfig) {
      throw new NotFoundException('SSO not configured');
    }

    const config = tenant.ssoConfig as SamlConfig;
    return generateSamlMetadata(config);
  }

  // ============================================================================
  // SAML AUTHENTICATION
  // ============================================================================

  async initiateSamlLogin(
    tenantSlug: string,
    returnUrl?: string,
  ): Promise<string> {
    const tenant = await this.getTenantSsoInfoBySlug(tenantSlug);

    if (!tenant.ssoEnabled || !tenant.ssoConfig) {
      throw new BadRequestException('SSO not configured');
    }

    const config = tenant.ssoConfig as SamlConfig;
    if ((config as any).protocol !== SsoProtocol.SAML) {
      throw new BadRequestException('SAML SSO is not configured');
    }

    // Build SAML AuthnRequest URL
    // In production, use passport-saml to generate proper signed request
    const params = new URLSearchParams({
      SAMLRequest: this.generateSamlAuthnRequest(config, returnUrl),
    });

    if (returnUrl) {
      params.set('RelayState', returnUrl);
    }

    return `${config.idp.ssoUrl}?${params.toString()}`;
  }

  async handleSamlCallback(
    tenantSlug: string,
    samlResponse: string,
    relayState: string | undefined,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    returnUrl?: string;
  }> {
    // In production, this would use passport-saml to validate the response
    // For now, we'll assume the MultiTenantSamlStrategy handles validation

    // This is a placeholder - actual SAML response parsing requires passport-saml
    throw new BadRequestException(
      'SAML callback should be handled by passport-saml strategy',
    );
  }

  async initiateSamlLogout(
    tenantSlug: string,
    sessionIndex?: string,
  ): Promise<string | null> {
    const tenant = await this.getTenantSsoInfoBySlug(tenantSlug);

    if (!tenant.ssoEnabled || !tenant.ssoConfig) {
      throw new BadRequestException('SSO not configured');
    }

    const config = tenant.ssoConfig as SamlConfig;
    if ((config as any).protocol !== SsoProtocol.SAML) {
      throw new BadRequestException('SAML SSO is not configured');
    }

    if (!config.idp.sloUrl) {
      return null; // SLO not configured
    }

    // Build SAML LogoutRequest
    const params = new URLSearchParams({
      SAMLRequest: this.generateSamlLogoutRequest(config, sessionIndex),
    });

    return `${config.idp.sloUrl}?${params.toString()}`;
  }

  // ============================================================================
  // OIDC AUTHENTICATION
  // ============================================================================

  async initiateOidcLogin(
    tenantSlug: string,
    returnUrl?: string,
  ): Promise<{ url: string; state: string }> {
    return this.oidcService.getAuthorizationUrl(tenantSlug, returnUrl);
  }

  async handleOidcCallback(
    tenantSlug: string,
    code: string,
    state: string,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    returnUrl?: string;
  }> {
    const { user, tokens } = await this.oidcService.handleCallback(
      tenantSlug,
      code,
      state,
    );

    // Create auth session and generate JWT tokens
    const authTokens = await this.createAuthSession(user, clientInfo);

    // Get return URL from state
    let returnUrl: string | undefined;
    try {
      const stateData: SsoState = JSON.parse(
        Buffer.from(state, 'base64url').toString(),
      );
      returnUrl = stateData.returnUrl;
    } catch {
      // Ignore state parsing errors
    }

    // Audit successful login
    await this.auditRepository.save({
      tenantId: user.tenantId,
      userId: user.id,
      userEmail: user.email,
      category: AuditCategory.AUTH,
      action: AuditAction.LOGIN,
      result: AuditResult.SUCCESS,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      metadata: { ssoProvider: 'oidc' },
    });

    return {
      ...authTokens,
      returnUrl,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================


  private async createAuthSession(
    user: User,
    clientInfo: { ip: string; userAgent: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const familyId = this.tokenService.generateSessionId();
    const sessionId = this.tokenService.generateSessionId();

    // Create session
    const session = this.sessionRepository.create({
      id: sessionId,
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceName: this.parseDeviceName(clientInfo.userAgent),
    });

    await this.sessionRepository.save(session);

    // Generate tokens
    const accessTokenExpiry = this.configService.get('JWT_ACCESS_EXPIRY', '15m');
    const refreshTokenExpiry = this.configService.get('JWT_REFRESH_EXPIRY', '7d');

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      roles: user.roles?.map((r) => r.name) || [],
      sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseExpiryToSeconds(accessTokenExpiry),
    };

    const accessToken = this.jwtService.sign(payload);

    // Create refresh token
    const refreshPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + this.parseExpiryToSeconds(refreshTokenExpiry),
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
    });

    // Store refresh token
    const tokenHash = this.tokenService.hashToken(refreshToken);
    const storedToken = this.refreshTokenRepository.create({
      tokenHash,
      userId: user.id,
      tenantId: user.tenantId,
      familyId,
      expiresAt: new Date(
        Date.now() + this.parseExpiryToSeconds(refreshTokenExpiry) * 1000,
      ),
    });

    await this.refreshTokenRepository.save(storedToken);

    // Update session with refresh token reference
    session.refreshTokenId = storedToken.id;
    await this.sessionRepository.save(session);

    // Update user last login
    user.lastLoginAt = new Date();
    user.lastLoginIp = clientInfo.ip;
    await this.userRepository.save(user);

    return { accessToken, refreshToken };
  }

  private async auditSsoChange(
    tenantId: string,
    user: User,
    event: string,
    details: any,
  ): Promise<void> {
    await this.auditRepository.save({
      tenantId,
      userId: user.id,
      userEmail: user.email,
      category: AuditCategory.SETTING,
      action: AuditAction.UPDATE,
      result: AuditResult.SUCCESS,
      resourceType: 'sso_config',
      resourceId: tenantId,
      metadata: { event, ...details },
    });
  }

  private generateSamlAuthnRequest(
    config: SamlConfig,
    relayState?: string,
  ): string {
    // Simplified SAML AuthnRequest - in production use passport-saml
    const id = `_${this.tokenService.generateSecureToken(16)}`;
    const issueInstant = new Date().toISOString();

    const request = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="${id}"
        Version="2.0"
        IssueInstant="${issueInstant}"
        Destination="${config.idp.ssoUrl}"
        AssertionConsumerServiceURL="${config.sp.assertionConsumerServiceUrl}"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
        <saml:Issuer>${config.sp.entityId}</saml:Issuer>
        <samlp:NameIDPolicy
          Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
          AllowCreate="true"/>
      </samlp:AuthnRequest>
    `.trim();

    return Buffer.from(request).toString('base64');
  }

  private generateSamlLogoutRequest(
    config: SamlConfig,
    sessionIndex?: string,
  ): string {
    const id = `_${this.tokenService.generateSecureToken(16)}`;
    const issueInstant = new Date().toISOString();

    const request = `
      <samlp:LogoutRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="${id}"
        Version="2.0"
        IssueInstant="${issueInstant}"
        Destination="${config.idp.sloUrl}">
        <saml:Issuer>${config.sp.entityId}</saml:Issuer>
        ${sessionIndex ? `<samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>` : ''}
      </samlp:LogoutRequest>
    `.trim();

    return Buffer.from(request).toString('base64');
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900;

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    switch (unit) {
      case 's': return num;
      case 'm': return num * 60;
      case 'h': return num * 60 * 60;
      case 'd': return num * 60 * 60 * 24;
      default: return 900;
    }
  }

  private parseDeviceName(userAgent: string): string {
    if (!userAgent) return 'Unknown Device';
    if (userAgent.includes('Mobile')) return 'Mobile Device';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux';
    return 'Unknown Device';
  }
}
