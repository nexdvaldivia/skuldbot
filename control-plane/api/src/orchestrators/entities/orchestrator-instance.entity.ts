import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum OrchestratorLifecycleStatus {
  REGISTERED = 'registered',
  ACTIVE = 'active',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
  DEREGISTERED = 'deregistered',
  ERROR = 'error',
}

@Entity('orchestrator_instances')
@Index(['tenantId', 'status'])
export class OrchestratorInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'orchestrator_id', unique: true })
  @Index({ unique: true })
  orchestratorId: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  @Index()
  tenantId: string | null;

  @Column({ type: 'varchar', nullable: true })
  version: string | null;

  @Column({
    type: 'enum',
    enum: OrchestratorLifecycleStatus,
    default: OrchestratorLifecycleStatus.REGISTERED,
  })
  @Index()
  status: OrchestratorLifecycleStatus;

  @Column({ name: 'registered_at', type: 'timestamptz' })
  registeredAt: Date;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ name: 'deregistered_at', type: 'timestamptz', nullable: true })
  deregisteredAt: Date | null;

  @Column({ name: 'last_seen_ip', type: 'varchar', nullable: true })
  lastSeenIp: string | null;

  @Column({ type: 'jsonb', default: {} })
  capabilities: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ name: 'last_metrics', type: 'jsonb', default: {} })
  lastMetrics: Record<string, unknown>;

  @Column({ name: 'last_health_report', type: 'jsonb', nullable: true })
  lastHealthReport: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
