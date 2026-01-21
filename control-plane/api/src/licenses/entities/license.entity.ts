import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';

export enum LicenseType {
  TRIAL = 'trial',
  STANDARD = 'standard',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum LicenseStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  SUSPENDED = 'suspended',
}

export interface LicenseFeatures {
  maxBots: number;
  maxRunners: number;
  maxConcurrentRuns: number;
  maxRunsPerMonth: number;
  aiAssistant: boolean;
  customNodes: boolean;
  apiAccess: boolean;
  sso: boolean;
  auditLog: boolean;
  prioritySupport: boolean;
}

@Entity('licenses')
export class License {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.licenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ unique: true })
  key: string;

  @Column({ type: 'enum', enum: LicenseType, default: LicenseType.TRIAL })
  type: LicenseType;

  @Column({ type: 'enum', enum: LicenseStatus, default: LicenseStatus.ACTIVE })
  status: LicenseStatus;

  @Column({ type: 'jsonb', default: {} })
  features: LicenseFeatures;

  @Column({ name: 'valid_from', type: 'timestamp with time zone' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamp with time zone' })
  validUntil: Date;

  @Column({ name: 'last_validated_at', type: 'timestamp with time zone', nullable: true })
  lastValidatedAt: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  isValid(): boolean {
    const now = new Date();
    return (
      this.status === LicenseStatus.ACTIVE &&
      this.validFrom <= now &&
      this.validUntil >= now
    );
  }
}
