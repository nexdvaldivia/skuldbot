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
import { Runner } from '../../runners/entities/runner.entity';
import { User } from '../../users/entities/user.entity';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Run status enum with full lifecycle states.
 */
export enum RunStatus {
  // Initial states
  PENDING = 'pending', // Created but not yet queued
  QUEUED = 'queued', // In queue waiting for runner
  LEASED = 'leased', // Claimed by runner, not yet started

  // Active states
  RUNNING = 'running', // Currently executing
  PAUSED = 'paused', // Paused (HITL or manual)
  WAITING_APPROVAL = 'waiting_approval', // HITL: waiting for human approval

  // Retry states
  RETRYING = 'retrying', // Preparing for retry
  RETRY_SCHEDULED = 'retry_scheduled', // Waiting for retry delay

  // Terminal states
  SUCCEEDED = 'succeeded', // Completed successfully
  FAILED = 'failed', // Failed with error
  CANCELLED = 'cancelled', // Cancelled by user/system
  TIMED_OUT = 'timed_out', // Exceeded timeout
  REJECTED = 'rejected', // HITL: rejected by human
  SKIPPED = 'skipped', // Skipped (conditional execution)
}

/**
 * Run trigger type enum.
 */
export enum RunTriggerType {
  MANUAL = 'manual', // Triggered manually by user
  SCHEDULE = 'schedule', // Triggered by schedule/cron
  WEBHOOK = 'webhook', // Triggered by webhook
  API = 'api', // Triggered by API call
  RETRY = 'retry', // Automatic retry
  DEPENDENT = 'dependent', // Triggered by another run completion
  EVENT = 'event', // Triggered by system event
  PIPELINE = 'pipeline', // Part of a pipeline execution
}

/**
 * Run priority levels.
 */
export enum RunPriority {
  CRITICAL = 1, // System critical, immediate execution
  HIGH = 2, // High priority
  NORMAL = 3, // Standard priority
  LOW = 4, // Low priority, background
  BATCH = 5, // Batch processing, lowest priority
}

/**
 * HITL (Human In The Loop) action types.
 */
export enum HitlActionType {
  APPROVE = 'approve', // Approve and continue
  REJECT = 'reject', // Reject and stop
  MODIFY = 'modify', // Modify data and continue
  SKIP = 'skip', // Skip this step
  RETRY = 'retry', // Retry the step
  ESCALATE = 'escalate', // Escalate to higher authority
}

// ============================================================================
// RUN ENTITY
// ============================================================================

/**
 * Run entity for tracking bot executions.
 *
 * Each run represents a single execution of a bot version with:
 * - Full lifecycle tracking (queued → running → completed)
 * - Priority queue support
 * - Retry logic with exponential backoff
 * - HITL (Human In The Loop) support
 * - Resource tracking (CPU, memory, duration)
 * - Parent-child relationships for sub-bots
 * - Comprehensive audit trail
 *
 * Enterprise features:
 * - Multi-tenancy isolation
 * - Runner affinity and pools
 * - Timeout and resource limits
 * - Real-time event streaming
 * - Artifact management
 */
@Entity('runs')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'botId'])
@Index(['tenantId', 'priority', 'status', 'createdAt']) // For priority queue
@Index(['botVersionId', 'status'])
@Index(['parentRunId'])
@Index(['scheduleId'])
@Index(['runnerId', 'status'])
export class Run {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant ID from license */
  @Column()
  @Index()
  tenantId: string;

  // ============================================================================
  // BOT REFERENCE
  // ============================================================================

  @Column()
  botId: string;

  @ManyToOne(() => Bot, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'botId' })
  bot: Bot;

  @Column()
  botVersionId: string;

  @ManyToOne(() => BotVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'botVersionId' })
  botVersion: BotVersion;

  // Denormalized for query performance
  @Column({ nullable: true })
  botName: string;

  @Column({ nullable: true })
  botVersionLabel: string;

  // ============================================================================
  // RUNNER ASSIGNMENT
  // ============================================================================

  @Column({ nullable: true })
  runnerId: string;

  @ManyToOne(() => Runner, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'runnerId' })
  runner: Runner;

  @Column({ nullable: true })
  runnerPoolId: string; // Preferred pool

  @Column({ type: 'jsonb', nullable: true, default: [] })
  runnerTags: string[]; // Required runner tags

  @Column({ nullable: true })
  runnerName: string; // Denormalized for display

  // ============================================================================
  // STATUS & LIFECYCLE
  // ============================================================================

  @Column({
    type: 'enum',
    enum: RunStatus,
    default: RunStatus.PENDING,
  })
  status: RunStatus;

  @Column({
    type: 'enum',
    enum: RunPriority,
    default: RunPriority.NORMAL,
  })
  priority: RunPriority;

  @Column({
    type: 'enum',
    enum: RunTriggerType,
    default: RunTriggerType.MANUAL,
  })
  triggerType: RunTriggerType;

  @Column({ nullable: true })
  triggeredBy: string; // userId or system identifier

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'triggeredBy' })
  triggeredByUser: User;

  // ============================================================================
  // PARENT-CHILD (Sub-bots)
  // ============================================================================

  @Column({ nullable: true })
  parentRunId: string;

  @ManyToOne(() => Run, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parentRunId' })
  parentRun: Run;

  @OneToMany(() => Run, (run) => run.parentRun)
  childRuns: Run[];

  @Column({ default: 0 })
  depth: number; // Nesting level (0 = top-level)

  @Column({ nullable: true })
  rootRunId?: string; // Top-level parent for deep nesting

  // ============================================================================
  // SCHEDULE REFERENCE
  // ============================================================================

  @Column({ nullable: true })
  scheduleId: string;

  @Column({ nullable: true })
  scheduleExecutionId: string; // Specific schedule execution instance

  // ============================================================================
  // INPUTS & OUTPUTS
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  inputs: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  outputs: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, any> | null; // Runtime context (credentials resolved, etc.)

  // ============================================================================
  // EXECUTION PLAN
  // ============================================================================

  @Column({ nullable: true })
  planHash: string | null; // SHA256 of execution plan

  @Column({ nullable: true })
  policyPackVersion: string | null; // Policy pack used

  @Column({ default: 0 })
  totalSteps: number;

  @Column({ default: 0 })
  completedSteps: number;

  @Column({ default: 0 })
  failedSteps: number;

  @Column({ nullable: true })
  currentStepId: string; // For real-time tracking

  @Column({ nullable: true })
  currentNodeId: string;

  // ============================================================================
  // TIMEOUT & RETRY CONFIG
  // ============================================================================

  @Column({ default: 3600 }) // 1 hour
  timeoutSeconds: number;

  @Column({ default: 0 })
  maxRetries: number;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 60 }) // 1 minute
  retryDelaySeconds: number;

  @Column({ default: 2.0 }) // Exponential backoff multiplier
  retryBackoffMultiplier: number;

  @Column({ default: 3600 }) // Max 1 hour between retries
  retryMaxDelaySeconds: number;

  @Column({ nullable: true })
  nextRetryAt: Date;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  retryHistory: {
    attempt: number;
    status: string;
    error?: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  }[];

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @Column({ nullable: true })
  queuedAt: Date;

  @Column({ nullable: true })
  leasedAt: Date;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  pausedAt: Date;

  @Column({ nullable: true })
  resumedAt: Date;

  @Column({ nullable: true })
  cancelledAt: Date;

  @Column({ nullable: true })
  cancelledBy: string;

  @Column({ nullable: true })
  timeoutAt: Date; // When run will timeout

  // ============================================================================
  // DURATION & PERFORMANCE
  // ============================================================================

  @Column({ nullable: true })
  queueDurationMs: number; // Time in queue

  @Column({ nullable: true })
  executionDurationMs: number; // Actual execution time

  @Column({ nullable: true })
  totalDurationMs: number; // Total time from creation to completion

  // ============================================================================
  // RESOURCE USAGE
  // ============================================================================

  @Column({ type: 'float', nullable: true })
  peakMemoryMb: number;

  @Column({ type: 'float', nullable: true })
  avgCpuPercent: number;

  @Column({ type: 'bigint', default: 0 })
  networkBytesIn: number;

  @Column({ type: 'bigint', default: 0 })
  networkBytesOut: number;

  @Column({ type: 'bigint', default: 0 })
  storageReadBytes: number;

  @Column({ type: 'bigint', default: 0 })
  storageWriteBytes: number;

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  @Column({ nullable: true, length: 2000 })
  errorMessage: string | null;

  @Column({ nullable: true })
  errorCode: string;

  @Column({ nullable: true })
  errorNodeId: string;

  @Column({ nullable: true })
  errorStepId: string;

  @Column({ type: 'jsonb', nullable: true })
  errorDetails: {
    type?: string;
    stack?: string;
    nodeType?: string;
    retryable?: boolean;
    category?: string;
    resolution?: string;
  } | null;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  warnings: string[];

  // ============================================================================
  // HITL (Human In The Loop)
  // ============================================================================

  @Column({ default: false })
  requiresApproval: boolean;

  @Column({ nullable: true })
  approvalRequestedAt: Date;

  @Column({ nullable: true })
  approvalDeadline: Date;

  @Column({ type: 'jsonb', nullable: true })
  hitlConfig: {
    enabled: boolean;
    requiredFor?: string[]; // Node types requiring approval
    approvers?: string[]; // User IDs who can approve
    escalationAfterMinutes?: number;
    autoRejectAfterMinutes?: number;
    notifyChannels?: ('email' | 'slack' | 'teams' | 'webhook')[];
  };

  @Column({ type: 'jsonb', nullable: true })
  hitlState: {
    pendingApproval: boolean;
    stepId?: string;
    nodeId?: string;
    nodeType?: string;
    requestedAt?: string;
    requestedData?: Record<string, any>;
    approvedBy?: string;
    approvedAt?: string;
    rejectedBy?: string;
    rejectedAt?: string;
    action?: HitlActionType;
    comments?: string;
    modifiedData?: Record<string, any>;
  };

  @OneToMany(() => HitlRequest, (request) => request.run)
  hitlRequests: HitlRequest[];

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  notificationConfig: {
    onStart?: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'teams' | 'webhook')[];
      recipients?: string[];
    };
    onComplete?: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'teams' | 'webhook')[];
      recipients?: string[];
    };
    onFailure?: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'teams' | 'webhook')[];
      recipients?: string[];
    };
    onHitl?: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'teams' | 'webhook')[];
      recipients?: string[];
    };
  };

  @Column({ type: 'jsonb', nullable: true, default: [] })
  notificationsSent: {
    type: string;
    channel: string;
    sentAt: string;
    recipient?: string;
    status: 'sent' | 'failed';
    error?: string;
  }[];

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true, default: [] })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  labels: Record<string, string>; // Key-value labels for filtering

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true, length: 500 })
  notes: string; // User notes about this run

  // ============================================================================
  // BILLING & METERING
  // ============================================================================

  @Column({ default: false })
  billable: boolean;

  @Column({ type: 'float', default: 0 })
  computeUnits: number; // Billing units consumed

  @Column({ nullable: true })
  billingCategory: string; // For cost allocation

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ============================================================================
  // RELATIONS
  // ============================================================================

  @OneToMany(() => RunEvent, (event) => event.run)
  events: RunEvent[];

  @OneToMany(() => RunArtifact, (artifact) => artifact.run)
  artifacts: RunArtifact[];

  @OneToMany(() => RunLog, (log) => log.run)
  logs: RunLog[];
}

// ============================================================================
// RUN EVENT ENTITY
// ============================================================================

/**
 * Run event types for detailed execution tracking.
 */
export enum RunEventType {
  // Lifecycle events
  RUN_QUEUED = 'run_queued',
  RUN_LEASED = 'run_leased',
  RUN_STARTED = 'run_started',
  RUN_PAUSED = 'run_paused',
  RUN_RESUMED = 'run_resumed',
  RUN_COMPLETED = 'run_completed',
  RUN_FAILED = 'run_failed',
  RUN_CANCELLED = 'run_cancelled',
  RUN_TIMED_OUT = 'run_timed_out',

  // Step events
  STEP_START = 'step_start',
  STEP_END = 'step_end',
  STEP_RETRY = 'step_retry',
  STEP_ERROR = 'step_error',
  STEP_SKIPPED = 'step_skipped',

  // Control flow events
  CONTROL_BRANCH = 'control_branch',
  CONTROL_LOOP_START = 'control_loop_start',
  CONTROL_LOOP_ITER = 'control_loop_iter',
  CONTROL_LOOP_END = 'control_loop_end',
  CONTROL_BREAK = 'control_break',
  CONTROL_CONTINUE = 'control_continue',

  // HITL events
  HITL_REQUESTED = 'hitl_requested',
  HITL_APPROVED = 'hitl_approved',
  HITL_REJECTED = 'hitl_rejected',
  HITL_MODIFIED = 'hitl_modified',
  HITL_ESCALATED = 'hitl_escalated',
  HITL_TIMEOUT = 'hitl_timeout',

  // Resource events
  RESOURCE_ACQUIRED = 'resource_acquired',
  RESOURCE_RELEASED = 'resource_released',
  RESOURCE_TIMEOUT = 'resource_timeout',

  // External events
  WEBHOOK_SENT = 'webhook_sent',
  WEBHOOK_RESPONSE = 'webhook_response',
  API_CALL = 'api_call',
  API_RESPONSE = 'api_response',

  // Data events
  DATA_READ = 'data_read',
  DATA_WRITE = 'data_write',
  DATA_TRANSFORM = 'data_transform',

  // Custom events
  CUSTOM = 'custom',
  LOG = 'log',
  METRIC = 'metric',
  CHECKPOINT = 'checkpoint',
}

/**
 * Event severity levels.
 */
export enum EventSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Run event entity for detailed execution timeline.
 *
 * Captures every significant event during run execution:
 * - Step start/end with duration
 * - Control flow decisions
 * - HITL interactions
 * - Errors and retries
 * - Resource usage snapshots
 */
@Entity('run_events')
@Index(['runId', 'createdAt'])
@Index(['runId', 'eventType'])
@Index(['runId', 'stepId'])
@Index(['runId', 'nodeId'])
@Index(['tenantId', 'createdAt'])
export class RunEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  runId: string;

  @ManyToOne(() => Run, (run) => run.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: Run;

  // ============================================================================
  // EVENT INFO
  // ============================================================================

  @Column({
    type: 'enum',
    enum: RunEventType,
  })
  eventType: RunEventType;

  @Column({
    type: 'enum',
    enum: EventSeverity,
    default: EventSeverity.INFO,
  })
  severity: EventSeverity;

  @Column({ nullable: true })
  stepId: string;

  @Column({ nullable: true })
  nodeId: string;

  @Column({ nullable: true })
  nodeType: string;

  @Column({ nullable: true })
  nodeLabel: string;

  // ============================================================================
  // STATUS & RESULT
  // ============================================================================

  @Column({ nullable: true })
  status: string; // success, error, skipped, etc.

  @Column({ nullable: true })
  durationMs: number;

  @Column({ nullable: true, length: 2000 })
  message: string;

  // ============================================================================
  // DATA (with sensitivity classification)
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any>; // Event-specific data

  @Column({ type: 'jsonb', nullable: true })
  inputSnapshot: Record<string, any>; // Input to step (redacted)

  @Column({ type: 'jsonb', nullable: true })
  outputSnapshot: Record<string, any>; // Output from step (redacted)

  @Column({ type: 'jsonb', nullable: true })
  classification: {
    in: string; // Data classification of inputs
    out: string; // Data classification of outputs
  };

  @Column({ type: 'jsonb', nullable: true, default: [] })
  controlsApplied: string[]; // Security controls applied

  // ============================================================================
  // ERROR INFO
  // ============================================================================

  @Column({ nullable: true })
  errorCode: string;

  @Column({ nullable: true, length: 2000 })
  errorMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  errorStack: string[];

  // ============================================================================
  // RESOURCE SNAPSHOT
  // ============================================================================

  @Column({ type: 'float', nullable: true })
  memoryMb: number;

  @Column({ type: 'float', nullable: true })
  cpuPercent: number;

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  correlationId: string; // For distributed tracing

  @Column({ nullable: true })
  spanId: string; // OpenTelemetry span ID

  // ============================================================================
  // TIMESTAMP
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  timestamp: Date; // Actual event time (may differ from createdAt)
}

// ============================================================================
// RUN LOG ENTITY
// ============================================================================

/**
 * Log level enum.
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Run log entity for detailed execution logs.
 *
 * Stores all log output from bot execution, separate from events
 * for efficient querying and retention policies.
 */
@Entity('run_logs')
@Index(['runId', 'createdAt'])
@Index(['runId', 'level'])
@Index(['tenantId', 'createdAt'])
export class RunLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  runId: string;

  @ManyToOne(() => Run, (run) => run.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: Run;

  @Column({
    type: 'enum',
    enum: LogLevel,
    default: LogLevel.INFO,
  })
  level: LogLevel;

  @Column({ nullable: true })
  stepId: string;

  @Column({ nullable: true })
  nodeId: string;

  @Column({ nullable: true })
  source: string; // Component that generated the log

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>; // Structured log data

  @Column({ nullable: true })
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ============================================================================
// RUN ARTIFACT ENTITY
// ============================================================================

/**
 * Artifact type enum.
 */
export enum ArtifactType {
  OUTPUT = 'output', // Bot output file
  SCREENSHOT = 'screenshot', // Screen capture
  LOG = 'log', // Log file
  REPORT = 'report', // Generated report
  DATA = 'data', // Data export
  TEMP = 'temp', // Temporary file
  DOWNLOAD = 'download', // Downloaded file
  UPLOAD = 'upload', // Uploaded file
  OTHER = 'other',
}

/**
 * Run artifact entity for file storage.
 *
 * Manages all files produced during run execution:
 * - Screenshots and screen recordings
 * - Downloaded/uploaded files
 * - Generated reports
 * - Log exports
 *
 * Features:
 * - S3-compatible storage backend
 * - Encryption at rest
 * - Checksum verification
 * - Retention policies
 */
@Entity('run_artifacts')
@Index(['runId'])
@Index(['runId', 'type'])
@Index(['tenantId', 'createdAt'])
export class RunArtifact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  runId: string;

  @ManyToOne(() => Run, (run) => run.artifacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: Run;

  // ============================================================================
  // FILE INFO
  // ============================================================================

  @Column()
  name: string;

  @Column({ nullable: true })
  originalName: string; // Original filename if different

  @Column({
    type: 'enum',
    enum: ArtifactType,
    default: ArtifactType.OTHER,
  })
  type: ArtifactType;

  @Column()
  mimeType: string;

  @Column({ type: 'bigint' })
  sizeBytes: number;

  // ============================================================================
  // STORAGE
  // ============================================================================

  @Column()
  storageKey: string; // Path in storage (S3, Azure, etc.)

  @Column({ nullable: true })
  storageBucket: string;

  @Column({ nullable: true })
  storageRegion: string;

  @Column({ nullable: true })
  storageProvider: string; // s3, azure, gcs, local

  // ============================================================================
  // SECURITY
  // ============================================================================

  @Column({ nullable: true })
  checksum: string; // SHA256

  @Column({ nullable: true })
  checksumAlgorithm: string;

  @Column({ default: false })
  encrypted: boolean;

  @Column({ nullable: true })
  encryptionKeyId: string;

  @Column({ nullable: true })
  classification: string; // Data classification level

  // ============================================================================
  // CONTEXT
  // ============================================================================

  @Column({ nullable: true })
  stepId: string;

  @Column({ nullable: true })
  nodeId: string;

  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // ============================================================================
  // RETENTION
  // ============================================================================

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ default: false })
  permanent: boolean; // Exempt from retention policy

  @Column({ nullable: true })
  deletedAt: Date; // Soft delete

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// ============================================================================
// HITL REQUEST ENTITY
// ============================================================================

/**
 * HITL request status enum.
 */
export enum HitlRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
  ESCALATED = 'escalated',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * HITL (Human In The Loop) request entity.
 *
 * Tracks all human intervention requests during bot execution:
 * - Approval requests for sensitive operations
 * - Data verification requests
 * - Error resolution requests
 *
 * Features:
 * - Deadline and escalation support
 * - Audit trail of all decisions
 * - Multi-approver workflows
 * - Comment threads
 */
@Entity('hitl_requests')
@Index(['runId'])
@Index(['tenantId', 'status'])
@Index(['assignedTo', 'status'])
@Index(['tenantId', 'createdAt'])
export class HitlRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  runId: string;

  @ManyToOne(() => Run, (run) => run.hitlRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: Run;

  // ============================================================================
  // REQUEST INFO
  // ============================================================================

  @Column({
    type: 'enum',
    enum: HitlRequestStatus,
    default: HitlRequestStatus.PENDING,
  })
  status: HitlRequestStatus;

  @Column()
  stepId: string;

  @Column()
  nodeId: string;

  @Column({ nullable: true })
  nodeType: string;

  @Column({ nullable: true })
  nodeLabel: string;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: EventSeverity,
    default: EventSeverity.INFO,
  })
  urgency: EventSeverity;

  // ============================================================================
  // DATA FOR REVIEW
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  requestData: Record<string, any>; // Data requiring approval

  @Column({ type: 'jsonb', nullable: true })
  contextData: Record<string, any>; // Additional context

  @Column({ type: 'jsonb', nullable: true, default: [] })
  allowedActions: HitlActionType[];

  @Column({ default: false })
  dataModificationAllowed: boolean;

  // ============================================================================
  // ASSIGNMENT
  // ============================================================================

  @Column({ nullable: true })
  assignedTo: string; // User ID

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignedTo' })
  assignee: User;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  approverIds: string[]; // Allowed approvers

  @Column({ nullable: true })
  escalatedTo: string;

  @Column({ nullable: true })
  escalatedAt: Date;

  // ============================================================================
  // DEADLINE
  // ============================================================================

  @Column({ nullable: true })
  deadline: Date;

  @Column({ nullable: true })
  escalationDeadline: Date;

  @Column({ default: false })
  autoExpire: boolean;

  // ============================================================================
  // RESOLUTION
  // ============================================================================

  @Column({
    type: 'enum',
    enum: HitlActionType,
    nullable: true,
  })
  action: HitlActionType;

  @Column({ nullable: true })
  resolvedBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolvedBy' })
  resolver: User;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ type: 'text', nullable: true })
  resolutionComments: string;

  @Column({ type: 'jsonb', nullable: true })
  modifiedData: Record<string, any>; // Modified data if action=modify

  // ============================================================================
  // AUDIT TRAIL
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true, default: [] })
  auditTrail: {
    action: string;
    userId?: string;
    timestamp: string;
    comments?: string;
    data?: Record<string, any>;
  }[];

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true, default: [] })
  notificationsSent: {
    type: string;
    channel: string;
    sentAt: string;
    recipient?: string;
  }[];

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
}
