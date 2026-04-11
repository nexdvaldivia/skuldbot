import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export enum SsoProtocolDto {
  OIDC = 'oidc',
}

export enum SsoProviderDto {
  AZURE_ENTRA_ID = 'azure-entra-id',
  GOOGLE = 'google',
  AWS_COGNITO = 'aws-cognito',
  OKTA_OIDC = 'okta-oidc',
  AUTH0 = 'auth0',
  KEYCLOAK = 'keycloak',
  OIDC_GENERIC = 'oidc',
}

export class OidcClaimMappingDto {
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  groups?: string;

  @IsOptional()
  @IsString()
  picture?: string;
}

export class ConfigureTenantSsoDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsBoolean()
  enforced?: boolean;

  @IsOptional()
  @IsBoolean()
  autoProvision?: boolean;

  @IsOptional()
  @IsBoolean()
  jitProvisioning?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsString()
  defaultRoleId?: string;

  @IsEnum(SsoProviderDto)
  provider: SsoProviderDto;

  @IsOptional()
  @IsEnum(SsoProtocolDto)
  protocol?: SsoProtocolDto;

  @IsString()
  @MaxLength(255)
  clientId: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clientSecret?: string;

  @IsOptional()
  @IsUrl()
  discoveryUrl?: string;

  @IsOptional()
  @IsUrl()
  authorizationUrl?: string;

  @IsOptional()
  @IsUrl()
  tokenUrl?: string;

  @IsOptional()
  @IsUrl()
  userInfoUrl?: string;

  @IsOptional()
  @IsUrl()
  jwksUrl?: string;

  @IsArray()
  @IsString({ each: true })
  scopes: string[];

  @IsOptional()
  @IsBoolean()
  pkce?: boolean;

  @IsObject()
  claimMapping: OidcClaimMappingDto;

  @IsOptional()
  @IsObject()
  groupMapping?: Record<string, string>;
}

export class TestTenantSsoDto {
  @IsOptional()
  @IsUrl()
  discoveryUrl?: string;

  @IsOptional()
  @IsUrl()
  authorizationUrl?: string;

  @IsOptional()
  @IsUrl()
  tokenUrl?: string;
}

export interface TenantSsoConfigResponseDto {
  tenantId: string;
  tenantSlug: string;
  licenseId: string | null;
  enabled: boolean;
  enforced: boolean;
  provider: SsoProviderDto | null;
  protocol: SsoProtocolDto | null;
  autoProvision: boolean;
  jitProvisioning: boolean;
  allowedDomains: string[];
  defaultRoleId?: string;
  oidc: {
    clientId: string;
    hasClientSecret: boolean;
    discoveryUrl?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
    jwksUrl?: string;
    scopes: string[];
    pkce: boolean;
    claimMapping: OidcClaimMappingDto;
    groupMapping?: Record<string, string>;
  } | null;
  updatedAt: string | null;
}
