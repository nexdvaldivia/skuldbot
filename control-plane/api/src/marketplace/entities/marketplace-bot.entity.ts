import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Partner } from './partner.entity';

/**
 * Bot status in the marketplace
 */
export enum MarketplaceBotStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  REJECTED = 'rejected',
}

/**
 * Bot category
 */
export enum BotCategory {
  EMAIL = 'email',
  INSURANCE = 'insurance',
  FINANCE = 'finance',
  HR = 'hr',
  SALES = 'sales',
  HEALTHCARE = 'healthcare',
  LOGISTICS = 'logistics',
  CUSTOM = 'custom',
}

/**
 * Execution mode
 */
export enum ExecutionMode {
  CLOUD = 'cloud', // Runs on Orchestrator cloud workers
  RUNNER = 'runner', // Runs on customer's on-premise runner
  HYBRID = 'hybrid', // Some parts cloud, some parts runner
}

/**
 * Pricing model
 */
export enum PricingModel {
  FREE = 'free',
  SUBSCRIPTION = 'subscription',
  USAGE = 'usage',
  HYBRID = 'hybrid', // Subscription + usage
}

/**
 * Marketplace Bot Entity
 *
 * Represents a bot published in the SkuldBot marketplace.
 * Bots can be published by Skuld or by partners.
 *
 * Lifecycle:
 * DRAFT -> PENDING_REVIEW -> APPROVED -> PUBLISHED -> DEPRECATED
 *                        -> REJECTED
 */
@Entity('marketplace_bots')
@Index(['status'])
@Index(['category'])
@Index(['publisherId'])
@Index(['slug'], { unique: true })
export class MarketplaceBot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // BASIC INFO
  // ============================================================================

  @Column({ length: 200 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string; // URL-friendly: "fnol-handler"

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  longDescription: string; // Markdown

  @Column({
    type: 'enum',
    enum: BotCategory,
    default: BotCategory.CUSTOM,
  })
  category: BotCategory;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  // ============================================================================
  // EXECUTION MODE
  // ============================================================================

  @Column({
    type: 'enum',
    enum: ExecutionMode,
    default: ExecutionMode.RUNNER,
  })
  executionMode: ExecutionMode;

  @Column({ type: 'jsonb', nullable: true })
  hybridConfig?: {
    cloudComponents: string[];
    runnerComponents: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  runnerRequirements?: {
    os: ('windows' | 'macos' | 'linux')[];
    minMemoryMb: number;
    requiresDisplay: boolean;
    requiredSoftware: string[];
    networkAccess: string[];
  };

  // ============================================================================
  // PUBLISHER
  // ============================================================================

  @Column()
  publisherId: string;

  @ManyToOne(() => Partner, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'publisherId' })
  publisher: Partner;

  @Column({ default: false })
  isSkuldBot: boolean; // True if published by Skuld

  // ============================================================================
  // STATUS
  // ============================================================================

  @Column({
    type: 'enum',
    enum: MarketplaceBotStatus,
    default: MarketplaceBotStatus.DRAFT,
  })
  status: MarketplaceBotStatus;

  @Column({ type: 'varchar', nullable: true })
  submittedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  approvedBy?: string;

  @Column({ type: 'varchar', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  publishedAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  rejectedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  rejectionReason?: string;

  // ============================================================================
  // VERSION TRACKING
  // ============================================================================

  @Column({ length: 20 })
  currentVersion: string; // "1.2.0"

  @OneToMany(() => BotVersion, (version) => version.marketplaceBot)
  versions: BotVersion[];

  // ============================================================================
  // MARKETING PAGE CONTENT
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  iconUrl?: string;

  @Column({ type: 'jsonb', default: [] })
  screenshots: string[];

  @Column({ type: 'varchar', nullable: true })
  demoVideoUrl?: string;

  @Column({ type: 'varchar', nullable: true })
  documentationUrl?: string;

  @Column({ type: 'varchar', nullable: true })
  heroImageUrl?: string; // Large hero image for marketing page

  @Column({ nullable: true, type: 'text' })
  tagline?: string; // Short marketing tagline

  @Column({ type: 'jsonb', nullable: true })
  features?: {
    title: string;
    description: string;
    icon?: string;
  }[];

  @Column({ type: 'jsonb', nullable: true })
  useCases?: {
    title: string;
    description: string;
    industry?: string;
  }[];

  @Column({ type: 'jsonb', nullable: true })
  testimonials?: {
    quote: string;
    author: string;
    company: string;
    role?: string;
    avatarUrl?: string;
  }[];

  @Column({ type: 'jsonb', nullable: true })
  faqs?: {
    question: string;
    answer: string;
  }[];

  @Column({ type: 'jsonb', nullable: true })
  integrations?: {
    name: string;
    logoUrl: string;
    description?: string;
  }[];

  @Column({ type: 'jsonb', nullable: true })
  benefits?: {
    metric: string;
    value: string;
    description?: string;
  }[]; // e.g., "90% time saved", "50% cost reduction"

  @Column({ nullable: true, type: 'text' })
  setupGuide?: string; // Markdown guide for getting started

  @Column({ type: 'varchar', nullable: true })
  supportEmail?: string;

  @Column({ type: 'varchar', nullable: true })
  supportUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  socialLinks?: {
    platform: 'twitter' | 'linkedin' | 'github' | 'youtube' | 'website';
    url: string;
  }[];

  // ============================================================================
  // PRICING
  // ============================================================================

  @Column({
    type: 'enum',
    enum: PricingModel,
    default: PricingModel.USAGE,
  })
  pricingModel: PricingModel;

  @Column({ type: 'jsonb', nullable: true })
  pricing: {
    // Subscription
    monthlyBase?: number;
    annualDiscount?: number;

    // Usage-based
    usageMetrics?: {
      metric: string;
      pricePerUnit: number;
      description: string;
    }[];

    // Hybrid (minimum guaranteed)
    minimumMonthly?: number;

    // Trial
    trialDays?: number;

    // Stripe IDs
    stripePriceId?: string;
    stripeMeterId?: string;
  };

  // ============================================================================
  // REQUIREMENTS
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  requirements: {
    connections: string[]; // ['ms365', 'openai']
    vaultSecrets: string[]; // Required secrets
    permissions: string[];
    minEngineVersion: string;
  };

  // ============================================================================
  // STATS
  // ============================================================================

  @Column({ default: 0 })
  installs: number;

  @Column({ type: 'float', default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviews: number;

  @Column({ default: 0 })
  totalRuns: number;

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  deprecatedAt?: Date;
}

/**
 * Bot Version Entity
 *
 * Each version of a marketplace bot.
 */
@Entity('marketplace_bot_versions')
@Index(['marketplaceBotId', 'version'], { unique: true })
@Index(['marketplaceBotId', 'createdAt'])
export class BotVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  marketplaceBotId: string;

  @ManyToOne(() => MarketplaceBot, (bot) => bot.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplaceBotId' })
  marketplaceBot: MarketplaceBot;

  @Column({ length: 20 })
  version: string; // semver: "1.0.0"

  @Column({ type: 'text', nullable: true })
  releaseNotes?: string;

  // Package info
  @Column()
  packageUrl: string; // S3 URL of the .skb file

  @Column()
  packageHash: string; // SHA256 hash for verification

  @Column({ type: 'varchar', nullable: true })
  packageSignature?: string; // Digital signature

  @Column({ type: 'bigint', default: 0 })
  packageSize: number;

  // DSL info
  @Column({ type: 'jsonb', nullable: true })
  dslSchema?: Record<string, unknown>; // For validation

  @Column()
  dslHash: string;

  // Status
  @Column({ default: false })
  isLatest: boolean;

  @Column({ default: false })
  isDeprecated: boolean;

  @Column({ nullable: true, type: 'text' })
  deprecationReason?: string;

  // Stats
  @Column({ default: 0 })
  downloads: number;

  @CreateDateColumn()
  createdAt: Date;
}
