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
import { PartnerType } from './partner-type.entity';

/**
 * Partner status
 */
export type PartnerStatus = string;
export const PartnerStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  TERMINATED: 'terminated',
} as const;

/**
 * Revenue share tier based on lifetime revenue
 */
export type RevenueShareTier = string;
export const RevenueShareTier = {
  STARTER: 'starter', // 0 - $100k: 70% partner / 30% Skuld
  ESTABLISHED: 'established', // $100k - $1M: 75% partner / 25% Skuld
  PREMIER: 'premier', // $1M+: 80% partner / 20% Skuld
} as const;

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

  @Column({ type: 'uuid', nullable: true })
  partnerTypeId?: string | null;

  @ManyToOne(() => PartnerType, (partnerType) => partnerType.partners, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'partnerTypeId' })
  partnerType?: PartnerType | null;

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

  @Column({ type: 'varchar', length: 50, default: PartnerStatus.PENDING })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  approvedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reviewedBy?: string;

  @Column({ type: 'text', nullable: true })
  reviewNotes?: string;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rejectedBy?: string;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  activatedBy?: string;

  @Column({ type: 'varchar', nullable: true })
  suspendedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  suspensionReason?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  suspendedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  terminatedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  terminatedBy?: string;

  @Column({ type: 'text', nullable: true })
  terminationReason?: string;

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

  @Column({ type: 'varchar', length: 50, default: RevenueShareTier.STARTER })
  revenueShareTier: string;

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

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
