import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Installation status
 */
export enum InstallationStatus {
  PENDING_CONFIG = 'pending_config', // Installed but needs vault mapping
  ACTIVE = 'active', // Fully configured and active
  SUSPENDED = 'suspended', // Suspended (billing issue, etc.)
  CANCELLED = 'cancelled', // Cancelled by user
  EXPIRED = 'expired', // Trial expired
}

/**
 * Bot Installation Entity
 *
 * Represents a marketplace bot installed by a tenant in their Orchestrator.
 *
 * Each installation:
 * - Links to a marketplace bot in Control-Plane
 * - Has its own vault mappings (secrets configuration)
 * - Tracks billing subscription with Stripe
 * - Records usage for metered billing
 */
@Entity('bot_installations')
@Index(['tenantId'])
@Index(['tenantId', 'marketplaceBotId'], { unique: true })
@Index(['status'])
export class BotInstallation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  // ============================================================================
  // MARKETPLACE BOT REFERENCE
  // ============================================================================

  @Column({ type: 'uuid' })
  marketplaceBotId: string; // Reference to bot in Control-Plane

  @Column({ length: 200 })
  botName: string; // Denormalized for display

  @Column({ length: 100 })
  botSlug: string; // Denormalized for display

  @Column({ length: 20 })
  installedVersion: string;

  @Column({ type: 'varchar', nullable: true })
  latestAvailableVersion?: string; // For update notifications

  // ============================================================================
  // STATUS
  // ============================================================================

  @Column({
    type: 'enum',
    enum: InstallationStatus,
    default: InstallationStatus.PENDING_CONFIG,
  })
  status: InstallationStatus;

  @Column({ type: 'varchar', nullable: true })
  configuredAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  suspendedAt?: Date;

  @Column({ nullable: true, type: 'text' })
  suspensionReason?: string;

  @Column({ type: 'varchar', nullable: true })
  cancelledAt?: Date;

  @Column({ nullable: true, type: 'text' })
  cancellationReason?: string;

  // ============================================================================
  // VAULT MAPPINGS
  // ============================================================================

  /**
   * Maps required secrets from the bot to tenant's vault entries
   * Example: { 'ms365_tenant': 'vault://my-ms365-creds', 'openai_key': 'vault://gpt-key' }
   */
  @Column({ type: 'jsonb', default: '{}' })
  vaultMappings: Record<string, string>;

  /**
   * Connection configurations for integrations
   * Example: { 'ms365': { tenantId: '...', clientId: '...' } }
   */
  @Column({ type: 'jsonb', default: '{}' })
  connectionConfigs: Record<string, Record<string, unknown>>;

  // ============================================================================
  // BILLING
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  stripeSubscriptionId?: string;

  @Column({ type: 'varchar', nullable: true })
  stripeCustomerId?: string;

  @Column({ type: 'varchar', nullable: true })
  billingStartDate?: Date;

  @Column({ type: 'varchar', nullable: true })
  currentPeriodStart?: Date;

  @Column({ type: 'varchar', nullable: true })
  currentPeriodEnd?: Date;

  @Column({ type: 'varchar', nullable: true })
  trialEndDate?: Date;

  @Column({ default: false })
  isTrialing: boolean;

  // ============================================================================
  // USAGE TRACKING
  // ============================================================================

  /**
   * Usage counters for current billing period
   * Reset at the start of each billing period
   */
  @Column({ type: 'jsonb', default: '{}' })
  usageThisPeriod: Record<string, number>;

  /**
   * Lifetime usage counters
   */
  @Column({ type: 'jsonb', default: '{}' })
  usageLifetime: Record<string, number>;

  @Column({ type: 'varchar', nullable: true })
  lastUsageReportedAt?: Date;

  // ============================================================================
  // EXECUTION STATS
  // ============================================================================

  @Column({ default: 0 })
  totalRuns: number;

  @Column({ default: 0 })
  successfulRuns: number;

  @Column({ default: 0 })
  failedRuns: number;

  @Column({ type: 'varchar', nullable: true })
  lastRunAt?: Date;

  @Column({ type: 'float', default: 0 })
  avgRunDurationSeconds: number;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  customConfig?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  schedules?: {
    id: string;
    cron: string;
    enabled: boolean;
    timezone: string;
  }[];

  @Column({ default: true })
  autoUpdate: boolean; // Automatically update to new versions

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'uuid', nullable: true })
  installedBy?: string; // User ID who installed

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  notes?: string;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  installedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
