import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { User, UserStatus, AuthProvider } from '../../users/entities/user.entity';
import { Role } from '../../roles/entities/role.entity';
import { OidcConfig, SsoUserProfile, SsoProvider, SsoState } from './sso.types';
import { TokenService } from '../../common/crypto/password.service';
import { LicenseService } from '../../license/license.service';

/**
 * Tenant SSO configuration from license.
 */
interface TenantSsoConfig {
  id: string;
  slug: string;
  ssoEnabled: boolean;
  ssoConfig: OidcConfig | null;
}

/**
 * OIDC Authentication Strategy.
 *
 * Supports enterprise OIDC providers:
 * - Google Workspace
 * - Azure AD
 * - Okta
 * - Auth0
 * - Keycloak
 * - Generic OIDC
 *
 * Features:
 * - PKCE support
 * - Just-in-time user provisioning
 * - Claim mapping
 * - Group-to-role mapping
 * - Token refresh
 */
@Injectable()
export class OidcService {
  private jwksClients: Map<string, jwksClient.JwksClient> = new Map();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly licenseService: LicenseService,
  ) {}

  /**
   * Generate authorization URL for OIDC login.
   */
  async getAuthorizationUrl(
    tenantSlug: string,
    returnUrl?: string,
  ): Promise<{ url: string; state: string }> {
    const tenant = await this.getTenantWithSso(tenantSlug, 'oidc');
    const config = tenant.ssoConfig as OidcConfig;

    // Discover OIDC endpoints if not cached
    const endpoints = await this.discoverEndpoints(config);

    // Generate state for CSRF protection
    const state: SsoState = {
      tenantId: tenant.id,
      returnUrl,
      nonce: this.tokenService.generateSecureToken(16),
      createdAt: Date.now(),
      provider: SsoProvider.OIDC_GENERIC,
    };

    const stateToken = Buffer.from(JSON.stringify(state)).toString('base64url');

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: this.getCallbackUrl(tenantSlug),
      response_type: config.responseType || 'code',
      scope: config.scopes.join(' '),
      state: stateToken,
      nonce: state.nonce,
    });

    if (config.responseMode) {
      params.set('response_mode', config.responseMode);
    }

    // Add PKCE if enabled
    if (config.pkce) {
      const { codeVerifier, codeChallenge } = this.generatePkce();
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');

      // Store code verifier in state (or use session/cache)
      state.nonce = `${state.nonce}:${codeVerifier}`;
    }

    const url = `${endpoints.authorizationEndpoint}?${params.toString()}`;

    return { url, state: stateToken };
  }

  /**
   * Handle OIDC callback and authenticate user.
   */
  async handleCallback(
    tenantSlug: string,
    code: string,
    stateToken: string,
  ): Promise<{ user: User; tokens: any }> {
    // Decode and validate state
    let state: SsoState;
    try {
      state = JSON.parse(Buffer.from(stateToken, 'base64url').toString());
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_STATE',
        message: 'Invalid SSO state.',
      });
    }

    // Check state expiry (10 minutes)
    if (Date.now() - state.createdAt > 10 * 60 * 1000) {
      throw new UnauthorizedException({
        code: 'STATE_EXPIRED',
        message: 'SSO session expired. Please try again.',
      });
    }

    const tenant = await this.getTenantWithSso(tenantSlug, 'oidc');
    const config = tenant.ssoConfig as OidcConfig;

    // Verify tenant matches
    if (tenant.id !== state.tenantId) {
      throw new UnauthorizedException({
        code: 'TENANT_MISMATCH',
        message: 'Tenant mismatch in SSO state.',
      });
    }

    // Exchange code for tokens
    const endpoints = await this.discoverEndpoints(config);
    const tokens = await this.exchangeCodeForTokens(
      code,
      config,
      endpoints,
      tenantSlug,
      state.nonce,
    );

    // Validate ID token
    const idTokenPayload = await this.validateIdToken(
      tokens.id_token,
      config,
      state.nonce.split(':')[0],
    );

    // Extract user profile
    const userProfile = await this.extractUserProfile(
      idTokenPayload,
      tokens.access_token,
      config,
      endpoints,
    );

    // Validate email domain
    if (config.allowedDomains && config.allowedDomains.length > 0) {
      const emailDomain = userProfile.email.split('@')[1];
      if (!config.allowedDomains.includes(emailDomain)) {
        throw new UnauthorizedException({
          code: 'DOMAIN_NOT_ALLOWED',
          message: 'Your email domain is not allowed for this organization.',
        });
      }
    }

    // Find or create user
    let user = await this.userRepository.findOne({
      where: {
        email: userProfile.email.toLowerCase(),
        tenantId: tenant.id,
      },
      relations: ['roles'],
    });

    if (!user) {
      if (!config.autoProvision) {
        throw new UnauthorizedException({
          code: 'USER_NOT_FOUND',
          message: 'User not found and auto-provisioning is disabled.',
        });
      }

      user = await this.provisionUser(tenant, userProfile, config);
    } else {
      user = await this.updateUserFromProfile(user, userProfile, config);
    }

    // Check user status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: `User account is ${user.status}.`,
      });
    }

    return { user, tokens };
  }

  /**
   * Discover OIDC endpoints from discovery URL.
   */
  private async discoverEndpoints(
    config: OidcConfig,
  ): Promise<{
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    jwksUri: string;
  }> {
    if (config.discoveryUrl) {
      const response = await fetch(config.discoveryUrl);
      const discovery = await response.json();

      return {
        authorizationEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
        userInfoEndpoint: discovery.userinfo_endpoint,
        jwksUri: discovery.jwks_uri,
      };
    }

    // Use manual configuration
    return {
      authorizationEndpoint: config.authorizationUrl!,
      tokenEndpoint: config.tokenUrl!,
      userInfoEndpoint: config.userInfoUrl!,
      jwksUri: config.jwksUrl!,
    };
  }

  /**
   * Exchange authorization code for tokens.
   */
  private async exchangeCodeForTokens(
    code: string,
    config: OidcConfig,
    endpoints: { tokenEndpoint: string },
    tenantSlug: string,
    nonce: string,
  ): Promise<any> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.getCallbackUrl(tenantSlug),
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    // Add PKCE code verifier if present
    if (config.pkce && nonce.includes(':')) {
      const codeVerifier = nonce.split(':')[1];
      params.set('code_verifier', codeVerifier);
    }

    const response = await fetch(endpoints.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new UnauthorizedException({
        code: 'TOKEN_EXCHANGE_FAILED',
        message: `Failed to exchange code for tokens: ${error}`,
      });
    }

    return response.json();
  }

  /**
   * Validate ID token signature and claims.
   */
  private async validateIdToken(
    idToken: string,
    config: OidcConfig,
    nonce: string,
  ): Promise<any> {
    const endpoints = await this.discoverEndpoints(config);

    // Get JWKS client (cached per tenant)
    let client = this.jwksClients.get(config.clientId);
    if (!client) {
      client = jwksClient({
        jwksUri: endpoints.jwksUri,
        cache: true,
        rateLimit: true,
      });
      this.jwksClients.set(config.clientId, client);
    }

    // Decode header to get key ID
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new UnauthorizedException({
        code: 'INVALID_ID_TOKEN',
        message: 'Invalid ID token format.',
      });
    }

    // Get signing key (client is guaranteed to exist at this point)
    const key = await client!.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    // Verify token
    const payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256', 'RS384', 'RS512'],
      audience: config.clientId,
      issuer: config.issuer,
    }) as any;

    // Verify nonce
    if (payload.nonce !== nonce) {
      throw new UnauthorizedException({
        code: 'NONCE_MISMATCH',
        message: 'Invalid nonce in ID token.',
      });
    }

    return payload;
  }

  /**
   * Extract user profile from ID token and/or userinfo endpoint.
   */
  private async extractUserProfile(
    idTokenPayload: any,
    accessToken: string,
    config: OidcConfig,
    endpoints: { userInfoEndpoint: string },
  ): Promise<SsoUserProfile> {
    const mapping = config.claimMapping;

    // Try to get additional claims from userinfo endpoint
    let userInfo = idTokenPayload;
    try {
      const response = await fetch(endpoints.userInfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        userInfo = { ...idTokenPayload, ...(await response.json()) };
      }
    } catch {
      // Continue with ID token claims
    }

    // Extract email
    const email = this.getClaim(userInfo, mapping.email);
    if (!email) {
      throw new UnauthorizedException({
        code: 'EMAIL_MISSING',
        message: 'Email claim not found in OIDC response.',
      });
    }

    // Extract optional claims
    const firstName = mapping.firstName
      ? this.getClaim(userInfo, mapping.firstName)
      : undefined;
    const lastName = mapping.lastName
      ? this.getClaim(userInfo, mapping.lastName)
      : undefined;
    const displayName = mapping.displayName
      ? this.getClaim(userInfo, mapping.displayName)
      : undefined;
    const groups = mapping.groups
      ? this.getClaimArray(userInfo, mapping.groups)
      : undefined;
    const picture = mapping.picture
      ? this.getClaim(userInfo, mapping.picture)
      : undefined;

    return {
      email: email.toLowerCase(),
      firstName,
      lastName,
      displayName,
      avatarUrl: picture,
      groups,
      provider: SsoProvider.OIDC_GENERIC,
      providerId: userInfo.sub,
      rawAttributes: userInfo,
    };
  }

  /**
   * Get a claim value (supports nested paths like 'realm_access.roles').
   */
  private getClaim(obj: any, path: string): string | undefined {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  /**
   * Get a claim as an array.
   */
  private getClaimArray(obj: any, path: string): string[] {
    const value = this.getClaim(obj, path);
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  /**
   * Provision a new user from OIDC profile.
   */
  private async provisionUser(
    tenant: TenantSsoConfig,
    profile: SsoUserProfile,
    config: OidcConfig,
  ): Promise<User> {
    const roles = await this.mapGroupsToRoles(
      tenant.id,
      profile.groups || [],
      config.groupMapping,
      config.defaultRoleId,
    );

    const user = this.userRepository.create({
      email: profile.email.toLowerCase(),
      firstName: profile.firstName || profile.displayName?.split(' ')[0] || 'User',
      lastName:
        profile.lastName ||
        profile.displayName?.split(' ').slice(1).join(' ') ||
        '',
      avatarUrl: profile.avatarUrl,
      tenantId: tenant.id,
      authProvider: AuthProvider.OIDC,
      externalId: profile.providerId, // SSO provider ID
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      roles,
    });

    return this.userRepository.save(user);
  }

  /**
   * Update existing user from OIDC profile.
   */
  private async updateUserFromProfile(
    user: User,
    profile: SsoUserProfile,
    config: OidcConfig,
  ): Promise<User> {
    if (!user.externalId) {
      user.externalId = profile.providerId;
      user.authProvider = AuthProvider.OIDC;
    }

    if (config.jitProvisioning) {
      if (profile.firstName) user.firstName = profile.firstName;
      if (profile.lastName) user.lastName = profile.lastName;
      if (profile.avatarUrl) user.avatarUrl = profile.avatarUrl;

      if (config.groupMapping && profile.groups) {
        const roles = await this.mapGroupsToRoles(
          user.tenantId,
          profile.groups,
          config.groupMapping,
          config.defaultRoleId,
        );
        if (roles.length > 0) {
          user.roles = roles;
        }
      }
    }

    user.lastLoginAt = new Date();

    return this.userRepository.save(user);
  }

  /**
   * Map IdP groups to SkuldBot roles.
   */
  private async mapGroupsToRoles(
    tenantId: string,
    groups: string[],
    groupMapping: Record<string, string> | undefined,
    defaultRoleId: string | undefined,
  ): Promise<Role[]> {
    const roleIds: string[] = [];

    if (groupMapping) {
      for (const group of groups) {
        const roleId = groupMapping[group];
        if (roleId) {
          roleIds.push(roleId);
        }
      }
    }

    if (roleIds.length === 0 && defaultRoleId) {
      roleIds.push(defaultRoleId);
    }

    if (roleIds.length === 0) {
      const viewerRole = await this.roleRepository.findOne({
        where: { tenantId, name: 'viewer' },
      });
      if (viewerRole) {
        return [viewerRole];
      }
      return [];
    }

    return this.roleRepository.findByIds(roleIds);
  }

  /**
   * Get tenant SSO config from license.
   * In single-tenant mode, we use the license to get SSO configuration.
   */
  private async getTenantWithSso(
    tenantSlug: string,
    expectedProtocol: 'saml' | 'oidc',
  ): Promise<TenantSsoConfig> {
    // Get tenant info from license
    const license = await this.licenseService.getLicense();

    if (!license || license.tenant.slug !== tenantSlug) {
      throw new UnauthorizedException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found.',
      });
    }

    // SSO configuration should be in license features.ssoConfig
    const ssoConfig = license.features?.ssoConfig as OidcConfig | null;
    const ssoEnabled = license.features?.ssoEnabled === true;

    if (!ssoEnabled) {
      throw new UnauthorizedException({
        code: 'SSO_DISABLED',
        message: 'SSO is not enabled for this tenant.',
      });
    }

    if (!ssoConfig || (ssoConfig as any).protocol !== expectedProtocol) {
      throw new UnauthorizedException({
        code: 'SSO_PROTOCOL_MISMATCH',
        message: `Expected ${expectedProtocol.toUpperCase()} SSO configuration.`,
      });
    }

    return {
      id: license.tenant.id,
      slug: license.tenant.slug,
      ssoEnabled,
      ssoConfig,
    };
  }

  /**
   * Generate callback URL for a tenant.
   */
  private getCallbackUrl(tenantSlug: string): string {
    const baseUrl = this.configService.get('APP_URL', 'https://app.skuldbot.com');
    return `${baseUrl}/auth/oidc/${tenantSlug}/callback`;
  }

  /**
   * Generate PKCE code verifier and challenge.
   */
  private generatePkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = this.tokenService.generateSecureToken(32);

    // SHA256 hash and base64url encode
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
  }
}
