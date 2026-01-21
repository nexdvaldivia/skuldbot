import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Auditor role/type
 */
export enum AuditorRole {
  EXTERNAL_AUDITOR = 'external_auditor',   // External audit firm
  INTERNAL_AUDITOR = 'internal_auditor',   // Internal compliance team
  COMPLIANCE_OFFICER = 'compliance_officer', // Organization compliance officer
  REGULATOR = 'regulator',                 // Regulatory body
}

/**
 * Access duration presets
 */
export enum AuditorAccessDuration {
  DAYS_30 = '30_days',
  DAYS_60 = '60_days',
  DAYS_90 = '90_days',
  CUSTOM = 'custom',
}

/**
 * Compliance frameworks the auditor can access
 */
export enum ComplianceFramework {
  HIPAA = 'hipaa',
  SOC2 = 'soc2',
  PCI_DSS = 'pci_dss',
  GDPR = 'gdpr',
  ISO_27001 = 'iso_27001',
  NIST_CSF = 'nist_csf',
  CCPA = 'ccpa',
  HITRUST = 'hitrust',
  FEDRAMP = 'fedramp',
}

/**
 * Auditor entity - External/Internal auditor accounts with time-limited access.
 *
 * Auditors have READ-ONLY access to:
 * - Evidence pack manifests (NOT encrypted)
 * - Digital signatures and verification
 * - Merkle tree proofs
 * - Chain of custody events
 * - Compliance attestation reports
 *
 * Auditors CANNOT:
 * - Decrypt evidence files (screenshots, logs, decisions)
 * - Modify any data
 * - Access raw PII/PHI
 *
 * Access is time-limited and can be:
 * - 30, 60, or 90 days (presets)
 * - Custom date (up to organization-defined max)
 */
@Entity('auditors')
@Index(['tenantId', 'email'], { unique: true })
@Index(['tenantId', 'isActive'])
@Index(['accessExpiresAt'])
export class Auditor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID (organization) this auditor has access to */
  @Column()
  @Index()
  tenantId: string;

  /** Auditor email (used for authentication) */
  @Column()
  email: string;

  /** Auditor full name */
  @Column()
  name: string;

  /** Auditor company/firm name */
  @Column()
  company: string;

  /** Auditor role */
  @Column({ type: 'enum', enum: AuditorRole })
  role: AuditorRole;

  /** Access code hash (sent via email for authentication) */
  @Column({ nullable: true })
  accessCodeHash: string;

  /** When the access code was last generated */
  @Column({ type: 'timestamp', nullable: true })
  accessCodeGeneratedAt: Date | null;

  /** Whether the auditor account is active */
  @Column({ default: true })
  isActive: boolean;

  /** Access duration preset used when creating */
  @Column({ type: 'enum', enum: AuditorAccessDuration })
  accessDuration: AuditorAccessDuration;

  /** When auditor access expires (CRITICAL for time-limited access) */
  @Column({ type: 'timestamp' })
  accessExpiresAt: Date;

  /** Specific bot IDs the auditor can access (null = all bots) */
  @Column({ type: 'simple-array', nullable: true })
  allowedBotIds: string[] | null;

  /** Compliance frameworks the auditor can generate reports for */
  @Column({ type: 'simple-array', default: '' })
  allowedFrameworks: ComplianceFramework[];

  /** Last time auditor accessed the system */
  @Column({ type: 'timestamp', nullable: true })
  lastAccessAt: Date | null;

  /** IP address of last access */
  @Column({ nullable: true })
  lastAccessIp: string | null;

  /** Total number of logins */
  @Column({ default: 0 })
  loginCount: number;

  /** Additional notes about the auditor */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** User who created this auditor account */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ─────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Check if auditor access has expired
   */
  isExpired(): boolean {
    return new Date() > this.accessExpiresAt;
  }

  /**
   * Get days remaining until access expires
   */
  getDaysRemaining(): number {
    const now = new Date();
    const diffTime = this.accessExpiresAt.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  /**
   * Check if auditor can access a specific bot
   */
  canAccessBot(botId: string): boolean {
    // If allowedBotIds is null, auditor can access all bots
    if (this.allowedBotIds === null) {
      return true;
    }
    return this.allowedBotIds.includes(botId);
  }

  /**
   * Check if auditor can generate reports for a framework
   */
  canAccessFramework(framework: ComplianceFramework): boolean {
    // If empty array, all frameworks allowed
    if (!this.allowedFrameworks || this.allowedFrameworks.length === 0) {
      return true;
    }
    return this.allowedFrameworks.includes(framework);
  }

  /**
   * Calculate expiration date from duration preset
   */
  static calculateExpirationDate(
    duration: AuditorAccessDuration,
    customDate?: Date,
  ): Date {
    const now = new Date();

    switch (duration) {
      case AuditorAccessDuration.DAYS_30:
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      case AuditorAccessDuration.DAYS_60:
        return new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      case AuditorAccessDuration.DAYS_90:
        return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      case AuditorAccessDuration.CUSTOM:
        if (!customDate) {
          throw new Error('Custom expiration date required when using CUSTOM duration');
        }
        return customDate;
      default:
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
  }
}

/**
 * Auditor access log for chain of custody
 */
@Entity('auditor_access_logs')
@Index(['auditorId', 'accessedAt'])
@Index(['tenantId', 'accessedAt'])
export class AuditorAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  auditorId: string;

  @Column()
  tenantId: string;

  /** Action performed */
  @Column()
  action: string; // 'login', 'view_evidence', 'verify_signature', 'generate_attestation', etc.

  /** Resource accessed (evidence pack ID, bot ID, etc.) */
  @Column({ nullable: true })
  resourceType: string | null;

  @Column({ nullable: true })
  resourceId: string | null;

  /** Additional details as JSON */
  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any> | null;

  /** IP address */
  @Column({ nullable: true })
  ipAddress: string | null;

  /** User agent */
  @Column({ nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  accessedAt: Date;
}
