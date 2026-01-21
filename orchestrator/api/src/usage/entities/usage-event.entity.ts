import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Usage Event Entity
 *
 * Stores billable usage events from bot executions.
 * Events are batched and sent to Control-Plane for billing.
 */
@Entity('usage_events')
@Index(['tenantId', 'occurredAt'])
@Index(['botId', 'occurredAt'])
@Index(['status', 'createdAt'])
export class UsageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  botId: string;

  @Column({ nullable: true })
  runId?: string;

  @Column({ nullable: true })
  installationId?: string; // Marketplace installation ID

  // Event details
  @Column()
  metric: string; // 'claims_created', 'calls_answered', 'emails_processed', etc.

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: number;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  // Metadata (additional context)
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  // Processing state
  @Column({
    type: 'enum',
    enum: ['pending', 'queued', 'sent', 'acked', 'failed'],
    default: 'pending',
  })
  @Index()
  status: 'pending' | 'queued' | 'sent' | 'acked' | 'failed';

  @Column({ nullable: true })
  batchId?: string; // ID of the batch this event was sent in

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastAttempt?: Date;

  @Column({ nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;
}
