import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Usage Record Entity
 *
 * Stores aggregated usage records received from Orchestrators.
 * Used for billing calculations and revenue share.
 */
@Entity('usage_records')
@Index(['tenantId', 'period'])
@Index(['metric', 'period'])
@Index(['installationId', 'period'])
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'varchar', nullable: true })
  orchestratorId?: string;

  @Column({ type: 'uuid', nullable: true })
  botId?: string;

  @Column({ type: 'uuid', nullable: true })
  installationId?: string; // Marketplace installation

  // Usage details
  @Column()
  metric: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: number;

  // Billing period (YYYY-MM format)
  @Column()
  @Index()
  period: string;

  // Pricing at time of usage (for historical accuracy)
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  unitPrice?: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  totalAmount?: number;

  @Column({ type: 'varchar', nullable: true })
  currency?: string;

  // Stripe integration
  @Column({ type: 'varchar', nullable: true })
  stripeUsageRecordId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripeSubscriptionItemId?: string;

  // Processing state
  @Column({
    type: 'enum',
    enum: ['pending', 'processed', 'billed', 'failed'],
    default: 'pending',
  })
  @Index()
  status: 'pending' | 'processed' | 'billed' | 'failed';

  @Column({ type: 'varchar', nullable: true })
  processedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Usage Batch Entity
 *
 * Tracks batches received from Orchestrators for idempotency.
 */
@Entity('usage_batches')
@Index(['orchestratorId', 'batchId'], { unique: true })
export class UsageBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  batchId: string; // ID from Orchestrator

  @Column()
  orchestratorId: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column()
  eventCount: number;

  @Column({ default: 0 })
  processedCount: number;

  @Column({ default: 0 })
  duplicateEventCount: number;

  @Column({ type: 'varchar', nullable: true })
  traceId?: string;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({
    type: 'enum',
    enum: ['received', 'processing', 'processed', 'failed'],
    default: 'received',
  })
  status: 'received' | 'processing' | 'processed' | 'failed';

  @Column({ type: 'varchar', nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Usage Ingest Event Entity
 *
 * Keeps idempotency records per event_id from each orchestrator.
 * If an event is already present, usage aggregation must skip it.
 */
@Entity('usage_ingest_events')
@Index(['orchestratorId', 'eventId'], { unique: true })
@Index(['tenantId', 'occurredAt'])
export class UsageIngestEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orchestratorId: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column()
  eventId: string;

  @Column()
  batchId: string;

  @Column()
  metric: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: number;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'varchar', nullable: true })
  traceId?: string;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Usage Ingest Dead Letter Entity
 *
 * Stores ingest batches that exhausted local retries in Control Plane.
 * Allows manual replay without losing payload/traceability.
 */
@Entity('usage_ingest_dead_letters')
@Index(['orchestratorId', 'batchId'], { unique: true })
@Index(['tenantId', 'status'])
export class UsageIngestDeadLetter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orchestratorId: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column()
  batchId: string;

  @Column({ type: 'varchar', nullable: true })
  traceId?: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'varchar' })
  error: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ['pending', 'replayed', 'discarded'],
    default: 'pending',
  })
  status: 'pending' | 'replayed' | 'discarded';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
