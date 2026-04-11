import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RunnerType {
  ATTENDED = 'attended',
  UNATTENDED = 'unattended',
}

export enum RunnerRuntimeStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  ERROR = 'error',
}

@Entity('runner_heartbeats')
@Index(['tenantId', 'runnerId'], { unique: true })
@Index(['tenantId', 'heartbeatAt'])
export class RunnerHeartbeatEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  runnerId: string;

  @Column({ type: 'varchar', length: 32 })
  type: RunnerType;

  @Column({ type: 'varchar', length: 32, default: RunnerRuntimeStatus.ACTIVE })
  status: RunnerRuntimeStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  orchestratorId?: string;

  @Column({ type: 'timestamptz' })
  heartbeatAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
