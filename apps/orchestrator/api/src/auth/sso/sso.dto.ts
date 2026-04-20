import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsUrl,
  IsObject,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SsoProvider, SsoProtocol } from './sso.types';

// ============================================================================
// SAML CONFIGURATION DTOs
// ============================================================================

export class SamlIdpConfigDto {
  @IsString()
  entityId: string;

  @IsUrl()
  ssoUrl: string;

  @IsOptional()
  @IsUrl()
  sloUrl?: string;

  @IsString()
  @MinLength(100)
  certificate: string; // PEM format

  @IsOptional()
  @IsEnum(['sha256', 'sha512'])
  signatureAlgorithm?: 'sha256' | 'sha512';
}

export class SamlAttributeMappingDto {
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
}

export class ConfigureSamlDto {
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

  @ValidateNested()
  @Type(() => SamlIdpConfigDto)
  idp: SamlIdpConfigDto;

  @ValidateNested()
  @Type(() => SamlAttributeMappingDto)
  attributeMapping: SamlAttributeMappingDto;

  @IsOptional()
  @IsBoolean()
  signRequests?: boolean;

  @IsOptional()
  @IsBoolean()
  wantAssertionsSigned?: boolean;

  @IsOptional()
  @IsBoolean()
  wantResponseSigned?: boolean;

  @IsOptional()
  @IsObject()
  groupMapping?: Record<string, string>;
}

// ============================================================================
// OIDC CONFIGURATION DTOs
// ============================================================================

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

export class ConfigureOidcDto {
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

  @IsEnum(SsoProvider)
  provider: SsoProvider;

  @IsString()
  clientId: string;

  @IsString()
  clientSecret: string;

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

  @ValidateNested()
  @Type(() => OidcClaimMappingDto)
  claimMapping: OidcClaimMappingDto;

  @IsOptional()
  @IsObject()
  groupMapping?: Record<string, string>;
}

// ============================================================================
// TEST CONNECTION DTO
// ============================================================================

export class TestSsoConnectionDto {
  @IsEnum(SsoProtocol)
  protocol: SsoProtocol;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfigureSamlDto)
  saml?: ConfigureSamlDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfigureOidcDto)
  oidc?: ConfigureOidcDto;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class SsoConfigResponseDto {
  enabled: boolean;
  enforced: boolean;
  protocol?: SsoProtocol;
  provider?: SsoProvider;
  autoProvision: boolean;
  allowedDomains: string[];
  defaultRoleId?: string;

  // SAML specific (without sensitive data)
  saml?: {
    entityId: string;
    ssoUrl: string;
    sloUrl?: string;
    hasCertificate: boolean;
    signRequests: boolean;
    wantAssertionsSigned: boolean;
    attributeMapping: SamlAttributeMappingDto;
    groupMapping?: Record<string, string>;
    sp: {
      entityId: string;
      assertionConsumerServiceUrl: string;
      singleLogoutServiceUrl?: string;
    };
  };

  // OIDC specific (without sensitive data)
  oidc?: {
    provider: SsoProvider;
    clientId: string;
    hasClientSecret: boolean;
    discoveryUrl?: string;
    scopes: string[];
    pkce: boolean;
    claimMapping: OidcClaimMappingDto;
    groupMapping?: Record<string, string>;
  };
}

export class SsoMetadataResponseDto {
  xml: string;
  entityId: string;
  assertionConsumerServiceUrl: string;
  singleLogoutServiceUrl?: string;
  downloadUrl: string;
}

// ============================================================================
// SSO LOGIN INITIATION DTOs
// ============================================================================

export class InitiateSsoLoginDto {
  @IsString()
  tenant: string;

  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class SsoCallbackResultDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  returnUrl?: string;
}
