import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PartnerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

export enum RevenueShareTier {
  STARTER = 'starter',
  ESTABLISHED = 'established',
  PREMIER = 'premier',
}

/**
 * Partner Entity - Publishers of bots in the SkuldBot Marketplace.
 *
 * Partners can:
 * - Submit bots for review
 * - Publish approved bots
 * - Receive revenue share via Stripe Connect
 *
 * Revenue Share Tiers:
 * - Starter ($0-$100k lifetime): Skuld 30%, Partner 70%
 * - Established ($100k-$1M): Skuld 25%, Partner 75%
 * - Premier ($1M+): Skuld 20%, Partner 80%
 */
@Entity('partners')
@Index(['email'], { unique: true })
@Index(['stripeConnectAccountId'], { unique: true, where: '"stripeConnectAccountId" IS NOT NULL' })
export class PartnerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  company: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({
    type: 'enum',
    enum: PartnerStatus,
    default: PartnerStatus.PENDING,
  })
  status: PartnerStatus;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeConnectAccountId: string | null;

  @Column({ type: 'boolean', default: false })
  stripeChargesEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  stripePayoutsEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  stripeDetailsSubmitted: boolean;

  @Column({
    type: 'enum',
    enum: RevenueShareTier,
    default: RevenueShareTier.STARTER,
  })
  revenueShareTier: RevenueShareTier;

  @Column({ type: 'bigint', default: 0 })
  lifetimeRevenueInCents: number;

  @Column({ type: 'bigint', default: 0 })
  lifetimePayoutsInCents: number;

  @Column({ type: 'integer', default: 0 })
  totalBots: number;

  @Column({ type: 'integer', default: 0 })
  totalPublishedBots: number;

  @Column({ type: 'integer', default: 0 })
  totalInstalls: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, string>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Get the Skuld commission percentage based on tier.
   */
  getSkuldCommissionPercent(): number {
    switch (this.revenueShareTier) {
      case RevenueShareTier.STARTER:
        return 30;
      case RevenueShareTier.ESTABLISHED:
        return 25;
      case RevenueShareTier.PREMIER:
        return 20;
      default:
        return 30;
    }
  }

  /**
   * Get the partner share percentage based on tier.
   */
  getPartnerSharePercent(): number {
    return 100 - this.getSkuldCommissionPercent();
  }

  /**
   * Calculate payout amount for a given gross amount.
   * @param grossAmountInCents Total amount paid by customer
   * @returns Amount to transfer to partner in cents
   */
  calculatePayoutAmount(grossAmountInCents: number): number {
    const partnerSharePercent = this.getPartnerSharePercent();
    return Math.floor((grossAmountInCents * partnerSharePercent) / 100);
  }

  /**
   * Calculate Skuld's commission for a given gross amount.
   * @param grossAmountInCents Total amount paid by customer
   * @returns Skuld's commission in cents
   */
  calculateSkuldCommission(grossAmountInCents: number): number {
    return grossAmountInCents - this.calculatePayoutAmount(grossAmountInCents);
  }

  /**
   * Check and update revenue share tier based on lifetime revenue.
   * @returns True if tier was upgraded
   */
  updateRevenueShareTier(): boolean {
    const previousTier = this.revenueShareTier;
    const revenueInDollars = this.lifetimeRevenueInCents / 100;

    if (revenueInDollars >= 1000000) {
      this.revenueShareTier = RevenueShareTier.PREMIER;
    } else if (revenueInDollars >= 100000) {
      this.revenueShareTier = RevenueShareTier.ESTABLISHED;
    } else {
      this.revenueShareTier = RevenueShareTier.STARTER;
    }

    return previousTier !== this.revenueShareTier;
  }

  /**
   * Check if partner is ready to receive payouts.
   */
  canReceivePayouts(): boolean {
    return (
      this.status === PartnerStatus.APPROVED &&
      this.stripeConnectAccountId !== null &&
      this.stripePayoutsEnabled &&
      this.stripeDetailsSubmitted
    );
  }

  /**
   * Check if partner can publish bots.
   */
  canPublishBots(): boolean {
    return this.status === PartnerStatus.APPROVED;
  }
}
