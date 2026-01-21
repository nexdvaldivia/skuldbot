import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap, catchError } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog,
  AuditCategory,
  AuditAction,
  AuditResult,
  sanitizeForAudit,
} from '../../audit/entities/audit-log.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Configuration for audit logging on a specific endpoint.
 */
export interface AuditConfig {
  category: AuditCategory;
  action: AuditAction;
  resourceType?: string;
  getResourceId?: (request: any, response: any, context?: any) => string;
  getResourceName?: (request: any, response: any, context?: any) => string;
  getPreviousState?: (request: any) => Promise<Record<string, any>>;
  skipAudit?: (request: any) => boolean;
  sensitiveFields?: string[];
}

/**
 * Metadata key for audit configuration
 */
export const AUDIT_CONFIG_KEY = 'audit_config';

/**
 * Decorator to configure audit logging for an endpoint.
 *
 * Usage:
 * ```typescript
 * @Post()
 * @Audit({
 *   category: AuditCategory.BOT,
 *   action: AuditAction.CREATE,
 *   resourceType: 'bot',
 *   getResourceId: (req, res) => res.id,
 *   getResourceName: (req, res) => res.name,
 * })
 * createBot(@Body() dto: CreateBotDto) {
 *   // ...
 * }
 * ```
 */
import { SetMetadata } from '@nestjs/common';

export const Audit = (config: AuditConfig) =>
  SetMetadata(AUDIT_CONFIG_KEY, config);

/**
 * Audit Logging Interceptor.
 *
 * Automatically creates audit log entries for all requests.
 * Captures:
 * - Who performed the action (user, API key, runner)
 * - What action was performed
 * - What resource was affected
 * - Previous and new state (for updates)
 * - Client context (IP, user agent)
 * - Result (success/failure)
 *
 * Audit logs are IMMUTABLE and cannot be modified or deleted.
 * They are designed for compliance with:
 * - SOC2 (Security, Availability, Processing Integrity)
 * - HIPAA (Access logs, audit controls)
 * - PCI-DSS (Tracking and monitoring)
 * - GDPR (Data access logging)
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    // Get audit configuration from decorator
    const config = this.getAuditConfig(context);

    // Skip if no audit config or explicitly skipped
    if (!config || (config.skipAudit && config.skipAudit(request))) {
      return next.handle();
    }

    // Capture previous state if needed (for updates)
    let previousStatePromise: Promise<Record<string, any> | null> =
      Promise.resolve(null);
    if (config.getPreviousState) {
      previousStatePromise = config.getPreviousState(request).catch(() => null);
    }

    return next.handle().pipe(
      tap(async (response) => {
        const previousState = await previousStatePromise;
        await this.createAuditLog(
          context,
          config,
          request,
          response,
          AuditResult.SUCCESS,
          previousState,
        );
      }),
      catchError(async (error) => {
        const previousState = await previousStatePromise;
        await this.createAuditLog(
          context,
          config,
          request,
          null,
          error.status === 403 ? AuditResult.DENIED : AuditResult.FAILURE,
          previousState,
          error,
        );
        throw error;
      }),
    );
  }

  private getAuditConfig(context: ExecutionContext): AuditConfig | null {
    const handler = context.getHandler();
    const classRef = context.getClass();

    // Check handler first, then class
    const config =
      Reflect.getMetadata(AUDIT_CONFIG_KEY, handler) ||
      Reflect.getMetadata(AUDIT_CONFIG_KEY, classRef);

    return config;
  }

  private async createAuditLog(
    context: ExecutionContext,
    config: AuditConfig,
    request: any,
    response: any,
    result: AuditResult,
    previousState: Record<string, any> | null,
    error?: any,
  ): Promise<void> {
    try {
      const user = request.user as User | undefined;

      const auditLog = new AuditLog();

      // Tenant and user info
      auditLog.tenantId = user?.tenantId || request.tenant?.id || '';
      auditLog.userId = user?.id || '';
      auditLog.userEmail = user?.email || '';

      // Check for impersonation
      if (request.impersonator) {
        auditLog.impersonatorId = request.impersonator.id;
      }

      // Check for API key auth
      if (request.apiKey) {
        auditLog.apiKeyId = request.apiKey.id;
      }

      // Check for runner agent
      if (request.runner) {
        auditLog.runnerId = request.runner.id;
      }

      // Action details
      auditLog.category = config.category;
      auditLog.action = config.action;
      auditLog.result = result;

      // Resource details
      auditLog.resourceType = config.resourceType || '';
      if (config.getResourceId) {
        auditLog.resourceId = config.getResourceId(request, response);
      } else {
        auditLog.resourceId = request.params?.id;
      }
      if (config.getResourceName) {
        auditLog.resourceName = config.getResourceName(request, response);
      }

      // State tracking (sanitized to remove sensitive fields)
      if (previousState) {
        auditLog.previousState = sanitizeForAudit(previousState);
      }
      if (response && config.action !== AuditAction.READ) {
        auditLog.newState = sanitizeForAudit(
          this.extractState(response, config.sensitiveFields),
        );
      }

      // Calculate changes for updates
      if (previousState && auditLog.newState) {
        auditLog.changes = this.calculateChanges(
          previousState,
          auditLog.newState,
        );
      }

      // Context
      auditLog.ipAddress = this.getClientIp(request);
      auditLog.userAgent = request.headers['user-agent'];
      auditLog.requestId = request.id || request.headers['x-request-id'];
      auditLog.sessionId = request.session?.id;

      // Error details
      if (error) {
        auditLog.errorMessage = error.message;
        auditLog.errorCode = error.code || error.name;
      }

      // Additional metadata
      auditLog.metadata = {
        method: request.method,
        path: request.path,
        query: this.sanitizeQuery(request.query),
        duration: Date.now() - (request.startTime || Date.now()),
      };

      // Save async (don't block response)
      await this.auditRepository.save(auditLog);
    } catch (err) {
      // Never fail the request due to audit logging errors
      console.error('[AUDIT] Failed to create audit log:', err);
    }
  }

  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.ip
    );
  }

  private extractState(
    response: any,
    sensitiveFields?: string[],
  ): Record<string, any> {
    if (!response || typeof response !== 'object') {
      return {};
    }

    // If it's an array, don't log full content
    if (Array.isArray(response)) {
      return { _type: 'array', count: response.length };
    }

    const state = { ...response };

    // Remove sensitive fields
    const fieldsToRemove = [
      'password',
      'passwordHash',
      'secret',
      'token',
      'apiKey',
      'mfaSecret',
      ...(sensitiveFields || []),
    ];

    for (const field of fieldsToRemove) {
      if (field in state) {
        state[field] = '[REDACTED]';
      }
    }

    return state;
  }

  private sanitizeQuery(query: Record<string, any>): Record<string, any> {
    if (!query) return {};

    const sanitized = { ...query };
    const sensitiveParams = ['token', 'key', 'password', 'secret'];

    for (const param of sensitiveParams) {
      if (param in sanitized) {
        sanitized[param] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private calculateChanges(
    previous: Record<string, any>,
    current: Record<string, any>,
  ): Record<string, { from: any; to: any }> {
    const changes: Record<string, { from: any; to: any }> = {};

    const allKeys = new Set([
      ...Object.keys(previous),
      ...Object.keys(current),
    ]);

    for (const key of allKeys) {
      // Skip internal/meta fields
      if (key.startsWith('_') || ['createdAt', 'updatedAt'].includes(key)) {
        continue;
      }

      const prevValue = previous[key];
      const currValue = current[key];

      if (JSON.stringify(prevValue) !== JSON.stringify(currValue)) {
        changes[key] = { from: prevValue, to: currValue };
      }
    }

    return changes;
  }
}
