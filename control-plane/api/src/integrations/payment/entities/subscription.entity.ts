import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum SubscriptionStatusEnum {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
  PAUSED = 'paused',
}

export enum BillingInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/**
 * Subscription Entity - Tracks subscriptions for marketplace bots.
 *
 * Each subscription links:
 * - A tenant (customer) to a bot in the marketplace
 * - Payment information (Stripe subscription ID)
 * - Billing period and status
 *
 * This entity is used for:
 * - Fixed-price subscriptions (monthly/annual plans)
 * - Hybrid billing (base + usage)
 */
@Entity('subscriptions')
@Index(['tenantId', 'status'])
@Index(['stripeSubscriptionId'], { unique: true })
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  marketplaceBotId: string | null;

  @Column({ type: 'uuid', nullable: true })
  botInstallationId: string | null;

  @Column({ type: 'varchar', length: 255 })
  stripeCustomerId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  stripeSubscriptionId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripePriceId: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatusEnum,
    default: SubscriptionStatusEnum.INCOMPLETE,
  })
  status: SubscriptionStatusEnum;

  @Column({
    type: 'enum',
    enum: BillingInterval,
    default: BillingInterval.MONTHLY,
  })
  billingInterval: BillingInterval;

  @Column({ type: 'integer', default: 0 })
  priceInCents: number;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency: string;

  @Column({ type: 'timestamp' })
  currentPeriodStart: Date;

  @Column({ type: 'timestamp' })
  currentPeriodEnd: Date;

  @Column({ type: 'timestamp', nullable: true })
  trialStart: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  trialEnd: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  canceledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelAt: Date | null;

  @Column({ type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, string>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if subscription is in an active billing state.
   */
  isActive(): boolean {
    return (
      this.status === SubscriptionStatusEnum.ACTIVE ||
      this.status === SubscriptionStatusEnum.TRIALING
    );
  }

  /**
   * Check if subscription is in trial period.
   */
  isInTrial(): boolean {
    if (this.status !== SubscriptionStatusEnum.TRIALING) {
      return false;
    }
    if (!this.trialEnd) {
      return false;
    }
    return new Date() < this.trialEnd;
  }

  /**
   * Get days remaining in current period.
   */
  getDaysRemainingInPeriod(): number {
    const now = new Date();
    const endDate = this.currentPeriodEnd;
    const diffTime = endDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}
