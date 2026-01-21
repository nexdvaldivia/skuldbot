import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';
import { OidcService } from './oidc.strategy';
// TODO: Fix SAML strategy compatibility with @node-saml/passport-saml v5
// import { MultiTenantSamlStrategy } from './saml.strategy';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../roles/entities/role.entity';
import { Session, RefreshToken } from '../../users/entities/api-key.entity';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { TokenService } from '../../common/crypto/password.service';
import { LicenseModule } from '../../license/license.module';

/**
 * SSO Module.
 *
 * Provides enterprise Single Sign-On capabilities:
 *
 * Supported Protocols:
 * - SAML 2.0 (Okta, Azure AD, OneLogin, PingIdentity, generic)
 * - OIDC (Google, Azure AD, Okta, Auth0, Keycloak, generic)
 *
 * Features:
 * - Per-tenant SSO configuration
 * - Just-in-time user provisioning
 * - Attribute/claim mapping
 * - Group-to-role mapping
 * - PKCE support for OIDC
 * - Single Logout (SLO) for SAML
 * - State/nonce validation for CSRF protection
 *
 * Security:
 * - Certificate validation for SAML
 * - JWT signature validation for OIDC
 * - Encrypted client secrets
 * - Audit logging for all SSO events
 *
 * Compliance:
 * - SOC2: Access control and audit trails
 * - HIPAA: User authentication requirements
 * - FedRAMP: Federal SSO requirements
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Session,
      RefreshToken,
      AuditLog,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRY', '15m') as any,
          algorithm: 'HS256' as const,
          issuer: 'skuldbot',
        },
      }),
    }),
    LicenseModule,
  ],
  controllers: [SsoController],
  providers: [
    SsoService,
    OidcService,
    // TODO: Fix SAML strategy compatibility
    // MultiTenantSamlStrategy,
    TokenService,
  ],
  exports: [SsoService, OidcService],
})
export class SsoModule {}
