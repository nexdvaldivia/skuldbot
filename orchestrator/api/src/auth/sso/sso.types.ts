/**
 * SSO Types and Interfaces.
 *
 * Supports multiple SSO providers:
 * - SAML 2.0 (Okta, Azure AD, OneLogin, PingIdentity)
 * - OIDC (Google, Azure AD, Okta, Auth0, Keycloak)
 */

export enum SsoProvider {
  // SAML 2.0 Providers
  SAML_GENERIC = 'saml',
  OKTA_SAML = 'okta-saml',
  AZURE_AD_SAML = 'azure-ad-saml',
  ONELOGIN = 'onelogin',
  PING_IDENTITY = 'ping-identity',

  // OIDC Providers
  OIDC_GENERIC = 'oidc',
  GOOGLE = 'google',
  AZURE_AD = 'azure-ad',
  OKTA_OIDC = 'okta-oidc',
  AUTH0 = 'auth0',
  KEYCLOAK = 'keycloak',
}

export enum SsoProtocol {
  SAML = 'saml',
  OIDC = 'oidc',
}

/**
 * Base SSO configuration interface.
 */
export interface BaseSsoConfig {
  enabled: boolean;
  enforced: boolean; // Force all users to use SSO
  autoProvision: boolean; // Auto-create users on first login
  allowedDomains?: string[]; // Only allow emails from these domains
  defaultRoleId?: string; // Role to assign to new users
  jitProvisioning?: boolean; // Just-in-time provisioning
}

/**
 * SAML 2.0 Configuration.
 */
export interface SamlConfig extends BaseSsoConfig {
  protocol: SsoProtocol.SAML;

  // Identity Provider (IdP) settings
  idp: {
    entityId: string; // IdP Entity ID
    ssoUrl: string; // IdP SSO URL (HTTP-Redirect or HTTP-POST)
    sloUrl?: string; // IdP Single Logout URL
    certificate: string; // IdP X.509 Certificate (PEM format)
    certificateFingerprint?: string; // Alternative to full certificate
    signatureAlgorithm?: 'sha256' | 'sha512';
  };

  // Service Provider (SP) settings - auto-generated
  sp: {
    entityId: string; // Our Entity ID (e.g., https://app.skuldbot.com/saml/metadata)
    assertionConsumerServiceUrl: string; // ACS URL
    singleLogoutServiceUrl?: string; // SLO URL
    privateKey?: string; // For signing requests (encrypted)
    certificate?: string; // SP certificate
  };

  // Request/Response settings
  signRequests?: boolean;
  signatureAlgorithm?: 'sha256' | 'sha512';
  digestAlgorithm?: 'sha256' | 'sha512';
  wantAssertionsSigned?: boolean;
  wantResponseSigned?: boolean;
  wantMessagesSigned?: boolean;
  authnContext?: string; // e.g., 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport'

  // Attribute mapping
  attributeMapping: {
    email: string; // SAML attribute name for email
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string; // For role mapping
  };

  // Group to role mapping
  groupMapping?: Record<string, string>; // IdP group -> SkuldBot role ID
}

/**
 * OIDC Configuration.
 */
export interface OidcConfig extends BaseSsoConfig {
  protocol: SsoProtocol.OIDC;

  // Provider settings
  clientId: string;
  clientSecret: string; // Encrypted
  discoveryUrl?: string; // OIDC Discovery URL (.well-known/openid-configuration)

  // Manual configuration (if no discovery)
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  jwksUrl?: string;

  // OAuth settings
  scopes: string[]; // Default: ['openid', 'profile', 'email']
  responseType?: 'code' | 'token' | 'id_token';
  responseMode?: 'query' | 'fragment' | 'form_post';
  pkce?: boolean; // Use PKCE (recommended)

  // Token settings
  audience?: string;
  issuer?: string;

  // Claim mapping
  claimMapping: {
    email: string; // Default: 'email'
    firstName?: string; // Default: 'given_name'
    lastName?: string; // Default: 'family_name'
    displayName?: string; // Default: 'name'
    groups?: string; // For role mapping (e.g., 'groups', 'roles')
    picture?: string; // Avatar URL
  };

  // Group to role mapping
  groupMapping?: Record<string, string>; // IdP group -> SkuldBot role ID
}

export type SsoConfig = SamlConfig | OidcConfig;

/**
 * SSO User Profile - normalized from different providers.
 */
export interface SsoUserProfile {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  groups?: string[];
  rawAttributes?: Record<string, any>;
  provider: SsoProvider;
  providerId: string; // Unique ID from provider (nameId for SAML, sub for OIDC)
}

/**
 * SSO State for CSRF protection.
 */
export interface SsoState {
  tenantId: string;
  returnUrl?: string;
  nonce: string;
  createdAt: number;
  provider: SsoProvider;
}

/**
 * SSO Session after successful authentication.
 */
export interface SsoSession {
  userId: string;
  tenantId: string;
  provider: SsoProvider;
  providerId: string;
  sessionIndex?: string; // SAML session index for SLO
  accessToken?: string; // OIDC access token
  idToken?: string; // OIDC ID token
  refreshToken?: string; // OIDC refresh token
  expiresAt?: Date;
}

/**
 * Pre-configured provider templates.
 */
export const PROVIDER_TEMPLATES: Record<
  string,
  Partial<OidcConfig> | Partial<SamlConfig>
> = {
  // Google Workspace
  [SsoProvider.GOOGLE]: {
    protocol: SsoProtocol.OIDC,
    discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
    scopes: ['openid', 'profile', 'email'],
    pkce: true,
    claimMapping: {
      email: 'email',
      firstName: 'given_name',
      lastName: 'family_name',
      displayName: 'name',
      picture: 'picture',
    },
  } as Partial<OidcConfig>,

  // Azure AD (OIDC)
  [SsoProvider.AZURE_AD]: {
    protocol: SsoProtocol.OIDC,
    // discoveryUrl template: https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    pkce: true,
    claimMapping: {
      email: 'preferred_username',
      firstName: 'given_name',
      lastName: 'family_name',
      displayName: 'name',
      groups: 'groups',
    },
  } as Partial<OidcConfig>,

  // Okta (OIDC)
  [SsoProvider.OKTA_OIDC]: {
    protocol: SsoProtocol.OIDC,
    // discoveryUrl template: https://{domain}.okta.com/.well-known/openid-configuration
    scopes: ['openid', 'profile', 'email', 'groups'],
    pkce: true,
    claimMapping: {
      email: 'email',
      firstName: 'given_name',
      lastName: 'family_name',
      displayName: 'name',
      groups: 'groups',
    },
  } as Partial<OidcConfig>,

  // Auth0
  [SsoProvider.AUTH0]: {
    protocol: SsoProtocol.OIDC,
    // discoveryUrl template: https://{domain}.auth0.com/.well-known/openid-configuration
    scopes: ['openid', 'profile', 'email'],
    pkce: true,
    claimMapping: {
      email: 'email',
      firstName: 'given_name',
      lastName: 'family_name',
      displayName: 'name',
      picture: 'picture',
    },
  } as Partial<OidcConfig>,

  // Keycloak
  [SsoProvider.KEYCLOAK]: {
    protocol: SsoProtocol.OIDC,
    // discoveryUrl template: https://{host}/realms/{realm}/.well-known/openid-configuration
    scopes: ['openid', 'profile', 'email', 'roles'],
    pkce: true,
    claimMapping: {
      email: 'email',
      firstName: 'given_name',
      lastName: 'family_name',
      displayName: 'name',
      groups: 'realm_access.roles',
    },
  } as Partial<OidcConfig>,

  // Okta (SAML)
  [SsoProvider.OKTA_SAML]: {
    protocol: SsoProtocol.SAML,
    signRequests: true,
    wantAssertionsSigned: true,
    signatureAlgorithm: 'sha256',
    attributeMapping: {
      email: 'email',
      firstName: 'firstName',
      lastName: 'lastName',
      displayName: 'displayName',
      groups: 'groups',
    },
  } as Partial<SamlConfig>,

  // Azure AD (SAML)
  [SsoProvider.AZURE_AD_SAML]: {
    protocol: SsoProtocol.SAML,
    signRequests: false,
    wantAssertionsSigned: true,
    signatureAlgorithm: 'sha256',
    attributeMapping: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      displayName: 'http://schemas.microsoft.com/identity/claims/displayname',
      groups: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
    },
  } as Partial<SamlConfig>,
};
