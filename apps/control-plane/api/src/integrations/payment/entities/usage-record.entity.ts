import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum UsageRecordStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

/**
 * UsageRecord Entity - Tracks billable usage events from bot executions.
 *
 * Usage events flow:
 * 1. Runner emits event via BillingLibrary
 * 2. Orchestrator collects and batches events
 * 3. Orchestrator sends batch to Control-Plane
 * 4. Control-Plane stores in this table
 * 5. Background job sends to Stripe metered billing
 *
 * Supports multiple metric types:
 * - claims_created: Insurance claims processed
 * - calls_answered: Voice calls handled
 * - emails_processed: Emails processed
 * - documents_extracted: OCR/document processing
 * - ai_tokens: LLM tokens consumed
 */
@Entity('usage_records')
@Index(['tenantId', 'metricName', 'createdAt'])
@Index(['subscriptionId', 'billingPeriod'])
@Index(['status', 'createdAt'])
@Index(['idempotencyKey'], { unique: true })
export class UsageRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  botInstallationId: string | null;

  @Column({ type: 'uuid', nullable: true })
  marketplaceBotId: string | null;

  @Column({ type: 'uuid', nullable: true })
  executionId: string | null;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  metricName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  metricDisplayName: string | null;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'integer', default: 0 })
  unitPriceInCents: number;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency: string;

  @Column({ type: 'timestamp' })
  occurredAt: Date;

  @Column({ type: 'varchar', length: 7 })
  billingPeriod: string;

  @Column({
    type: 'enum',
    enum: UsageRecordStatus,
    default: UsageRecordStatus.PENDING,
  })
  status: UsageRecordStatus;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeUsageRecordId: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  idempotencyKey: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'integer', default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Calculate the billing period string from a date (YYYY-MM format).
   */
  static getBillingPeriod(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Generate an idempotency key for this usage record.
   */
  static generateIdempotencyKey(params: {
    tenantId: string;
    metricName: string;
    executionId?: string;
    timestamp: Date;
    nonce?: string;
  }): string {
    const parts = [
      params.tenantId,
      params.metricName,
      params.executionId || 'no-exec',
      params.timestamp.toISOString(),
      params.nonce || '',
    ];
    return parts.join(':');
  }

  /**
   * Check if this record can be retried.
   */
  canRetry(): boolean {
    return this.status === UsageRecordStatus.FAILED && this.retryCount < 3;
  }

  /**
   * Calculate the total amount for this record.
   */
  getTotalInCents(): number {
    return this.quantity * this.unitPriceInCents;
  }

  /**
   * Get total in dollars (for display).
   */
  getTotalInDollars(): number {
    return this.getTotalInCents() / 100;
  }
}
