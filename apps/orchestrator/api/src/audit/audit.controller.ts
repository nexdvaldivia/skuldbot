import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AuditService,
  AuditQueryDto,
  AuditLogResponseDto,
  PaginatedAuditLogsDto,
  AuditSummaryDto,
} from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { TenantId } from '../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditCategory, AuditAction, AuditResult } from './entities/audit-log.entity';

/**
 * Query DTO for URL parameters.
 */
class AuditQueryParams {
  startDate?: string;
  endDate?: string;
  category?: AuditCategory;
  action?: AuditAction;
  result?: AuditResult;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  search?: string;
  ipAddress?: string;
  page?: string;
  limit?: string;
  sortBy?: 'timestamp' | 'category' | 'action';
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Audit Logs Controller.
 *
 * Provides REST API endpoints for audit log access.
 *
 * Endpoints:
 * - GET    /audit                     - Query audit logs
 * - GET    /audit/summary             - Get audit summary
 * - GET    /audit/security            - Get security events
 * - GET    /audit/export/csv          - Export to CSV
 * - GET    /audit/export/json         - Export to JSON
 * - GET    /audit/resource/:type/:id  - Get logs for a resource
 * - GET    /audit/user/:id            - Get logs for a user
 * - GET    /audit/:id                 - Get specific audit log
 *
 * All endpoints are:
 * - Protected by JWT authentication
 * - Tenant-isolated
 * - Permission-controlled (audit:read, audit:export)
 *
 * NOTE: Audit logs are IMMUTABLE.
 * There are no create, update, or delete endpoints.
 */
@Controller('audit')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  async findAll(
    @TenantId() tenantId: string,
    @Query() queryParams: AuditQueryParams,
  ): Promise<PaginatedAuditLogsDto> {
    const query = this.parseQueryParams(queryParams);
    return this.auditService.findAll(tenantId, query);
  }

  @Get('summary')
  @RequirePermissions('audit:read')
  async getSummary(
    @TenantId() tenantId: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ): Promise<AuditSummaryDto> {
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days

    return this.auditService.getSummary(tenantId, startDate, endDate);
  }

  @Get('security')
  @RequirePermissions('audit:read')
  async getSecurityEvents(
    @TenantId() tenantId: string,
    @Query('hours') hoursStr?: string,
  ): Promise<AuditLogResponseDto[]> {
    const hours = hoursStr ? parseInt(hoursStr, 10) : 24;
    return this.auditService.getSecurityEvents(tenantId, hours);
  }

  @Get('export/csv')
  @RequirePermissions('audit:export')
  async exportToCsv(
    @TenantId() tenantId: string,
    @Query() queryParams: AuditQueryParams,
    @Res() res: Response,
  ): Promise<void> {
    const query = this.parseQueryParams(queryParams);
    const csv = await this.auditService.exportToCsv(tenantId, query);

    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('export/json')
  @RequirePermissions('audit:export')
  async exportToJson(
    @TenantId() tenantId: string,
    @Query() queryParams: AuditQueryParams,
    @Res() res: Response,
  ): Promise<void> {
    const query = this.parseQueryParams(queryParams);
    const json = await this.auditService.exportToJson(tenantId, query);

    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  }

  @Get('resource/:type/:id')
  @RequirePermissions('audit:read')
  async findByResource(
    @TenantId() tenantId: string,
    @Param('type') resourceType: string,
    @Param('id') resourceId: string,
    @Query('limit') limitStr?: string,
  ): Promise<AuditLogResponseDto[]> {
    const limit = limitStr ? parseInt(limitStr, 10) : 100;
    return this.auditService.findByResource(
      tenantId,
      resourceType,
      resourceId,
      limit,
    );
  }

  @Get('user/:id')
  @RequirePermissions('audit:read')
  async findByUser(
    @TenantId() tenantId: string,
    @Param('id') userId: string,
    @Query('limit') limitStr?: string,
  ): Promise<AuditLogResponseDto[]> {
    const limit = limitStr ? parseInt(limitStr, 10) : 100;
    return this.auditService.findByUser(tenantId, userId, limit);
  }

  @Get(':id')
  @RequirePermissions('audit:read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') logId: string,
  ): Promise<AuditLogResponseDto> {
    return this.auditService.findOne(tenantId, logId);
  }

  /**
   * Parse query parameters from URL.
   */
  private parseQueryParams(params: AuditQueryParams): AuditQueryDto {
    return {
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
      category: params.category,
      action: params.action,
      result: params.result,
      userId: params.userId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      search: params.search,
      ipAddress: params.ipAddress,
      page: params.page ? parseInt(params.page, 10) : 1,
      limit: params.limit ? parseInt(params.limit, 10) : 50,
      sortBy: params.sortBy || 'timestamp',
      sortOrder: params.sortOrder || 'DESC',
    };
  }
}
