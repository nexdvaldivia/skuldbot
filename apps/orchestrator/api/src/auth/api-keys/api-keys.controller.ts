import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiKeysService,
  ApiKeyResponseDto,
  CreateApiKeyResponseDto,
} from './api-keys.service';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/api-keys.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Audit } from '../../common/interceptors/audit.interceptor';
import { AuditCategory, AuditAction } from '../../audit/entities/audit-log.entity';
import { User } from '../../users/entities/user.entity';
import { ApiKeyScope } from '../../users/entities/api-key.entity';

/**
 * API Keys Controller.
 *
 * Provides REST API endpoints for API key management.
 *
 * Endpoints:
 * - GET    /api-keys                - List all API keys
 * - GET    /api-keys/scopes         - List available scopes
 * - GET    /api-keys/:id            - Get API key details
 * - GET    /api-keys/:id/usage      - Get API key usage stats
 * - POST   /api-keys                - Create new API key
 * - PATCH  /api-keys/:id            - Update API key
 * - DELETE /api-keys/:id            - Revoke API key
 * - POST   /api-keys/:id/regenerate - Regenerate API key
 *
 * All endpoints are:
 * - Protected by JWT authentication
 * - Tenant-isolated
 * - Permission-controlled (api_keys:read, api_keys:write)
 * - Audit logged
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @RequirePermissions('api_keys:read')
  async findAll(@TenantId() tenantId: string): Promise<ApiKeyResponseDto[]> {
    return this.apiKeysService.findAll(tenantId);
  }

  @Get('scopes')
  @RequirePermissions('api_keys:read')
  getAvailableScopes(): {
    scope: ApiKeyScope;
    displayName: string;
    description: string;
  }[] {
    return this.apiKeysService.getAvailableScopes();
  }

  @Get(':id')
  @RequirePermissions('api_keys:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') keyId: string,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.findOne(tenantId, keyId);
  }

  @Get(':id/usage')
  @RequirePermissions('api_keys:read')
  async getUsageStats(
    @TenantId() tenantId: string,
    @Param('id') keyId: string,
  ): Promise<{
    totalUsage: number;
    lastUsedAt?: Date;
    lastUsedIp?: string;
    usageByDay?: { date: string; count: number }[];
  }> {
    return this.apiKeysService.getUsageStats(tenantId, keyId);
  }

  @Post()
  @RequirePermissions('api_keys:write')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.CREATE,
    resourceType: 'api_key',
    getResourceId: (_req, res) => res?.id,
    getResourceName: (_req, res) => res?.name,
    sensitiveFields: ['key'], // Don't log the actual key
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponseDto> {
    return this.apiKeysService.create(tenantId, dto, user);
  }

  @Patch(':id')
  @RequirePermissions('api_keys:write')
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.UPDATE,
    resourceType: 'api_key',
    getResourceId: (req) => req.params.id,
  })
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id') keyId: string,
    @Body() dto: UpdateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.update(tenantId, keyId, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('api_keys:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.DELETE,
    resourceType: 'api_key',
    getResourceId: (req) => req.params.id,
  })
  async revoke(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id') keyId: string,
  ): Promise<void> {
    return this.apiKeysService.revoke(tenantId, keyId, user);
  }

  @Post(':id/regenerate')
  @RequirePermissions('api_keys:write')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SETTING,
    action: AuditAction.UPDATE,
    resourceType: 'api_key',
    getResourceId: (req) => req.params.id,
    sensitiveFields: ['key'],
  })
  async regenerate(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id') keyId: string,
  ): Promise<CreateApiKeyResponseDto> {
    return this.apiKeysService.regenerate(tenantId, keyId, user);
  }
}
