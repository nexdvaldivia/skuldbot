import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LicenseRuntimeDecisionType = 'entitlement_check' | 'quota_check' | 'quota_consume';

@Entity('license_runtime_decisions')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'decisionType', 'resourceType', 'createdAt'])
export class LicenseRuntimeDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'decision_type' })
  decisionType: LicenseRuntimeDecisionType;

  @Column({ name: 'resource_type' })
  resourceType: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  requested: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  projected: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true, default: null })
  limit: number | null;

  @Column({ nullable: true })
  period: string | null;

  @Column({ nullable: true })
  state: string | null;

  @Column({ type: 'boolean' })
  allowed: boolean;

  @Column({ type: 'boolean', nullable: true, default: null })
  consumed: boolean | null;

  @Column({ nullable: true })
  reason: string | null;

  @Column({ name: 'orchestrator_id', nullable: true })
  orchestratorId: string | null;

  @Column({ name: 'trace_id', nullable: true })
  traceId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
