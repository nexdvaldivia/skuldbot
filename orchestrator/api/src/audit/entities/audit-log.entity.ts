import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Audit action categories
 */
export enum AuditCategory {
  AUTH = 'auth',
  USER = 'user',
  ROLE = 'role',
  BOT = 'bot',
  RUN = 'run',
  RUNNER = 'runner',
  SCHEDULE = 'schedule',
  CREDENTIAL = 'credential',
  SETTING = 'setting',
  TENANT = 'tenant',
  API_KEY = 'api_key',
  SYSTEM = 'system',
  SECURITY = 'security',
  EXECUTION = 'execution',
}

/**
 * Audit action types
 */
export enum AuditAction {
  // Auth actions
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGIN_FAILED = 'login_failed',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET = 'password_reset',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  MFA_VERIFIED = 'mfa_verified',
  MFA_FAILED = 'mfa_failed',
  TOKEN_REFRESH = 'token_refresh',
  IMPERSONATION_START = 'impersonation_start',
  IMPERSONATION_END = 'impersonation_end',
  IMPERSONATE = 'impersonate', // Generic impersonation action

  // CRUD actions
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',

  // Specific actions
  EXECUTE = 'execute',
  CANCEL = 'cancel',
  RETRY = 'retry',
  ENABLE = 'enable',
  DISABLE = 'disable',
  TRIGGER = 'trigger',
  INVITE = 'invite',
  ASSIGN = 'assign',
  REVOKE = 'revoke',
  EXPORT = 'export',
  IMPORT = 'import',
  ROTATE = 'rotate',
  SUSPEND = 'suspend',
  ACTIVATE = 'activate',
  DEACTIVATE = 'deactivate',
  REGENERATE = 'regenerate',
}

/**
 * Result of the audited action
 */
export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  DENIED = 'denied',
}

/**
 * Audit Log Entity for comprehensive action tracking.
 *
 * This entity stores all user actions for:
 * - Security monitoring and incident response
 * - Compliance requirements (SOC2, GDPR, HIPAA)
 * - Activity reporting and analytics
 * - Forensic investigation
 *
 * Audit logs are IMMUTABLE - they can never be modified or deleted.
 * Retention policies are handled at the database/storage level.
 */
@Entity('audit_logs')
@Index(['tenantId', 'timestamp'])
@Index(['tenantId', 'userId', 'timestamp'])
@Index(['tenantId', 'category', 'timestamp'])
@Index(['tenantId', 'resourceType', 'resourceId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  // Actor (who performed the action)
  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userEmail: string; // Denormalized for when user is deleted

  @Column({ nullable: true })
  impersonatorId: string; // If action was performed by impersonator

  @Column({ nullable: true })
  apiKeyId: string; // If action was performed via API key

  @Column({ nullable: true })
  runnerId: string; // If action was performed by runner agent

  // Action details
  @Column({ type: 'enum', enum: AuditCategory })
  category: AuditCategory;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ type: 'enum', enum: AuditResult })
  result: AuditResult;

  // Resource details (what was affected)
  @Column({ nullable: true })
  resourceType: string; // e.g., 'bot', 'user', 'run'

  @Column({ nullable: true })
  resourceId: string;

  @Column({ nullable: true })
  resourceName: string; // Denormalized name for display

  // Change tracking
  @Column({ type: 'jsonb', nullable: true })
  previousState: Record<string, any>; // State before change (for updates)

  @Column({ type: 'jsonb', nullable: true })
  newState: Record<string, any>; // State after change

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, { from: any; to: any }>; // Diff of changes

  // Context
  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  requestId: string; // Correlation ID for distributed tracing

  @Column({ nullable: true })
  sessionId: string;

  @Column({ nullable: true })
  errorMessage: string; // For failed actions

  @Column({ nullable: true })
  errorCode: string;

  // Additional metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Any additional context-specific data

  @CreateDateColumn({ name: 'timestamp' })
  @Index()
  timestamp: Date;

  // Alias for backwards compatibility
  get createdAt(): Date {
    return this.timestamp;
  }

  // Computed display message
  get displayMessage(): string {
    const actor = this.userEmail || this.runnerId || 'System';
    const target = this.resourceName || this.resourceId || '';
    return `${actor} ${this.action} ${this.resourceType} ${target}`.trim();
  }
}

/**
 * Sensitive fields that should be masked in audit logs
 */
export const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'secret',
  'apiKey',
  'token',
  'refreshToken',
  'mfaSecret',
  'mfaBackupCodes',
  'credential',
  'privateKey',
  'accessKey',
  'secretKey',
];

/**
 * Utility to sanitize objects for audit logging
 */
export function sanitizeForAudit(obj: Record<string, any>): Record<string, any> {
  if (!obj) return obj;

  const sanitized = { ...obj };
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  return sanitized;
}
