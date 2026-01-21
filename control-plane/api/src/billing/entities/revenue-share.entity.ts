import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Revenue Share Tier
 *
 * Defines commission rates based on partner's lifetime revenue.
 */
export enum RevenueShareTier {
  STARTER = 'starter', // 0 - 100k: 30% commission (70% to partner)
  ESTABLISHED = 'established', // 100k - 1M: 25% commission (75% to partner)
  PREMIER = 'premier', // 1M+: 20% commission (80% to partner)
}

/**
 * Revenue Share Record Entity
 *
 * Tracks revenue share calculations for partner payouts.
 */
@Entity('revenue_share_records')
@Index(['partnerId', 'period'])
@Index(['status', 'period'])
export class RevenueShareRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  partnerId: string;

  @Column()
  partnerName: string;

  // Period (YYYY-MM format)
  @Column()
  @Index()
  period: string;

  // Revenue breakdown
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  grossRevenue: number; // Total revenue from partner's bots

  @Column({
    type: 'enum',
    enum: RevenueShareTier,
  })
  tier: RevenueShareTier;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  commissionRate: number; // e.g., 0.25 for 25%

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  skuldCommission: number; // Amount Skuld keeps

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  partnerPayout: number; // Amount to pay partner

  @Column({ default: 'USD' })
  currency: string;

  // Stripe Connect payout
  @Column({ type: 'varchar', nullable: true })
  stripeConnectAccountId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripeTransferId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripePayoutId?: string;

  // Status
  @Column({
    type: 'enum',
    enum: ['calculated', 'approved', 'transferred', 'paid', 'failed'],
    default: 'calculated',
  })
  @Index()
  status: 'calculated' | 'approved' | 'transferred' | 'paid' | 'failed';

  @Column({ type: 'varchar', nullable: true })
  approvedBy?: string;

  @Column({ type: 'varchar', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  transferredAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  paidAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  error?: string;

  // Detailed breakdown
  @Column({ type: 'jsonb', nullable: true })
  breakdown?: {
    byBot: Record<
      string,
      {
        botId: string;
        botName: string;
        subscriptionRevenue: number;
        usageRevenue: number;
        totalRevenue: number;
      }
    >;
    byTenant: Record<
      string,
      {
        tenantId: string;
        revenue: number;
      }
    >;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Partner Payout Entity
 *
 * Tracks individual payout transactions to partners.
 */
@Entity('partner_payouts')
@Index(['partnerId', 'createdAt'])
export class PartnerPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  partnerId: string;

  @Column()
  partnerName: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ default: 'USD' })
  currency: string;

  // Related revenue share records
  @Column({ type: 'simple-array' })
  revenueShareRecordIds: string[];

  // Stripe Connect
  @Column({ type: 'varchar', nullable: true })
  stripeConnectAccountId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripeTransferId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripePayoutId?: string;

  // Status
  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  })
  @Index()
  status: 'pending' | 'processing' | 'completed' | 'failed';

  @Column({ type: 'varchar', nullable: true })
  processedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  completedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;
}
