import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { TenantId } from '../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Audit } from '../common/interceptors/audit.interceptor';
import { AuditAction, AuditCategory } from '../audit/entities/audit-log.entity';
import { SettingsService, TenantSettingsResponse } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions('settings:read')
  async getSettings(@TenantId() tenantId: string): Promise<TenantSettingsResponse> {
    return this.settingsService.getSettings(tenantId);
  }

  @Put()
  @RequirePermissions('settings:write')
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.UPDATE,
    resourceType: 'settings',
    getResourceId: (req) => req.user?.tenantId || req.tenant?.id || '',
  })
  async updateSettings(
    @TenantId() tenantId: string,
    @Body() dto: UpdateSettingsDto,
  ): Promise<TenantSettingsResponse> {
    return this.settingsService.updateSettings(tenantId, dto);
  }
}
