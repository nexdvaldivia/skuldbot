import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Payment Method Type
 */
export enum PaymentMethodType {
  ACH_DEBIT = 'ach_debit', // US Bank Account (ACH Direct Debit)
  SEPA_DEBIT = 'sepa_debit', // European Bank Account
  CARD = 'card', // Credit/Debit Card (backup)
  INVOICE = 'invoice', // Manual invoice (enterprise only)
}

/**
 * Subscription Status
 */
export enum SubscriptionStatus {
  TRIALING = 'trialing', // Free trial period
  ACTIVE = 'active', // Paid and current
  PAST_DUE = 'past_due', // Payment failed, grace period
  SUSPENDED = 'suspended', // Service suspended due to non-payment
  CANCELED = 'canceled', // Subscription canceled
  UNPAID = 'unpaid', // Multiple payment failures
}

/**
 * Tenant Subscription Entity
 *
 * Tracks subscription status and payment method for each tenant.
 * Controls whether bots can run based on payment status.
 */
@Entity('tenant_subscriptions')
@Index(['tenantId'], { unique: true })
export class TenantSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  tenantName: string;

  // Stripe Subscription
  @Column({ type: 'varchar', nullable: true })
  stripeCustomerId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripeSubscriptionId?: string;

  // Payment Method
  @Column({
    type: 'enum',
    enum: PaymentMethodType,
    default: PaymentMethodType.ACH_DEBIT,
  })
  paymentMethodType: PaymentMethodType;

  @Column({ type: 'varchar', nullable: true })
  stripePaymentMethodId?: string;

  // Bank Account Info (masked for display)
  @Column({ type: 'varchar', nullable: true })
  bankName?: string; // e.g., "Chase"

  @Column({ type: 'varchar', nullable: true })
  bankAccountLast4?: string; // e.g., "4242"

  @Column({ type: 'varchar', nullable: true })
  bankAccountType?: string; // "checking" or "savings"

  // Subscription Status
  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIALING,
  })
  @Index()
  status: SubscriptionStatus;

  // Billing Cycle
  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  trialEnd?: Date;

  // Payment Failure Tracking
  @Column({ default: 0 })
  failedPaymentAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastPaymentAttempt?: Date;

  @Column({ type: 'varchar', nullable: true })
  lastPaymentError?: string;

  @Column({ type: 'timestamptz', nullable: true })
  suspendedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  suspensionReason?: string;

  // Grace Period Settings (Industry Standard: 14 days)
  // Day 0: Payment fails, Stripe retries automatically (3-5 attempts)
  // Day 7: Warning email sent
  // Day 14: Grace period ends, bots suspended
  // Day 30: Account canceled if still unpaid
  @Column({ default: 14 })
  gracePeriodDays: number; // Days before suspension after payment failure

  @Column({ type: 'timestamptz', nullable: true })
  gracePeriodEnds?: Date;

  // Amounts
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthlyAmount?: number;

  @Column({ default: 'USD' })
  currency: string;

  // Bot Execution Control
  @Column({ default: true })
  botsCanRun: boolean; // Master switch - set to false when suspended

  @Column({ type: 'varchar', nullable: true })
  botsDisabledReason?: string;

  @Column({ type: 'timestamptz', nullable: true })
  botsDisabledAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Payment History Entity
 *
 * Tracks all payment attempts and their outcomes.
 */
@Entity('payment_history')
@Index(['tenantId', 'createdAt'])
@Index(['stripePaymentIntentId'])
export class PaymentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  subscriptionId: string;

  // Stripe References
  @Column({ type: 'varchar', nullable: true })
  stripePaymentIntentId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripeInvoiceId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripeChargeId?: string;

  // Payment Details
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentMethodType,
  })
  paymentMethod: PaymentMethodType;

  // Status
  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'disputed'],
    default: 'pending',
  })
  @Index()
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'disputed';

  // For ACH, payment can take days to clear
  @Column({ type: 'timestamptz', nullable: true })
  expectedClearDate?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  clearedAt?: Date;

  // Error Information
  @Column({ type: 'varchar', nullable: true })
  errorCode?: string;

  @Column({ type: 'varchar', nullable: true })
  errorMessage?: string;

  @Column({ type: 'varchar', nullable: true })
  declineReason?: string;

  // Invoice Period
  @Column({ type: 'varchar', nullable: true })
  invoicePeriod?: string; // YYYY-MM

  @Column({ type: 'jsonb', nullable: true })
  invoiceLineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;

  @CreateDateColumn()
  createdAt: Date;
}
