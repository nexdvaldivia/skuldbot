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

  @Column({ unique: true })
  key: string;

  @Column({ type: 'varchar', length: 80, default: 'trial' })
  type: string;

  @Column({ type: 'varchar', length: 80, default: 'active' })
  status: string;

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
    return this.status === 'active' && this.validFrom <= now && this.validUntil >= now;
  }
}
