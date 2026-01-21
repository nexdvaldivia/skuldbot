import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan, In, ILike } from 'typeorm';
import {
  AuditLog,
  AuditCategory,
  AuditAction,
  AuditResult,
} from './entities/audit-log.entity';

/**
 * Audit Query DTOs
 */
export interface AuditQueryDto {
  startDate?: Date;
  endDate?: Date;
  category?: AuditCategory;
  action?: AuditAction;
  result?: AuditResult;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  search?: string;
  ipAddress?: string;
  page?: number;
  limit?: number;
  sortBy?: 'timestamp' | 'category' | 'action';
  sortOrder?: 'ASC' | 'DESC';
}

export interface AuditLogResponseDto {
  id: string;
  timestamp: Date;
  category: AuditCategory;
  action: AuditAction;
  result: AuditResult;
  userId?: string;
  userEmail?: string;
  impersonatorId?: string;
  apiKeyId?: string;
  runnerId?: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  changes?: Record<string, { from: any; to: any }>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface PaginatedAuditLogsDto {
  logs: AuditLogResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditSummaryDto {
  totalEvents: number;
  byCategory: Record<AuditCategory, number>;
  byAction: Record<AuditAction, number>;
  byResult: Record<AuditResult, number>;
  topUsers: { userId: string; email: string; count: number }[];
  topResources: { resourceType: string; count: number }[];
  recentFailures: AuditLogResponseDto[];
}

/**
 * Audit Service.
 *
 * Provides audit log querying and export functionality.
 *
 * Features:
 * - Query audit logs with filters
 * - Export audit logs (CSV, JSON)
 * - Generate audit summaries
 * - Retention policy enforcement
 *
 * Compliance:
 * - SOC2: Complete audit trail
 * - HIPAA: Access logging
 * - PCI-DSS: Tracking and monitoring
 * - GDPR: Data access logging
 *
 * IMPORTANT: Audit logs are IMMUTABLE.
 * They cannot be modified or deleted through the API.
 * Retention is managed by background jobs based on tenant settings.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  /**
   * Query audit logs with filters.
   */
  async findAll(
    tenantId: string,
    query: AuditQueryDto,
  ): Promise<PaginatedAuditLogsDto> {
    const {
      startDate,
      endDate,
      category,
      action,
      result,
      userId,
      resourceType,
      resourceId,
      search,
      ipAddress,
      page = 1,
      limit = 50,
      sortBy = 'timestamp',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.auditRepository
      .createQueryBuilder('audit')
      .where('audit.tenantId = :tenantId', { tenantId });

    // Date range filter
    if (startDate && endDate) {
      queryBuilder.andWhere('audit.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder.andWhere('audit.timestamp >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('audit.timestamp <= :endDate', { endDate });
    }

    // Category filter
    if (category) {
      queryBuilder.andWhere('audit.category = :category', { category });
    }

    // Action filter
    if (action) {
      queryBuilder.andWhere('audit.action = :action', { action });
    }

    // Result filter
    if (result) {
      queryBuilder.andWhere('audit.result = :result', { result });
    }

    // User filter
    if (userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId });
    }

    // Resource filters
    if (resourceType) {
      queryBuilder.andWhere('audit.resourceType = :resourceType', {
        resourceType,
      });
    }

    if (resourceId) {
      queryBuilder.andWhere('audit.resourceId = :resourceId', { resourceId });
    }

    // IP address filter
    if (ipAddress) {
      queryBuilder.andWhere('audit.ipAddress = :ipAddress', { ipAddress });
    }

    // Search filter (searches in multiple fields)
    if (search) {
      queryBuilder.andWhere(
        '(audit.userEmail ILIKE :search OR audit.resourceName ILIKE :search OR audit.errorMessage ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sorting
    const sortColumn =
      sortBy === 'timestamp'
        ? 'audit.timestamp'
        : sortBy === 'category'
          ? 'audit.category'
          : 'audit.action';
    queryBuilder.orderBy(sortColumn, sortOrder);

    // Pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [logs, total] = await queryBuilder.getManyAndCount();

    return {
      logs: logs.map(this.toAuditLogResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a specific audit log entry.
   */
  async findOne(
    tenantId: string,
    logId: string,
  ): Promise<AuditLogResponseDto> {
    const log = await this.auditRepository.findOne({
      where: { id: logId, tenantId },
    });

    if (!log) {
      throw new NotFoundException({
        code: 'AUDIT_LOG_NOT_FOUND',
        message: 'Audit log entry not found.',
      });
    }

    return this.toAuditLogResponse(log);
  }

  /**
   * Get audit logs for a specific resource.
   */
  async findByResource(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    limit: number = 100,
  ): Promise<AuditLogResponseDto[]> {
    const logs = await this.auditRepository.find({
      where: { tenantId, resourceType, resourceId },
      order: { timestamp: 'DESC' },
      take: limit,
    });

    return logs.map(this.toAuditLogResponse);
  }

  /**
   * Get audit logs for a specific user.
   */
  async findByUser(
    tenantId: string,
    userId: string,
    limit: number = 100,
  ): Promise<AuditLogResponseDto[]> {
    const logs = await this.auditRepository.find({
      where: { tenantId, userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });

    return logs.map(this.toAuditLogResponse);
  }

  /**
   * Generate audit summary for a time period.
   */
  async getSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AuditSummaryDto> {
    const queryBuilder = this.auditRepository
      .createQueryBuilder('audit')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    // Total events
    const totalEvents = await queryBuilder.getCount();

    // By category
    const byCategory = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('audit.category')
      .getRawMany();

    // By action
    const byAction = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('audit.action')
      .getRawMany();

    // By result
    const byResult = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.result', 'result')
      .addSelect('COUNT(*)', 'count')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('audit.result')
      .getRawMany();

    // Top users
    const topUsers = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.userId', 'userId')
      .addSelect('audit.userEmail', 'email')
      .addSelect('COUNT(*)', 'count')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('audit.userId IS NOT NULL')
      .groupBy('audit.userId')
      .addGroupBy('audit.userEmail')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Top resources
    const topResources = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.resourceType', 'resourceType')
      .addSelect('COUNT(*)', 'count')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('audit.resourceType IS NOT NULL')
      .groupBy('audit.resourceType')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Recent failures
    const recentFailures = await this.auditRepository.find({
      where: {
        tenantId,
        timestamp: Between(startDate, endDate),
        result: In([AuditResult.FAILURE, AuditResult.DENIED]),
      },
      order: { timestamp: 'DESC' },
      take: 10,
    });

    return {
      totalEvents,
      byCategory: this.arrayToRecord(byCategory, 'category', 'count'),
      byAction: this.arrayToRecord(byAction, 'action', 'count'),
      byResult: this.arrayToRecord(byResult, 'result', 'count'),
      topUsers: topUsers.map((u) => ({
        userId: u.userId,
        email: u.email,
        count: parseInt(u.count, 10),
      })),
      topResources: topResources.map((r) => ({
        resourceType: r.resourceType,
        count: parseInt(r.count, 10),
      })),
      recentFailures: recentFailures.map(this.toAuditLogResponse),
    };
  }

  /**
   * Export audit logs to CSV format.
   */
  async exportToCsv(
    tenantId: string,
    query: AuditQueryDto,
  ): Promise<string> {
    // Remove pagination for export
    const exportQuery = { ...query, page: 1, limit: 100000 };
    const { logs } = await this.findAll(tenantId, exportQuery);

    const headers = [
      'Timestamp',
      'Category',
      'Action',
      'Result',
      'User Email',
      'Resource Type',
      'Resource ID',
      'Resource Name',
      'IP Address',
      'Error Code',
      'Error Message',
    ];

    const rows = logs.map((log) => [
      log.timestamp.toISOString(),
      log.category,
      log.action,
      log.result,
      log.userEmail || '',
      log.resourceType || '',
      log.resourceId || '',
      log.resourceName || '',
      log.ipAddress || '',
      log.errorCode || '',
      log.errorMessage || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');

    return csvContent;
  }

  /**
   * Export audit logs to JSON format.
   */
  async exportToJson(
    tenantId: string,
    query: AuditQueryDto,
  ): Promise<string> {
    const exportQuery = { ...query, page: 1, limit: 100000 };
    const { logs, total } = await this.findAll(tenantId, exportQuery);

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalRecords: total,
        query: {
          startDate: query.startDate,
          endDate: query.endDate,
          category: query.category,
          action: query.action,
          result: query.result,
        },
        logs,
      },
      null,
      2,
    );
  }

  /**
   * Get security events (failed logins, denied access, etc.)
   */
  async getSecurityEvents(
    tenantId: string,
    hours: number = 24,
  ): Promise<AuditLogResponseDto[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await this.auditRepository.find({
      where: [
        {
          tenantId,
          category: AuditCategory.SECURITY,
          timestamp: MoreThan(since),
        },
        {
          tenantId,
          result: AuditResult.FAILURE,
          timestamp: MoreThan(since),
        },
        {
          tenantId,
          result: AuditResult.DENIED,
          timestamp: MoreThan(since),
        },
      ],
      order: { timestamp: 'DESC' },
      take: 100,
    });

    return logs.map(this.toAuditLogResponse);
  }

  /**
   * Clean up old audit logs based on retention policy.
   * Called by a scheduled job.
   * In single-tenant mode, retention days come from license features or default to 365.
   */
  async enforceRetentionPolicy(tenantId: string, retentionDays = 365): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const result = await this.auditRepository.delete({
      tenantId,
      timestamp: LessThan(cutoffDate),
    });

    return result.affected || 0;
  }

  /**
   * Convert audit log entity to response DTO.
   */
  private toAuditLogResponse(log: AuditLog): AuditLogResponseDto {
    return {
      id: log.id,
      timestamp: log.timestamp,
      category: log.category,
      action: log.action,
      result: log.result,
      userId: log.userId,
      userEmail: log.userEmail,
      impersonatorId: log.impersonatorId,
      apiKeyId: log.apiKeyId,
      runnerId: log.runnerId,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      resourceName: log.resourceName,
      changes: log.changes,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      requestId: log.requestId,
      errorCode: log.errorCode,
      errorMessage: log.errorMessage,
      metadata: log.metadata,
    };
  }

  /**
   * Convert array of {key, count} to Record.
   */
  private arrayToRecord(
    arr: { [key: string]: any }[],
    keyField: string,
    valueField: string,
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of arr) {
      result[item[keyField]] = parseInt(item[valueField], 10);
    }
    return result;
  }
}
