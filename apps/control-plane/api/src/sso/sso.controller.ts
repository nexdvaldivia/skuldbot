import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CP_PERMISSIONS } from '../common/authz/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { SsoService } from './sso.service';
import { ConfigureTenantSsoDto, TenantSsoConfigResponseDto, TestTenantSsoDto } from './dto/sso.dto';

@Controller('sso')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  @Get('tenants/:tenantId/config')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.SSO_READ)
  async getTenantConfig(
    @Param('tenantId') tenantId: string,
    @CurrentUser() currentUser: User,
  ): Promise<TenantSsoConfigResponseDto> {
    return this.ssoService.getTenantSsoConfig(tenantId, currentUser);
  }

  @Put('tenants/:tenantId/config')
  @Roles(UserRole.SKULD_ADMIN, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.SSO_WRITE)
  async configureTenantSso(
    @Param('tenantId') tenantId: string,
    @CurrentUser() currentUser: User,
    @Body() dto: ConfigureTenantSsoDto,
  ): Promise<TenantSsoConfigResponseDto> {
    return this.ssoService.configureTenantSso(tenantId, dto, currentUser);
  }

  @Post('tenants/:tenantId/test')
  @Roles(UserRole.SKULD_ADMIN, UserRole.SKULD_SUPPORT, UserRole.CLIENT_ADMIN)
  @RequirePermissions(CP_PERMISSIONS.SSO_TEST)
  async testTenantSso(
    @Param('tenantId') tenantId: string,
    @CurrentUser() currentUser: User,
    @Body() dto: TestTenantSsoDto,
  ): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    return this.ssoService.testTenantSsoConnection(tenantId, dto, currentUser);
  }
}
