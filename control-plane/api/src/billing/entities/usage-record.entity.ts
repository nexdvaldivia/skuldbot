import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
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

  @Column()
  @Index()
  tenantId: string;

  @Column({ type: 'varchar', nullable: true })
  orchestratorId?: string;

  @Column({ type: 'varchar', nullable: true })
  botId?: string;

  @Column({ type: 'varchar', nullable: true })
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

  @Column()
  tenantId: string;

  @Column()
  eventCount: number;

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
