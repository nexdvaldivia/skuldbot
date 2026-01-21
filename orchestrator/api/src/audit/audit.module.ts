import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

/**
 * Audit Module.
 *
 * Provides comprehensive audit logging and compliance features:
 *
 * Core Features:
 * - Immutable audit logs (no modifications or deletions via API)
 * - Query and filter audit logs
 * - Export to CSV and JSON formats
 * - Security event monitoring
 * - Audit summaries and analytics
 *
 * Compliance:
 * - SOC2: Complete audit trail for all actions
 * - HIPAA: Access logging and accountability
 * - PCI-DSS: Tracking, monitoring, and retention
 * - GDPR: Data access logging and export
 * - FedRAMP: Federal audit requirements
 *
 * Retention:
 * - Per-tenant retention policies
 * - Automatic cleanup via scheduled jobs
 * - Default: 365 days
 * - Regulated: Up to 7 years
 *
 * Security:
 * - Tenant isolation
 * - Permission-based access (audit:read, audit:export)
 * - No modification endpoints
 * - Immutable storage design
 *
 * NOTE: Audit logs are created via the AuditInterceptor,
 * not through this module's service directly.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
