import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { LicenseAudit } from './license-audit.entity';

export interface LicenseFeatures {
  maxBots: number;
  maxRunners: number;
  maxConcurrentRuns: number;
  maxRunsPerMonth: number;
  aiAssistant: boolean;
  customNodes: boolean;
  apiAccess: boolean;
  sso: boolean;
  ssoEnabled?: boolean;
  ssoEnforced?: boolean;
  ssoProvider?: string | null;
  ssoConfig?: Record<string, unknown> | null;
  auditLog: boolean;
  prioritySupport: boolean;
}

@Entity('licenses')
export class License {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.licenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 255, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 80, default: 'trial' })
  type: string;

  @Column({ type: 'varchar', length: 80, default: 'active' })
  status: string;

  @Column({ type: 'jsonb', default: '{}' })
  features: LicenseFeatures;

  @Column({ name: 'signature_algorithm', type: 'varchar', length: 30, default: 'ed25519' })
  signatureAlgorithm: string;

  @Column({ name: 'public_key_id', type: 'varchar', length: 120, nullable: true })
  publicKeyId: string | null;

  @Column({ type: 'text', nullable: true })
  signature: string | null;

  @Column({ name: 'valid_from', type: 'timestamp with time zone' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamp with time zone' })
  validUntil: Date;

  @Column({ name: 'last_validated_at', type: 'timestamp with time zone', nullable: true })
  lastValidatedAt: Date | null;

  @Column({ name: 'first_activated_at', type: 'timestamp with time zone', nullable: true })
  firstActivatedAt: Date | null;

  @Column({ name: 'validation_count', type: 'int', default: 0 })
  validationCount: number;

  @Column({ name: 'grace_period_days', type: 'int', default: 30 })
  gracePeriodDays: number;

  @Column({ name: 'grace_period_ends_at', type: 'timestamp with time zone', nullable: true })
  gracePeriodEndsAt: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => LicenseAudit, (audit) => audit.license)
  auditTrail: LicenseAudit[];

  isValid(): boolean {
    const now = new Date();
    if (this.status === 'active' && this.validFrom <= now && this.validUntil >= now) {
      return true;
    }

    const inGraceWindow =
      this.gracePeriodEndsAt !== null &&
      this.gracePeriodEndsAt !== undefined &&
      this.gracePeriodEndsAt.getTime() >= now.getTime();
    return inGraceWindow;
  }
}
