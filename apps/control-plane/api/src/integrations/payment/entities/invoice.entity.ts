import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum InvoiceStatusEnum {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  VOID = 'void',
  UNCOLLECTIBLE = 'uncollectible',
}

/**
 * Invoice Entity - Tracks invoices generated for subscriptions.
 *
 * Invoices are synced from Stripe via webhooks.
 * This provides a local cache for:
 * - Fast querying without Stripe API calls
 * - Analytics and reporting
 * - Audit trail
 */
@Entity('invoices')
@Index(['tenantId', 'status'])
@Index(['stripeInvoiceId'], { unique: true })
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ type: 'varchar', length: 255 })
  stripeCustomerId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  stripeInvoiceId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeSubscriptionId: string | null;

  @Column({
    type: 'enum',
    enum: InvoiceStatusEnum,
    default: InvoiceStatusEnum.DRAFT,
  })
  status: InvoiceStatusEnum;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency: string;

  @Column({ type: 'integer', default: 0 })
  subtotalInCents: number;

  @Column({ type: 'integer', default: 0 })
  taxInCents: number;

  @Column({ type: 'integer', default: 0 })
  totalInCents: number;

  @Column({ type: 'integer', default: 0 })
  amountDueInCents: number;

  @Column({ type: 'integer', default: 0 })
  amountPaidInCents: number;

  @Column({ type: 'integer', default: 0 })
  amountRemainingInCents: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  invoiceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamp', nullable: true })
  periodStart: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  periodEnd: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  voidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  hostedInvoiceUrl: string | null;

  @Column({ type: 'text', nullable: true })
  invoicePdfUrl: string | null;

  @Column({ type: 'jsonb', default: [] })
  lineItems: InvoiceLineItemData[];

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, string>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if invoice is paid.
   */
  isPaid(): boolean {
    return this.status === InvoiceStatusEnum.PAID;
  }

  /**
   * Check if invoice is overdue.
   */
  isOverdue(): boolean {
    if (this.status !== InvoiceStatusEnum.OPEN) {
      return false;
    }
    if (!this.dueDate) {
      return false;
    }
    return new Date() > this.dueDate;
  }

  /**
   * Get total in dollars (for display).
   */
  getTotalInDollars(): number {
    return this.totalInCents / 100;
  }
}

export interface InvoiceLineItemData {
  id: string;
  description: string;
  quantity: number;
  unitAmountInCents: number;
  amountInCents: number;
  priceId?: string;
  type: 'subscription' | 'usage' | 'one_time';
  metadata?: Record<string, string>;
}
