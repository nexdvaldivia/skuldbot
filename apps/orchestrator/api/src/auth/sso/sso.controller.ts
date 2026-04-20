import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { SsoService } from './sso.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/interceptors/audit.interceptor';
import { AuditCategory, AuditAction } from '../../audit/entities/audit-log.entity';
import { User } from '../../users/entities/user.entity';
import {
  ConfigureSamlDto,
  ConfigureOidcDto,
  TestSsoConnectionDto,
  SsoConfigResponseDto,
  SsoMetadataResponseDto,
} from './sso.dto';

/**
 * SSO Controller.
 *
 * Handles SSO configuration and authentication flows:
 *
 * Admin endpoints (protected):
 * - GET    /sso/config                  - Get current SSO configuration
 * - POST   /sso/config/saml             - Configure SAML SSO
 * - POST   /sso/config/oidc             - Configure OIDC SSO
 * - DELETE /sso/config                  - Disable SSO
 * - POST   /sso/test                    - Test SSO connection
 * - GET    /sso/metadata                - Get SAML SP metadata
 *
 * Public endpoints (SSO flows):
 * - GET    /sso/saml/:tenant/login      - Initiate SAML login
 * - POST   /sso/saml/:tenant/callback   - SAML ACS callback
 * - GET    /sso/saml/:tenant/logout     - SAML SLO
 * - GET    /sso/oidc/:tenant/login      - Initiate OIDC login
 * - GET    /sso/oidc/:tenant/callback   - OIDC callback
 */
@Controller('sso')
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  // ============================================================================
  // ADMIN ENDPOINTS (Protected)
  // ============================================================================

  @Get('config')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('settings:read')
  async getConfig(@TenantId() tenantId: string): Promise<SsoConfigResponseDto> {
    return this.ssoService.getConfig(tenantId);
  }

  @Post('config/saml')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('settings:write')
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.UPDATE,
    resourceType: 'sso_config',
  })
  async configureSaml(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: ConfigureSamlDto,
  ): Promise<SsoConfigResponseDto> {
    return this.ssoService.configureSaml(tenantId, dto, user);
  }

  @Post('config/oidc')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('settings:write')
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.UPDATE,
    resourceType: 'sso_config',
  })
  async configureOidc(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: ConfigureOidcDto,
  ): Promise<SsoConfigResponseDto> {
    return this.ssoService.configureOidc(tenantId, dto, user);
  }

  @Post('config/disable')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('settings:write')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.UPDATE,
    resourceType: 'sso_config',
  })
  async disableSso(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    return this.ssoService.disableSso(tenantId, user);
  }

  @Post('test')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('settings:write')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @TenantId() tenantId: string,
    @Body() dto: TestSsoConnectionDto,
  ): Promise<{ success: boolean; message: string; details?: any }> {
    return this.ssoService.testConnection(tenantId, dto);
  }

  @Get('metadata')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('settings:read')
  async getMetadata(
    @TenantId() tenantId: string,
  ): Promise<SsoMetadataResponseDto> {
    return this.ssoService.getSamlMetadata(tenantId);
  }

  // ============================================================================
  // SAML ENDPOINTS (Public)
  // ============================================================================

  @Get('saml/:tenant/login')
  @Public()
  async samlLogin(
    @Param('tenant') tenantSlug: string,
    @Query('returnUrl') returnUrl: string,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = await this.ssoService.initiateSamlLogin(
      tenantSlug,
      returnUrl,
    );
    res.redirect(redirectUrl);
  }

  @Post('saml/:tenant/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  async samlCallback(
    @Param('tenant') tenantSlug: string,
    @Body() body: { SAMLResponse: string; RelayState?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.ssoService.handleSamlCallback(
      tenantSlug,
      body.SAMLResponse,
      body.RelayState,
      {
        ip: this.getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
      },
    );

    // Redirect to frontend with tokens
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    if (result.returnUrl) {
      params.set('returnUrl', result.returnUrl);
    }

    res.redirect(`/auth/sso-callback?${params.toString()}`);
  }

  @Get('saml/:tenant/logout')
  @Public()
  async samlLogout(
    @Param('tenant') tenantSlug: string,
    @Query('sessionIndex') sessionIndex: string,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = await this.ssoService.initiateSamlLogout(
      tenantSlug,
      sessionIndex,
    );

    if (redirectUrl) {
      res.redirect(redirectUrl);
    } else {
      res.redirect('/login');
    }
  }

  @Get('saml/:tenant/metadata')
  @Public()
  async samlMetadataPublic(
    @Param('tenant') tenantSlug: string,
    @Res() res: Response,
  ): Promise<void> {
    const metadata = await this.ssoService.getPublicSamlMetadata(tenantSlug);
    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  }

  // ============================================================================
  // OIDC ENDPOINTS (Public)
  // ============================================================================

  @Get('oidc/:tenant/login')
  @Public()
  async oidcLogin(
    @Param('tenant') tenantSlug: string,
    @Query('returnUrl') returnUrl: string,
    @Res() res: Response,
  ): Promise<void> {
    const { url } = await this.ssoService.initiateOidcLogin(
      tenantSlug,
      returnUrl,
    );
    res.redirect(url);
  }

  @Get('oidc/:tenant/callback')
  @Public()
  async oidcCallback(
    @Param('tenant') tenantSlug: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Handle error response from IdP
    if (error) {
      const params = new URLSearchParams({
        error,
        message: errorDescription || 'SSO authentication failed',
      });
      res.redirect(`/auth/sso-error?${params.toString()}`);
      return;
    }

    const result = await this.ssoService.handleOidcCallback(
      tenantSlug,
      code,
      state,
      {
        ip: this.getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
      },
    );

    // Redirect to frontend with tokens
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    if (result.returnUrl) {
      params.set('returnUrl', result.returnUrl);
    }

    res.redirect(`/auth/sso-callback?${params.toString()}`);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown'
    );
  }
}
