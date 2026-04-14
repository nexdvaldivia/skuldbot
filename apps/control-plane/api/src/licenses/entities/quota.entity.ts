import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('quota_policies')
@Index(['tenantId', 'resourceType'], { unique: true })
export class QuotaPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'resource_type' })
  resourceType: string;

  // -1 means unlimited
  @Column({ name: 'limit_value', type: 'int', nullable: true, default: null })
  limitValue: number | null;

  @Column({ name: 'warning_threshold_percent', type: 'int', default: 80 })
  warningThresholdPercent: number;

  @Column({ name: 'grace_threshold_percent', type: 'int', default: 110 })
  graceThresholdPercent: number;

  @Column({ name: 'block_when_exceeded', type: 'boolean', default: true })
  blockWhenExceeded: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('usage_counters')
@Index(['tenantId', 'resourceType', 'period'], { unique: true })
export class UsageCounter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'resource_type' })
  resourceType: string;

  // YYYY-MM
  @Column()
  period: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  consumed: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
