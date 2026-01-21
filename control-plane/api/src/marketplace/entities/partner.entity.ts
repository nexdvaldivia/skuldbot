import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Partner status
 */
export enum PartnerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
}

/**
 * Revenue share tier based on lifetime revenue
 */
export enum RevenueShareTier {
  STARTER = 'starter', // 0 - $100k: 70% partner / 30% Skuld
  ESTABLISHED = 'established', // $100k - $1M: 75% partner / 25% Skuld
  PREMIER = 'premier', // $1M+: 80% partner / 20% Skuld
}

/**
 * Partner Entity
 *
 * Represents a partner/publisher who can submit bots to the marketplace.
 * Partners earn revenue share from their bot sales.
 *
 * Revenue Share Model:
 * - Starter (0-$100k lifetime): 70% partner, 30% Skuld
 * - Established ($100k-$1M): 75% partner, 25% Skuld
 * - Premier ($1M+): 80% partner, 20% Skuld
 */
@Entity('partners')
@Index(['status'])
@Index(['email'], { unique: true })
export class Partner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // BASIC INFO
  // ============================================================================

  @Column({ length: 200 })
  name: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 200 })
  company: string;

  @Column({ type: 'varchar', nullable: true })
  website?: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl?: string;

  // ============================================================================
  // CONTACT INFO
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  contactName?: string;

  @Column({ type: 'varchar', nullable: true })
  contactPhone?: string;

  @Column({ type: 'varchar', nullable: true })
  billingEmail?: string;

  @Column({ type: 'jsonb', nullable: true })
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };

  // ============================================================================
  // STATUS
  // ============================================================================

  @Column({
    type: 'enum',
    enum: PartnerStatus,
    default: PartnerStatus.PENDING,
  })
  status: PartnerStatus;

  @Column({ type: 'varchar', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  approvedBy?: string;

  @Column({ type: 'varchar', nullable: true })
  suspendedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  suspensionReason?: string;

  // ============================================================================
  // STRIPE CONNECT
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  stripeConnectAccountId?: string;

  @Column({ default: false })
  stripeOnboardingComplete: boolean;

  @Column({ type: 'varchar', nullable: true })
  stripeOnboardingUrl?: string;

  @Column({ type: 'varchar', nullable: true })
  payoutSchedule?: string; // 'daily', 'weekly', 'monthly'

  // ============================================================================
  // REVENUE SHARE
  // ============================================================================

  @Column({
    type: 'enum',
    enum: RevenueShareTier,
    default: RevenueShareTier.STARTER,
  })
  revenueShareTier: RevenueShareTier;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  lifetimeRevenue: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  lifetimePayouts: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  pendingPayout: number;

  @Column({ type: 'varchar', nullable: true })
  lastPayoutAt?: Date;

  // ============================================================================
  // STATS
  // ============================================================================

  @Column({ default: 0 })
  totalBots: number;

  @Column({ default: 0 })
  publishedBots: number;

  @Column({ default: 0 })
  totalInstalls: number;

  @Column({ type: 'float', default: 0 })
  averageRating: number;

  // ============================================================================
  // VERIFICATION
  // ============================================================================

  @Column({ default: false })
  verified: boolean; // Skuld-verified partner

  @Column({ type: 'varchar', nullable: true })
  verifiedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  verificationDocuments?: {
    type: string;
    url: string;
    uploadedAt: string;
    verifiedAt?: string;
  }[];

  // ============================================================================
  // API ACCESS
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  apiKey?: string; // For programmatic bot submissions

  @Column({ type: 'varchar', nullable: true })
  apiKeyCreatedAt?: Date;

  @Column({ default: true })
  apiEnabled: boolean;

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  settings?: {
    notifications: {
      newInstall: boolean;
      review: boolean;
      payout: boolean;
    };
    webhookUrl?: string;
  };

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
