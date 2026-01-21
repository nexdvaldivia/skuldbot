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
import { User } from '../../users/entities/user.entity';

/**
 * Bot status enum.
 */
export enum BotStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
  ERROR = 'error',
}

/**
 * Bot category for organization.
 */
export enum BotCategory {
  DATA_EXTRACTION = 'data_extraction',
  DATA_ENTRY = 'data_entry',
  FILE_PROCESSING = 'file_processing',
  WEB_AUTOMATION = 'web_automation',
  DESKTOP_AUTOMATION = 'desktop_automation',
  API_INTEGRATION = 'api_integration',
  EMAIL_AUTOMATION = 'email_automation',
  REPORT_GENERATION = 'report_generation',
  DATA_VALIDATION = 'data_validation',
  CUSTOM = 'custom',
}

/**
 * Bot entity for storing automation definitions.
 *
 * Each bot represents an automation workflow that can be:
 * - Versioned (multiple versions with history)
 * - Scheduled (automatic execution)
 * - Triggered (manual, API, webhook)
 * - Monitored (execution logs, metrics)
 *
 * Enterprise features:
 * - Multi-tenancy isolation
 * - Version control with publishing
 * - Usage tracking and analytics
 * - Export/Import capabilities
 * - Favorites and organization
 * - Credential references
 */
@Entity('bots')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'category'])
@Index(['tenantId', 'createdBy'])
@Index(['tenantId', 'name'])
export class Bot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Tenant ID from license - identifies which tenant owns this bot.
   * In single-tenant mode, this comes from the orchestrator's license.
   */
  @Column()
  @Index()
  tenantId: string;

  // ============================================================================
  // BASIC INFO
  // ============================================================================

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, length: 1000 })
  description: string;

  @Column({
    type: 'enum',
    enum: BotStatus,
    default: BotStatus.DRAFT,
  })
  status: BotStatus;

  @Column({
    type: 'enum',
    enum: BotCategory,
    default: BotCategory.CUSTOM,
  })
  category: BotCategory;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  tags: string[];

  @Column({ nullable: true })
  iconUrl: string;

  @Column({ nullable: true })
  color: string; // Hex color for UI

  // ============================================================================
  // OWNERSHIP & ACCESS
  // ============================================================================

  @Column()
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ nullable: true })
  updatedBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updatedBy' })
  updater: User;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  sharedWithUserIds: string[]; // Users with explicit access

  @Column({ type: 'jsonb', nullable: true, default: [] })
  sharedWithRoleIds: string[]; // Roles with access

  @Column({ default: false })
  isPublic: boolean; // Visible to all tenant users

  // ============================================================================
  // VERSION TRACKING
  // ============================================================================

  @Column({ nullable: true })
  currentVersionId: string; // Latest published version

  @Column({ nullable: true })
  draftVersionId: string; // Current draft being edited

  @Column({ default: 0 })
  totalVersions: number;

  // ============================================================================
  // EXECUTION CONFIG
  // ============================================================================

  @Column({ nullable: true })
  defaultRunnerId: string; // Preferred runner

  @Column({ nullable: true })
  runnerGroupId: string; // Runner pool

  @Column({ default: 300 }) // 5 minutes
  timeoutSeconds: number;

  @Column({ default: 0 })
  maxRetries: number;

  @Column({ default: 60 }) // 1 minute
  retryDelaySeconds: number;

  @Column({ default: 1 })
  priority: number; // 1-10, higher = more priority

  @Column({ type: 'jsonb', nullable: true })
  environmentVariables: Record<string, string>;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  credentialIds: string[]; // Referenced credentials from vault

  // ============================================================================
  // TRIGGER CONFIG
  // ============================================================================

  @Column({ default: true })
  allowManualTrigger: boolean;

  @Column({ default: false })
  allowApiTrigger: boolean;

  @Column({ default: false })
  allowWebhookTrigger: boolean;

  @Column({ nullable: true })
  webhookSecret: string; // For webhook authentication

  // ============================================================================
  // USAGE STATISTICS
  // ============================================================================

  @Column({ type: 'bigint', default: 0 })
  totalRuns: number;

  @Column({ type: 'bigint', default: 0 })
  successfulRuns: number;

  @Column({ type: 'bigint', default: 0 })
  failedRuns: number;

  @Column({ nullable: true })
  lastRunAt: Date;

  @Column({ nullable: true })
  lastSuccessAt: Date;

  @Column({ nullable: true })
  lastFailureAt: Date;

  @Column({ type: 'float', default: 0 })
  avgDurationSeconds: number;

  // ============================================================================
  // ORGANIZATION
  // ============================================================================

  @Column({ nullable: true })
  folderId: string; // For folder organization

  @Column({ type: 'jsonb', nullable: true, default: [] })
  favoritedBy: string[]; // User IDs who favorited

  @Column({ default: 0 })
  viewCount: number;

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  notifications: {
    onSuccess?: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'teams' | 'webhook')[];
      recipients?: string[];
    };
    onFailure?: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'teams' | 'webhook')[];
      recipients?: string[];
    };
    onTimeout?: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'teams' | 'webhook')[];
      recipients?: string[];
    };
  };

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  settings: Record<string, any>;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  archivedAt: Date;

  @Column({ nullable: true })
  archivedBy: string;

  // ============================================================================
  // RELATIONS
  // ============================================================================

  @OneToMany(() => BotVersion, (version) => version.bot)
  versions: BotVersion[];
}

/**
 * Version status enum.
 */
export enum VersionStatus {
  DRAFT = 'draft',
  COMPILED = 'compiled',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
}

/**
 * Bot Version entity for version control.
 *
 * Each version contains:
 * - DSL definition (the automation workflow)
 * - UI state (React Flow positions)
 * - Compiled execution plan
 * - Change notes and metadata
 *
 * Version lifecycle:
 * DRAFT -> COMPILED -> PUBLISHED -> DEPRECATED
 */
@Entity('bot_versions')
@Index(['botId', 'status'])
@Index(['botId', 'version'])
@Index(['botId', 'createdAt'])
export class BotVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  botId: string;

  @ManyToOne(() => Bot, (bot) => bot.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'botId' })
  bot: Bot;

  // ============================================================================
  // VERSION INFO
  // ============================================================================

  @Column({ length: 50 })
  version: string; // semver: 1.0.0, 1.0.1, etc.

  @Column({ nullable: true, length: 200 })
  label: string; // Human-readable label: "Initial Release", "Bug Fix", etc.

  @Column({ nullable: true, length: 2000 })
  changeNotes: string; // What changed in this version

  @Column({
    type: 'enum',
    enum: VersionStatus,
    default: VersionStatus.DRAFT,
  })
  status: VersionStatus;

  // ============================================================================
  // DSL & COMPILATION
  // ============================================================================

  @Column({ type: 'jsonb' })
  dsl: Record<string, any>; // BotDSL

  @Column({ type: 'jsonb', nullable: true })
  ui: Record<string, any>; // React Flow state (positions, etc.)

  @Column({ type: 'jsonb', nullable: true })
  compiledPlan: Record<string, any> | null; // ExecutionPlan (cached)

  @Column({ nullable: true })
  planHash: string | null; // SHA256 of compiled plan

  @Column({ nullable: true })
  compiledAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  compilationErrors: string[];

  @Column({ type: 'jsonb', nullable: true })
  compilationWarnings: string[];

  // ============================================================================
  // STATS
  // ============================================================================

  @Column({ default: 0 })
  nodeCount: number;

  @Column({ default: 0 })
  edgeCount: number;

  @Column({ type: 'jsonb', nullable: true })
  nodeTypes: Record<string, number>; // Count by node type

  @Column({ type: 'bigint', default: 0 })
  totalRuns: number;

  @Column({ type: 'bigint', default: 0 })
  successfulRuns: number;

  @Column({ type: 'float', default: 0 })
  avgDurationSeconds: number;

  // ============================================================================
  // PUBLISHING
  // ============================================================================

  @Column({ default: false })
  isPublished: boolean;

  @Column({ nullable: true })
  publishedAt: Date;

  @Column({ nullable: true })
  publishedBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'publishedBy' })
  publisher: User;

  // ============================================================================
  // AUTHORSHIP
  // ============================================================================

  @Column()
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ nullable: true })
  updatedBy: string;

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deprecatedAt: Date;

  @Column({ nullable: true })
  deprecatedBy: string;

  @Column({ nullable: true, length: 500 })
  deprecationReason: string;
}
