import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Audit } from '../common/interceptors/audit.interceptor';
import { AuditCategory, AuditAction } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateCredentialDto,
  UpdateCredentialDto,
  UpdateCredentialValueDto,
  RotateCredentialDto,
  ListCredentialsQueryDto,
  ListAccessLogsQueryDto,
  CredentialDetailDto,
  PaginatedCredentialsDto,
  PaginatedAccessLogsDto,
  CredentialRotationHistoryDto,
  CredentialStatsDto,
  CreateVaultConnectionDto,
  UpdateVaultConnectionDto,
  VaultConnectionDto,
  CreateFolderDto,
  UpdateFolderDto,
  FolderDto,
  FetchCredentialDto,
  BulkFetchCredentialsDto,
  DecryptedCredentialDto,
  BulkCredentialsResponseDto,
} from './dto/credential.dto';

/**
 * Credentials Controller.
 *
 * Provides REST API for credential management.
 *
 * Endpoints:
 *
 * CREDENTIAL CRUD:
 * - POST   /credentials                    - Create credential
 * - GET    /credentials                    - List credentials
 * - GET    /credentials/stats              - Get statistics
 * - GET    /credentials/key/:key           - Get by key
 * - GET    /credentials/:id                - Get by ID
 * - PATCH  /credentials/:id                - Update metadata
 * - PATCH  /credentials/:id/value          - Update value
 * - POST   /credentials/:id/rotate         - Rotate credential
 * - POST   /credentials/:id/revoke         - Revoke credential
 * - DELETE /credentials/:id                - Delete credential
 *
 * ACCESS LOGS:
 * - GET    /credentials/logs               - List access logs
 * - GET    /credentials/:id/logs           - Get credential access logs
 * - GET    /credentials/:id/rotation-history - Get rotation history
 *
 * FOLDERS:
 * - POST   /credentials/folders            - Create folder
 * - GET    /credentials/folders            - List folders
 * - PATCH  /credentials/folders/:id        - Update folder
 * - DELETE /credentials/folders/:id        - Delete folder
 *
 * VAULT CONNECTIONS:
 * - POST   /credentials/vaults             - Create vault connection
 * - GET    /credentials/vaults             - List vault connections
 * - POST   /credentials/vaults/:id/test    - Test vault connection
 */
@Controller('credentials')
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CREDENTIAL CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new credential
   */
  @Post()
  @RequirePermissions('credentials:create')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.CREATE,
    resourceType: 'credential',
    getResourceId: (_req, res) => res?.id,
  })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateCredentialDto,
  ): Promise<CredentialDetailDto> {
    return this.credentialsService.create(tenantId, user.id, dto);
  }

  /**
   * List credentials with filtering
   */
  @Get()
  @RequirePermissions('credentials:read')
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ListCredentialsQueryDto,
  ): Promise<PaginatedCredentialsDto> {
    return this.credentialsService.findAll(tenantId, query);
  }

  /**
   * Get credential statistics
   */
  @Get('stats')
  @RequirePermissions('credentials:read')
  async getStats(@TenantId() tenantId: string): Promise<CredentialStatsDto> {
    return this.credentialsService.getStats(tenantId);
  }

  /**
   * Get credential by key
   */
  @Get('key/:key')
  @RequirePermissions('credentials:read')
  async findByKey(
    @TenantId() tenantId: string,
    @Param('key') key: string,
  ): Promise<CredentialDetailDto> {
    return this.credentialsService.findByKey(tenantId, key);
  }

  /**
   * Get credential by ID
   */
  @Get(':id')
  @RequirePermissions('credentials:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) credentialId: string,
  ): Promise<CredentialDetailDto> {
    return this.credentialsService.findOne(tenantId, credentialId);
  }

  /**
   * Update credential metadata
   */
  @Patch(':id')
  @RequirePermissions('credentials:update')
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'credential',
    getResourceId: (req) => req.params.id,
  })
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) credentialId: string,
    @Body() dto: UpdateCredentialDto,
  ): Promise<CredentialDetailDto> {
    return this.credentialsService.update(tenantId, credentialId, user.id, dto);
  }

  /**
   * Update credential value
   */
  @Patch(':id/value')
  @RequirePermissions('credentials:update')
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'credential',
    getResourceId: (req) => req.params.id,
    sensitiveFields: ['value'],
  })
  async updateValue(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) credentialId: string,
    @Body() dto: UpdateCredentialValueDto,
  ): Promise<CredentialDetailDto> {
    return this.credentialsService.updateValue(
      tenantId,
      credentialId,
      user.id,
      dto,
    );
  }

  /**
   * Rotate credential
   */
  @Post(':id/rotate')
  @RequirePermissions('credentials:rotate')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.UPDATE,
    resourceType: 'credential',
    getResourceId: (req) => req.params.id,
    sensitiveFields: ['newValue'],
  })
  async rotate(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) credentialId: string,
    @Body() dto: RotateCredentialDto,
  ): Promise<CredentialDetailDto> {
    return this.credentialsService.rotate(tenantId, credentialId, user.id, dto);
  }

  /**
   * Revoke credential
   */
  @Post(':id/revoke')
  @RequirePermissions('credentials:revoke')
  @HttpCode(HttpStatus.OK)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.REVOKE,
    resourceType: 'credential',
    getResourceId: (req) => req.params.id,
  })
  async revoke(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) credentialId: string,
    @Body('reason') reason?: string,
  ): Promise<CredentialDetailDto> {
    return this.credentialsService.revoke(
      tenantId,
      credentialId,
      user.id,
      reason,
    );
  }

  /**
   * Delete credential
   */
  @Delete(':id')
  @RequirePermissions('credentials:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.DELETE,
    resourceType: 'credential',
    getResourceId: (req) => req.params.id,
  })
  async delete(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) credentialId: string,
  ): Promise<void> {
    return this.credentialsService.delete(tenantId, credentialId, user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS LOGS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List all access logs
   */
  @Get('logs')
  @RequirePermissions('credentials:audit')
  async getAccessLogs(
    @TenantId() tenantId: string,
    @Query() query: ListAccessLogsQueryDto,
  ): Promise<PaginatedAccessLogsDto> {
    return this.credentialsService.getAccessLogs(tenantId, query);
  }

  /**
   * Get access logs for a specific credential
   */
  @Get(':id/logs')
  @RequirePermissions('credentials:audit')
  async getCredentialAccessLogs(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) credentialId: string,
    @Query() query: ListAccessLogsQueryDto,
  ): Promise<PaginatedAccessLogsDto> {
    return this.credentialsService.getAccessLogs(tenantId, {
      ...query,
      credentialId,
    });
  }

  /**
   * Get rotation history for a credential
   */
  @Get(':id/rotation-history')
  @RequirePermissions('credentials:audit')
  async getRotationHistory(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) credentialId: string,
  ): Promise<CredentialRotationHistoryDto[]> {
    return this.credentialsService.getRotationHistory(tenantId, credentialId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLDERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create folder
   */
  @Post('folders')
  @RequirePermissions('credentials:manage')
  @HttpCode(HttpStatus.CREATED)
  async createFolder(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateFolderDto,
  ): Promise<FolderDto> {
    return this.credentialsService.createFolder(tenantId, user.id, dto);
  }

  /**
   * List folders
   */
  @Get('folders')
  @RequirePermissions('credentials:read')
  async listFolders(
    @TenantId() tenantId: string,
    @Query('parentId') parentId?: string,
  ): Promise<FolderDto[]> {
    return this.credentialsService.listFolders(tenantId, parentId);
  }

  /**
   * Update folder
   */
  @Patch('folders/:id')
  @RequirePermissions('credentials:manage')
  async updateFolder(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<FolderDto> {
    return this.credentialsService.updateFolder(tenantId, folderId, dto);
  }

  /**
   * Delete folder
   */
  @Delete('folders/:id')
  @RequirePermissions('credentials:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFolder(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) folderId: string,
  ): Promise<void> {
    return this.credentialsService.deleteFolder(tenantId, folderId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VAULT CONNECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create vault connection
   */
  @Post('vaults')
  @RequirePermissions('credentials:admin')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    category: AuditCategory.SECURITY,
    action: AuditAction.CREATE,
    resourceType: 'vault_connection',
    getResourceId: (_req, res) => res?.id,
    sensitiveFields: ['config'],
  })
  async createVaultConnection(
    @TenantId() tenantId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateVaultConnectionDto,
  ): Promise<VaultConnectionDto> {
    return this.credentialsService.createVaultConnection(tenantId, user.id, dto);
  }

  /**
   * List vault connections
   */
  @Get('vaults')
  @RequirePermissions('credentials:admin')
  async listVaultConnections(
    @TenantId() tenantId: string,
  ): Promise<VaultConnectionDto[]> {
    return this.credentialsService.listVaultConnections(tenantId);
  }

  /**
   * Test vault connection
   */
  @Post('vaults/:id/test')
  @RequirePermissions('credentials:admin')
  @HttpCode(HttpStatus.OK)
  async testVaultConnection(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) connectionId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.credentialsService.testVaultConnection(tenantId, connectionId);
  }
}

/**
 * Internal Credentials Controller.
 *
 * Provides internal API for runners to fetch credentials during execution.
 * Requires API key authentication.
 */
@Controller('internal/credentials')
@UseGuards(ApiKeyGuard)
export class InternalCredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  /**
   * Fetch and decrypt a credential for bot execution
   */
  @Post('fetch')
  @HttpCode(HttpStatus.OK)
  async fetchCredential(
    @TenantId() tenantId: string,
    @Body() dto: FetchCredentialDto,
  ): Promise<DecryptedCredentialDto> {
    return this.credentialsService.fetchCredential(tenantId, dto);
  }

  /**
   * Bulk fetch credentials
   */
  @Post('fetch-bulk')
  @HttpCode(HttpStatus.OK)
  async fetchCredentialsBulk(
    @TenantId() tenantId: string,
    @Body() dto: BulkFetchCredentialsDto,
  ): Promise<BulkCredentialsResponseDto> {
    return this.credentialsService.fetchCredentialsBulk(tenantId, dto);
  }
}
