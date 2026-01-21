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
import { Bot, BotVersion } from '../../bots/entities/bot.entity';
import { User } from '../../users/entities/user.entity';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Schedule status for lifecycle management.
 */
export enum ScheduleStatus {
  DRAFT = 'draft', // Not yet activated
  ACTIVE = 'active', // Running on schedule
  PAUSED = 'paused', // Temporarily paused
  DISABLED = 'disabled', // Manually disabled
  EXPIRED = 'expired', // Past end date
  ERROR = 'error', // Configuration error
  QUOTA_EXCEEDED = 'quota_exceeded', // Hit execution limits
}

/**
 * Schedule trigger type.
 */
export enum ScheduleTriggerType {
  CRON = 'cron', // Standard cron expression
  INTERVAL = 'interval', // Fixed interval (every X minutes)
  CALENDAR = 'calendar', // Specific dates/times
  EVENT = 'event', // Event-based trigger
  WEBHOOK = 'webhook', // External webhook trigger
  QUEUE = 'queue', // Queue-based trigger
  FILE_WATCHER = 'file_watcher', // File system events
  EMAIL = 'email', // Email arrival trigger
}

/**
 * Target runner selection strategy.
 */
export enum ScheduleTargetType {
  ANY = 'any', // Any available runner
  POOL = 'pool', // Specific runner pool
  PINNED = 'pinned', // Specific runner
  CAPABILITY = 'capability', // By capabilities
  AFFINITY = 'affinity', // Prefer same runner as last time
  ROUND_ROBIN = 'round_robin', // Rotate through runners
  LEAST_LOADED = 'least_loaded', // Runner with lowest load
}

/**
 * Priority level for scheduled runs.
 */
export enum SchedulePriority {
  CRITICAL = 1, // SLA-bound, immediate execution
  HIGH = 2, // Business-critical
  NORMAL = 3, // Standard priority
  LOW = 4, // Best effort
  BATCH = 5, // Background processing
}

/**
 * Overlap policy when schedule fires while previous run is still active.
 */
export enum ScheduleOverlapPolicy {
  SKIP = 'skip', // Skip this execution
  QUEUE = 'queue', // Queue for later
  ALLOW = 'allow', // Allow concurrent execution
  CANCEL_PREVIOUS = 'cancel_previous', // Cancel previous, start new
  CANCEL_NEW = 'cancel_new', // Keep previous, skip new
}

/**
 * Catchup policy for missed executions.
 */
export enum ScheduleCatchupPolicy {
  NONE = 'none', // Don't catch up missed runs
  ONE = 'one', // Run once if any were missed
  ALL = 'all', // Run all missed executions
  LATEST = 'latest', // Run only the latest missed
}

/**
 * Schedule execution history status.
 */
export enum ScheduleExecutionStatus {
  PENDING = 'pending', // Waiting to start
  RUNNING = 'running', // Currently running
  TRIGGERED = 'triggered', // Successfully triggered
  COMPLETED = 'completed', // Run completed successfully
  CANCELLED = 'cancelled', // Execution was cancelled
  SKIPPED_OVERLAP = 'skipped_overlap', // Skipped due to overlap policy
  SKIPPED_BLACKOUT = 'skipped_blackout', // Skipped due to blackout window
  SKIPPED_QUOTA = 'skipped_quota', // Skipped due to quota
  SKIPPED_DISABLED = 'skipped_disabled', // Skipped because disabled
  SKIPPED_PAUSED = 'skipped_paused', // Skipped because paused
  SKIPPED_ERROR = 'skipped_error', // Skipped due to configuration error
  FAILED = 'failed', // Failed to trigger run
  CATCHUP = 'catchup', // Catchup execution
}

/**
 * Webhook trigger status.
 */
export enum WebhookTriggerStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/**
 * Event trigger source type.
 */
export enum EventTriggerSourceType {
  BOT_COMPLETED = 'bot_completed', // Another bot completed
  BOT_FAILED = 'bot_failed', // Another bot failed
  FILE_CREATED = 'file_created', // File created in watched path
  FILE_MODIFIED = 'file_modified', // File modified
  EMAIL_RECEIVED = 'email_received', // Email received
  QUEUE_MESSAGE = 'queue_message', // Message in queue
  CUSTOM = 'custom', // Custom event
}

// ============================================================================
// MAIN SCHEDULE ENTITY
// ============================================================================

/**
 * Schedule entity for automated bot execution.
 *
 * Enterprise features:
 * - Multiple trigger types (cron, interval, event, webhook)
 * - Timezone-aware scheduling with DST handling
 * - Blackout windows for maintenance periods
 * - Execution quotas and limits
 * - Overlap and catchup policies
 * - SLA tracking and alerting
 * - Audit trail and history
 * - Version pinning or auto-latest
 */
@Entity('schedules')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'botId'])
@Index(['tenantId', 'triggerType'])
@Index(['tenantId', 'nextRunAt'])
@Index(['status', 'nextRunAt'])
@Index(['tenantId', 'createdBy'])
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  // ============================================================================
  // BASIC INFO
  // ============================================================================

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, length: 1000 })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ScheduleStatus,
    default: ScheduleStatus.DRAFT,
  })
  status: ScheduleStatus;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  tags: string[];

  // ============================================================================
  // BOT CONFIGURATION
  // ============================================================================

  @Column()
  @Index()
  botId: string;

  @ManyToOne(() => Bot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'botId' })
  bot: Bot;

  @Column({ nullable: true })
  botVersionId: string | null; // null = use latest published

  @ManyToOne(() => BotVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'botVersionId' })
  botVersion: BotVersion | null;

  @Column({ default: false })
  useLatestVersion: boolean; // Auto-update to latest published version

  @Column({ default: false })
  useDraftVersion: boolean; // Use current draft (for testing)

  // ============================================================================
  // TRIGGER CONFIGURATION
  // ============================================================================

  @Column({
    type: 'enum',
    enum: ScheduleTriggerType,
    default: ScheduleTriggerType.CRON,
  })
  triggerType: ScheduleTriggerType;

  // Cron trigger
  @Column({ nullable: true, length: 100 })
  cronExpression: string | null; // 5-field cron: "0 9 * * 1-5"

  @Column({ default: 'UTC', length: 100 })
  timezone: string; // IANA timezone

  // Interval trigger
  @Column({ nullable: true })
  intervalMinutes: number | null; // For interval trigger

  @Column({ nullable: true })
  intervalStartTime: Date | null; // When to start interval counting

  // Calendar trigger
  @Column({ type: 'jsonb', nullable: true })
  calendarDates: {
    dates: string[]; // ISO date strings
    times: string[]; // HH:mm format
    excludeDates?: string[]; // Dates to exclude
  } | null;

  // Event trigger (defined in EventTrigger entity)
  @Column({ nullable: true })
  eventTriggerId: string | null;

  // Webhook trigger (defined in WebhookTrigger entity)
  @Column({ nullable: true })
  webhookTriggerId: string | null;

  // ============================================================================
  // RUNNER TARGETING
  // ============================================================================

  @Column({
    type: 'enum',
    enum: ScheduleTargetType,
    default: ScheduleTargetType.ANY,
  })
  targetType: ScheduleTargetType;

  @Column({ nullable: true })
  targetPoolId: string | null; // For POOL target

  @Column({ nullable: true })
  targetRunnerId: string | null; // For PINNED target

  @Column({ type: 'jsonb', nullable: true })
  targetCapabilities: string[] | null; // For CAPABILITY target

  @Column({ type: 'jsonb', nullable: true })
  targetLabels: Record<string, string> | null; // Label selector

  @Column({ default: 3 })
  runnerAcquireTimeoutSeconds: number; // Max wait for runner

  // ============================================================================
  // EXECUTION CONFIGURATION
  // ============================================================================

  @Column({
    type: 'enum',
    enum: SchedulePriority,
    default: SchedulePriority.NORMAL,
  })
  priority: SchedulePriority;

  @Column({ type: 'jsonb', nullable: true })
  inputs: Record<string, any> | null; // Default inputs for runs

  @Column({ type: 'jsonb', nullable: true })
  environmentOverrides: Record<string, string> | null; // Env var overrides

  @Column({ type: 'jsonb', nullable: true, default: [] })
  credentialIds: string[] | null; // Additional credentials

  @Column({ nullable: true })
  timeoutSeconds: number | null; // Override bot timeout

  @Column({ nullable: true })
  maxRetries: number | null; // Override bot retries

  // ============================================================================
  // OVERLAP & CONCURRENCY
  // ============================================================================

  @Column({
    type: 'enum',
    enum: ScheduleOverlapPolicy,
    default: ScheduleOverlapPolicy.SKIP,
  })
  overlapPolicy: ScheduleOverlapPolicy;

  @Column({ default: 1 })
  maxConcurrentRuns: number; // Max parallel executions

  @Column({ default: 0 })
  currentRunningCount: number; // Current active runs

  @Column({ type: 'jsonb', nullable: true, default: [] })
  activeRunIds: string[] | null; // IDs of currently running

  // ============================================================================
  // CATCHUP POLICY
  // ============================================================================

  @Column({
    type: 'enum',
    enum: ScheduleCatchupPolicy,
    default: ScheduleCatchupPolicy.NONE,
  })
  catchupPolicy: ScheduleCatchupPolicy;

  @Column({ default: 3600 }) // 1 hour
  catchupWindowSeconds: number; // Max time to catch up

  @Column({ default: 10 })
  maxCatchupRuns: number; // Max runs in catchup

  // ============================================================================
  // BLACKOUT WINDOWS
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  blackoutWindows: {
    windows: Array<{
      name: string;
      startTime: string; // HH:mm
      endTime: string; // HH:mm
      daysOfWeek?: number[]; // 0-6, 0=Sunday
      startDate?: string; // ISO date for one-time
      endDate?: string; // ISO date for one-time
      timezone?: string; // Override schedule timezone
      recurring?: boolean;
    }>;
  } | null;

  // ============================================================================
  // EXECUTION LIMITS & QUOTAS
  // ============================================================================

  @Column({ nullable: true })
  maxExecutionsPerHour: number | null;

  @Column({ nullable: true })
  maxExecutionsPerDay: number | null;

  @Column({ nullable: true })
  maxExecutionsPerWeek: number | null;

  @Column({ nullable: true })
  maxExecutionsPerMonth: number | null;

  @Column({ nullable: true })
  maxTotalExecutions: number | null; // Lifetime limit

  @Column({ type: 'bigint', default: 0 })
  executionsThisHour: number;

  @Column({ type: 'bigint', default: 0 })
  executionsThisDay: number;

  @Column({ type: 'bigint', default: 0 })
  executionsThisWeek: number;

  @Column({ type: 'bigint', default: 0 })
  executionsThisMonth: number;

  @Column({ type: 'bigint', default: 0 })
  totalExecutions: number;

  @Column({ nullable: true })
  quotaResetHour: Date | null;

  @Column({ nullable: true })
  quotaResetDay: Date | null;

  @Column({ nullable: true })
  quotaResetWeek: Date | null;

  @Column({ nullable: true })
  quotaResetMonth: Date | null;

  // ============================================================================
  // VALIDITY PERIOD
  // ============================================================================

  @Column({ nullable: true })
  effectiveFrom: Date | null; // Start date

  @Column({ nullable: true })
  effectiveUntil: Date | null; // End date

  @Column({ default: false })
  autoDisableOnExpiry: boolean;

  // ============================================================================
  // EXECUTION STATE
  // ============================================================================

  @Column({ nullable: true })
  @Index()
  nextRunAt: Date | null;

  @Column({ nullable: true })
  lastRunAt: Date | null;

  @Column({ nullable: true })
  lastRunId: string | null;

  @Column({ nullable: true })
  lastSuccessAt: Date | null;

  @Column({ nullable: true })
  lastSuccessRunId: string | null;

  @Column({ nullable: true })
  lastFailureAt: Date | null;

  @Column({ nullable: true })
  lastFailureRunId: string | null;

  @Column({ type: 'bigint', default: 0 })
  successCount: number;

  @Column({ type: 'bigint', default: 0 })
  failureCount: number;

  @Column({ type: 'bigint', default: 0 })
  skipCount: number;

  @Column({ type: 'float', default: 0 })
  avgDurationSeconds: number;

  @Column({ nullable: true })
  lastError: string | null;

  @Column({ default: 0 })
  consecutiveFailures: number;

  @Column({ default: 0 })
  consecutiveSkips: number;

  // ============================================================================
  // SLA & ALERTING
  // ============================================================================

  @Column({ nullable: true })
  slaMaxDurationSeconds: number | null; // SLA threshold

  @Column({ nullable: true })
  slaMaxFailureRate: number | null; // Max failure % (0-100)

  @Column({ default: false })
  alertOnFailure: boolean;

  @Column({ default: false })
  alertOnSlaViolation: boolean;

  @Column({ default: false })
  alertOnSkip: boolean;

  @Column({ default: 3 })
  alertAfterConsecutiveFailures: number;

  @Column({ type: 'jsonb', nullable: true })
  alertConfig: {
    channels: ('email' | 'slack' | 'teams' | 'webhook' | 'pagerduty')[];
    recipients?: string[];
    webhookUrl?: string;
    slackChannel?: string;
    teamsChannel?: string;
    pagerdutyKey?: string;
    cooldownMinutes?: number; // Min time between alerts
  } | null;

  @Column({ nullable: true })
  lastAlertAt: Date | null;

  // ============================================================================
  // AUTO-PAUSE ON FAILURE
  // ============================================================================

  @Column({ default: false })
  autoPauseOnFailure: boolean;

  @Column({ default: 5 })
  autoPauseAfterFailures: number;

  @Column({ default: false })
  autoResumeEnabled: boolean;

  @Column({ default: 3600 }) // 1 hour
  autoResumeAfterSeconds: number;

  @Column({ nullable: true })
  autoPausedAt: Date | null;

  @Column({ nullable: true })
  autoResumeAt: Date | null;

  // ============================================================================
  // OWNERSHIP & ACCESS
  // ============================================================================

  @Column()
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updatedBy' })
  updater: User | null;

  @Column({ nullable: true })
  ownerId: string | null; // Schedule owner

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User | null;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  sharedWithUserIds: string[] | null;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  sharedWithRoleIds: string[] | null;

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  notes: string | null; // Admin notes

  @Column({ nullable: true, length: 500 })
  pauseReason: string | null;

  @Column({ nullable: true, length: 500 })
  disableReason: string | null;

  // ============================================================================
  // DISTRIBUTED LOCKING
  // ============================================================================

  @Column({ nullable: true })
  lockId: string | null; // For distributed scheduling

  @Column({ nullable: true })
  lockAcquiredAt: Date | null;

  @Column({ nullable: true })
  lockExpiresAt: Date | null;

  @Column({ nullable: true })
  lockOwner: string | null; // Node ID that holds lock

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  activatedAt: Date | null;

  @Column({ nullable: true })
  pausedAt: Date | null;

  @Column({ nullable: true })
  disabledAt: Date | null;

  @Column({ nullable: true })
  archivedAt: Date | null;

  @Column({ nullable: true })
  deletedAt: Date | null;

  // ============================================================================
  // RELATIONS
  // ============================================================================

  @OneToMany(() => ScheduleExecution, (exec) => exec.schedule)
  executions: ScheduleExecution[];

  @OneToMany(() => EventTrigger, (trigger) => trigger.schedule)
  eventTriggers: EventTrigger[];

  @OneToMany(() => WebhookTrigger, (trigger) => trigger.schedule)
  webhookTriggers: WebhookTrigger[];
}

// ============================================================================
// SCHEDULE EXECUTION HISTORY
// ============================================================================

/**
 * Track every schedule trigger event for audit and debugging.
 */
@Entity('schedule_executions')
@Index(['scheduleId', 'triggeredAt'])
@Index(['scheduleId', 'status'])
@Index(['tenantId', 'triggeredAt'])
@Index(['runId'])
export class ScheduleExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  @Index()
  scheduleId: string;

  @ManyToOne(() => Schedule, (schedule) => schedule.executions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule: Schedule;

  @Column({
    type: 'enum',
    enum: ScheduleExecutionStatus,
  })
  status: ScheduleExecutionStatus;

  @Column({ nullable: true })
  runId: string | null; // If run was created

  @Column()
  scheduledAt: Date; // When it was supposed to run

  @Column()
  triggeredAt: Date; // When trigger was processed

  @Column({ nullable: true })
  runStartedAt: Date | null; // When run actually started

  @Column({ nullable: true })
  runCompletedAt: Date | null; // When run completed

  @Column({ nullable: true })
  durationMs: number | null;

  @Column({ nullable: true, length: 1000 })
  skipReason: string | null;

  @Column({ nullable: true, length: 2000 })
  errorMessage: string | null;

  @Column({ type: 'jsonb', nullable: true })
  triggerContext: {
    triggerType: ScheduleTriggerType;
    cronExpression?: string;
    eventId?: string;
    webhookId?: string;
    manualTriggeredBy?: string;
    catchup?: boolean;
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  runnerInfo: {
    runnerId: string;
    runnerName: string;
    poolId?: string;
  } | null;

  @Column({ nullable: true })
  botVersionId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  inputs: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}

// ============================================================================
// EVENT TRIGGER
// ============================================================================

/**
 * Event-based trigger configuration.
 * Triggers schedule when specific events occur.
 */
@Entity('event_triggers')
@Index(['tenantId', 'enabled'])
@Index(['sourceType'])
@Index(['scheduleId'])
export class EventTrigger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  @Column()
  scheduleId: string;

  @ManyToOne(() => Schedule, (schedule) => schedule.eventTriggers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule: Schedule;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, length: 500 })
  description: string | null;

  @Column({
    type: 'enum',
    enum: EventTriggerSourceType,
  })
  sourceType: EventTriggerSourceType;

  // Bot completion trigger
  @Column({ nullable: true })
  sourceBotId: string | null; // Bot to watch

  @Column({ type: 'jsonb', nullable: true })
  sourceStatusFilter: string[] | null; // e.g., ['succeeded', 'failed']

  // File watcher trigger
  @Column({ nullable: true, length: 1000 })
  watchPath: string | null;

  @Column({ type: 'jsonb', nullable: true })
  filePatterns: string[] | null; // Glob patterns

  // Queue trigger
  @Column({ nullable: true, length: 500 })
  queueName: string | null;

  @Column({ nullable: true, length: 500 })
  queueUrl: string | null;

  // Email trigger
  @Column({ nullable: true, length: 500 })
  emailAddress: string | null;

  @Column({ type: 'jsonb', nullable: true })
  emailFilters: {
    fromAddresses?: string[];
    subjectPatterns?: string[];
    hasAttachment?: boolean;
    attachmentPatterns?: string[];
  } | null;

  // Custom event
  @Column({ nullable: true, length: 200 })
  eventType: string | null;

  @Column({ type: 'jsonb', nullable: true })
  eventFilter: Record<string, any> | null; // JSON path filters

  // Debouncing
  @Column({ default: 0 })
  debounceSeconds: number; // Min time between triggers

  @Column({ nullable: true })
  lastTriggeredAt: Date | null;

  // Transformation
  @Column({ type: 'jsonb', nullable: true })
  inputMapping: Record<string, string> | null; // Map event data to inputs

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  disabledReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  createdBy: string;
}

// ============================================================================
// WEBHOOK TRIGGER
// ============================================================================

/**
 * Webhook-based trigger configuration.
 * External systems can trigger schedules via HTTP.
 */
@Entity('webhook_triggers')
@Index(['tenantId', 'status'])
@Index(['token'], { unique: true })
@Index(['scheduleId'])
export class WebhookTrigger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  @Column()
  scheduleId: string;

  @ManyToOne(() => Schedule, (schedule) => schedule.webhookTriggers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule: Schedule;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, length: 500 })
  description: string | null;

  // Authentication
  @Column({ length: 64, unique: true })
  token: string; // URL token for webhook

  @Column({ nullable: true })
  secret: string | null; // HMAC signing secret

  @Column({ default: false })
  requireSignature: boolean; // Require HMAC signature

  @Column({ type: 'jsonb', nullable: true })
  allowedIps: string[] | null; // IP whitelist

  @Column({ type: 'jsonb', nullable: true })
  requiredHeaders: Record<string, string> | null;

  @Column({
    type: 'enum',
    enum: WebhookTriggerStatus,
    default: WebhookTriggerStatus.ACTIVE,
  })
  status: WebhookTriggerStatus;

  // Rate limiting
  @Column({ nullable: true })
  maxCallsPerMinute: number | null;

  @Column({ nullable: true })
  maxCallsPerHour: number | null;

  @Column({ default: 0 })
  callsThisMinute: number;

  @Column({ default: 0 })
  callsThisHour: number;

  @Column({ nullable: true })
  rateLimitResetMinute: Date | null;

  @Column({ nullable: true })
  rateLimitResetHour: Date | null;

  // Payload handling
  @Column({ type: 'jsonb', nullable: true })
  inputMapping: Record<string, string> | null; // Map webhook payload to inputs

  @Column({ type: 'jsonb', nullable: true })
  payloadSchema: Record<string, any> | null; // JSON Schema for validation

  @Column({ default: false })
  validatePayload: boolean;

  // Validity
  @Column({ nullable: true })
  expiresAt: Date | null;

  @Column({ nullable: true })
  maxCalls: number | null; // Max total calls

  @Column({ type: 'bigint', default: 0 })
  totalCalls: number;

  // Stats
  @Column({ nullable: true })
  lastCalledAt: Date | null;

  @Column({ nullable: true })
  lastCallerIp: string | null;

  @Column({ type: 'bigint', default: 0 })
  successCount: number;

  @Column({ type: 'bigint', default: 0 })
  failureCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  createdBy: string;

  @Column({ nullable: true })
  revokedBy: string | null;

  @Column({ nullable: true })
  revokedAt: Date | null;

  @Column({ nullable: true, length: 500 })
  revokeReason: string | null;
}

// ============================================================================
// SCHEDULE CALENDAR ENTRY (for calendar-based scheduling)
// ============================================================================

/**
 * Individual calendar entries for complex scheduling.
 */
@Entity('schedule_calendar_entries')
@Index(['scheduleId', 'scheduledAt'])
@Index(['scheduleId', 'status'])
export class ScheduleCalendarEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  scheduleId: string;

  @ManyToOne(() => Schedule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule: Schedule;

  @Column()
  scheduledAt: Date;

  @Column({
    type: 'enum',
    enum: ScheduleExecutionStatus,
    default: ScheduleExecutionStatus.TRIGGERED,
  })
  status: ScheduleExecutionStatus;

  @Column({ nullable: true })
  runId: string | null;

  @Column({ nullable: true, length: 200 })
  label: string | null; // e.g., "Month-end processing"

  @Column({ nullable: true, length: 500 })
  notes: string | null;

  @Column({ type: 'jsonb', nullable: true })
  inputOverrides: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  createdBy: string;
}

// ============================================================================
// SCHEDULE GROUP (for organizing schedules)
// ============================================================================

/**
 * Group schedules for organization and bulk operations.
 */
@Entity('schedule_groups')
@Index(['tenantId', 'name'])
export class ScheduleGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, length: 500 })
  description: string | null;

  @Column({ nullable: true })
  color: string | null; // Hex color

  @Column({ nullable: true })
  iconUrl: string | null;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  scheduleIds: string[];

  // Bulk operations
  @Column({ default: false })
  isPaused: boolean; // Pause all schedules in group

  @Column({ type: 'jsonb', nullable: true })
  sharedBlackoutWindows: Schedule['blackoutWindows'] | null;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  createdBy: string;
}
