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

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Runner status enum.
 */
export enum RunnerStatus {
  ONLINE = 'online', // Available for jobs
  BUSY = 'busy', // Currently executing
  OFFLINE = 'offline', // Not responding
  MAINTENANCE = 'maintenance', // Under maintenance
  DRAINING = 'draining', // Finishing current jobs, no new ones
  STARTING = 'starting', // Starting up
  STOPPING = 'stopping', // Shutting down
  ERROR = 'error', // In error state
  DISABLED = 'disabled', // Administratively disabled
}

/**
 * Runner type enum.
 */
export enum RunnerType {
  STANDARD = 'standard', // Standard runner
  HIGH_MEMORY = 'high_memory', // High memory runner
  HIGH_CPU = 'high_cpu', // High CPU runner
  GPU = 'gpu', // GPU-enabled runner
  BROWSER = 'browser', // Browser automation optimized
  DESKTOP = 'desktop', // Desktop automation runner
  EDGE = 'edge', // Edge/on-premise runner
  SERVERLESS = 'serverless', // Serverless/ephemeral runner
}

/**
 * Runner deployment mode.
 */
export enum RunnerDeploymentMode {
  PERSISTENT = 'persistent', // Always running
  ON_DEMAND = 'on_demand', // Started when needed
  SCHEDULED = 'scheduled', // Runs on schedule
  AUTO_SCALE = 'auto_scale', // Part of auto-scaling group
}

// ============================================================================
// RUNNER ENTITY
// ============================================================================

/**
 * Runner entity for bot execution agents.
 *
 * Each runner represents a bot execution agent that can:
 * - Execute compiled bot packages
 * - Report progress and logs in real-time
 * - Handle multiple concurrent executions (based on capacity)
 * - Operate in different environments (cloud, on-premise, edge)
 *
 * Enterprise features:
 * - Capability-based routing
 * - Pool/group assignment
 * - Health monitoring
 * - Resource tracking
 * - BYOS (Bring Your Own Secrets) support
 * - Geo-location awareness
 */
@Entity('runners')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'poolId'])
@Index(['tenantId', 'type'])
@Index(['apiKeyHash'], { unique: true })
@Index(['status', 'lastHeartbeatAt'])
export class Runner {
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

  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({
    type: 'enum',
    enum: RunnerStatus,
    default: RunnerStatus.OFFLINE,
  })
  status: RunnerStatus;

  @Column({
    type: 'enum',
    enum: RunnerType,
    default: RunnerType.STANDARD,
  })
  type: RunnerType;

  @Column({
    type: 'enum',
    enum: RunnerDeploymentMode,
    default: RunnerDeploymentMode.PERSISTENT,
  })
  deploymentMode: RunnerDeploymentMode;

  // ============================================================================
  // POOL & GROUPING
  // ============================================================================

  @Column({ nullable: true })
  poolId: string;

  @ManyToOne('RunnerPool', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'poolId' })
  pool: any; // Using 'any' to avoid circular reference at initialization

  @Column({ type: 'jsonb', nullable: true, default: [] })
  tags: string[]; // For matching with job requirements

  @Column({ type: 'jsonb', nullable: true })
  labels: Record<string, string>; // Key-value labels

  // ============================================================================
  // CAPABILITIES
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true, default: [] })
  capabilities: string[]; // e.g., ['web.browser', 'desktop.automation', 'ai.llm']

  @Column({ type: 'jsonb', nullable: true })
  capabilityVersions: Record<string, string>; // e.g., { 'robotframework': '6.0', 'python': '3.10' }

  @Column({ type: 'jsonb', nullable: true, default: [] })
  supportedNodeTypes: string[]; // Node types this runner can execute

  // ============================================================================
  // CAPACITY
  // ============================================================================

  @Column({ default: 1 })
  maxConcurrentJobs: number;

  @Column({ default: 0 })
  currentJobs: number;

  @Column({ default: 1 })
  priority: number; // 1-10, higher = preferred for job assignment

  @Column({ default: 100 })
  weight: number; // For weighted round-robin scheduling

  // ============================================================================
  // HEALTH & HEARTBEAT
  // ============================================================================

  @Column({ nullable: true })
  lastHeartbeatAt: Date;

  @Column({ default: 30 }) // seconds
  heartbeatIntervalSeconds: number;

  @Column({ default: 90 }) // seconds before marking offline
  heartbeatTimeoutSeconds: number;

  @Column({ default: 0 })
  missedHeartbeats: number;

  @Column({ default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'float', default: 100 })
  healthScore: number; // 0-100, based on success rate and uptime

  @Column({ nullable: true })
  lastHealthCheckAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  healthStatus: {
    healthy: boolean;
    lastCheck: string;
    issues?: string[];
    metrics?: {
      cpuPercent?: number;
      memoryPercent?: number;
      diskPercent?: number;
      networkLatencyMs?: number;
    };
  };

  // ============================================================================
  // SYSTEM INFO
  // ============================================================================

  @Column({ nullable: true })
  hostname: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  publicIpAddress: string;

  @Column({ nullable: true })
  agentVersion: string;

  @Column({ type: 'jsonb', nullable: true })
  systemInfo: {
    os?: string;
    osVersion?: string;
    arch?: string;
    cpuModel?: string;
    cpuCount?: number;
    memoryTotalMb?: number;
    memoryAvailableMb?: number;
    diskTotalGb?: number;
    diskAvailableGb?: number;
    pythonVersion?: string;
    robotframeworkVersion?: string;
    browserVersions?: Record<string, string>;
  };

  @Column({ type: 'jsonb', nullable: true })
  networkInfo: {
    publicIp?: string;
    privateIp?: string;
    hostname?: string;
    domain?: string;
    dnsServers?: string[];
    proxy?: string;
  };

  // ============================================================================
  // LOCATION & ENVIRONMENT
  // ============================================================================

  @Column({ nullable: true })
  region: string; // Cloud region or data center

  @Column({ nullable: true })
  zone: string; // Availability zone

  @Column({ nullable: true })
  environment: string; // production, staging, development

  @Column({ type: 'jsonb', nullable: true })
  geoLocation: {
    country?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  };

  // ============================================================================
  // SECRETS CONFIGURATION (BYOS)
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  secretsConfig: {
    provider: 'azure-keyvault' | 'aws-secrets' | 'hashicorp-vault' | 'gcp-secrets' | 'env' | 'file';
    endpoint?: string;
    keyPrefix?: string;
    config: Record<string, any>;
  };

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  @Column({ nullable: true, unique: true })
  apiKeyHash: string; // SHA256 hash of API key

  @Column({ nullable: true })
  apiKeyPrefix: string; // First 8 chars for identification

  @Column({ nullable: true })
  apiKeyCreatedAt: Date;

  @Column({ nullable: true })
  apiKeyExpiresAt: Date;

  @Column({ nullable: true })
  lastAuthenticatedAt: Date;

  @Column({ nullable: true })
  lastAuthenticatedIp: string;

  // ============================================================================
  // STATISTICS
  // ============================================================================

  @Column({ type: 'bigint', default: 0 })
  totalJobsExecuted: number;

  @Column({ type: 'bigint', default: 0 })
  successfulJobs: number;

  @Column({ type: 'bigint', default: 0 })
  failedJobs: number;

  @Column({ type: 'float', default: 0 })
  avgJobDurationMs: number;

  @Column({ type: 'float', default: 100 })
  successRate: number; // Percentage

  @Column({ type: 'bigint', default: 0 })
  totalUptimeSeconds: number;

  @Column({ nullable: true })
  lastJobCompletedAt: Date;

  @Column({ nullable: true })
  currentJobId: string; // Currently executing run ID

  @Column({ nullable: true })
  currentJobStartedAt: Date;

  // ============================================================================
  // RESOURCE USAGE
  // ============================================================================

  @Column({ type: 'float', nullable: true })
  cpuUsagePercent: number;

  @Column({ type: 'float', nullable: true })
  memoryUsagePercent: number;

  @Column({ type: 'float', nullable: true })
  diskUsagePercent: number;

  @Column({ type: 'jsonb', nullable: true })
  resourceLimits: {
    maxCpuPercent?: number;
    maxMemoryMb?: number;
    maxDiskGb?: number;
    maxNetworkMbps?: number;
  };

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  config: {
    workDir?: string;
    tempDir?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    maxLogSizeMb?: number;
    cleanupAfterRun?: boolean;
    screenshotOnError?: boolean;
    maxRunDurationSeconds?: number;
    environmentVariables?: Record<string, string>;
  };

  @Column({ type: 'jsonb', nullable: true })
  featureFlags: Record<string, boolean>;

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true, length: 500 })
  notes: string;

  // ============================================================================
  // OWNERSHIP
  // ============================================================================

  @Column({ nullable: true })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ nullable: true })
  updatedBy: string;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  registeredAt: Date;

  @Column({ nullable: true })
  lastOnlineAt: Date;

  @Column({ nullable: true })
  disabledAt: Date;

  @Column({ nullable: true })
  disabledBy: string;

  @Column({ nullable: true, length: 500 })
  disabledReason: string;
}

// ============================================================================
// RUNNER POOL ENTITY
// ============================================================================

/**
 * Runner pool status enum.
 */
export enum RunnerPoolStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAINING = 'draining', // No new jobs, finishing current
}

/**
 * Runner pool entity for grouping runners.
 *
 * Pools allow logical grouping of runners for:
 * - Workload isolation
 * - Environment separation (prod, staging)
 * - Geo-distribution
 * - Auto-scaling management
 */
@Entity('runner_pools')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'name'], { unique: true })
export class RunnerPool {
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

  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({
    type: 'enum',
    enum: RunnerPoolStatus,
    default: RunnerPoolStatus.ACTIVE,
  })
  status: RunnerPoolStatus;

  // ============================================================================
  // SELECTION CRITERIA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  selector: {
    labels?: Record<string, string>; // Match runners with these labels
    tags?: string[]; // Match runners with these tags
    capabilities?: string[]; // Required capabilities
    types?: RunnerType[]; // Allowed runner types
    regions?: string[]; // Allowed regions
    environments?: string[]; // Allowed environments
  };

  // ============================================================================
  // CAPACITY
  // ============================================================================

  @Column({ default: 10 })
  minRunners: number;

  @Column({ default: 100 })
  maxRunners: number;

  @Column({ default: 5 })
  targetRunners: number; // For auto-scaling

  @Column({ default: 0 })
  currentRunners: number;

  @Column({ default: 100 })
  maxConcurrentJobs: number;

  @Column({ default: 0 })
  currentJobs: number;

  @Column({ default: 0 })
  queuedJobs: number;

  // ============================================================================
  // AUTO-SCALING
  // ============================================================================

  @Column({ default: false })
  autoScalingEnabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  autoScalingConfig: {
    scaleUpThreshold?: number; // Queue size to trigger scale up
    scaleDownThreshold?: number; // Idle time before scale down
    scaleUpCooldownSeconds?: number;
    scaleDownCooldownSeconds?: number;
    minIdleRunners?: number;
    maxScaleUpPerInterval?: number;
    maxScaleDownPerInterval?: number;
  };

  @Column({ nullable: true })
  lastScaleUpAt: Date;

  @Column({ nullable: true })
  lastScaleDownAt: Date;

  // ============================================================================
  // SCHEDULING
  // ============================================================================

  @Column({ default: 1 })
  priority: number; // Pool priority for job routing

  @Column({ type: 'jsonb', nullable: true })
  schedulingPolicy: {
    algorithm: 'round_robin' | 'least_loaded' | 'random' | 'weighted';
    stickySession?: boolean; // Route same bot to same runner
    maxRetries?: number;
    retryDelaySeconds?: number;
  };

  // ============================================================================
  // QUOTAS
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  quotas: {
    maxDailyJobs?: number;
    maxConcurrentJobsPerRunner?: number;
    maxJobDurationSeconds?: number;
    maxQueueSize?: number;
  };

  @Column({ default: 0 })
  dailyJobsExecuted: number;

  @Column({ nullable: true })
  quotaResetAt: Date;

  // ============================================================================
  // METADATA
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true, default: [] })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  labels: Record<string, string>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true, length: 500 })
  notes: string;

  // ============================================================================
  // OWNERSHIP
  // ============================================================================

  @Column({ nullable: true })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

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

  @OneToMany('Runner', 'pool')
  runners: Runner[];
}

// ============================================================================
// RUNNER HEARTBEAT ENTITY (for historical tracking)
// ============================================================================

/**
 * Runner heartbeat entity for monitoring history.
 *
 * Stores heartbeat history for:
 * - Uptime tracking
 * - Resource usage trends
 * - Health analysis
 */
@Entity('runner_heartbeats')
@Index(['runnerId', 'timestamp'])
@Index(['tenantId', 'timestamp'])
export class RunnerHeartbeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  runnerId: string;

  @ManyToOne(() => Runner, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runnerId' })
  runner: Runner;

  @Column()
  timestamp: Date;

  @Column({
    type: 'enum',
    enum: RunnerStatus,
  })
  status: RunnerStatus;

  @Column({ default: 0 })
  currentJobs: number;

  @Column({ type: 'float', nullable: true })
  cpuPercent: number;

  @Column({ type: 'float', nullable: true })
  memoryPercent: number;

  @Column({ type: 'float', nullable: true })
  diskPercent: number;

  @Column({ type: 'float', nullable: true })
  networkLatencyMs: number;

  @Column({ type: 'jsonb', nullable: true })
  metrics: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}

// ============================================================================
// RUNNER EVENT ENTITY
// ============================================================================

/**
 * Runner event type enum.
 */
export enum RunnerEventType {
  REGISTERED = 'registered',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  STATUS_CHANGED = 'status_changed',
  JOB_STARTED = 'job_started',
  JOB_COMPLETED = 'job_completed',
  JOB_FAILED = 'job_failed',
  HEALTH_CHECK = 'health_check',
  CONFIG_UPDATED = 'config_updated',
  ERROR = 'error',
  WARNING = 'warning',
  DISABLED = 'disabled',
  ENABLED = 'enabled',
  API_KEY_REGENERATED = 'api_key_regenerated',
}

/**
 * Runner event entity for audit trail.
 */
@Entity('runner_events')
@Index(['runnerId', 'timestamp'])
@Index(['tenantId', 'timestamp'])
@Index(['eventType'])
export class RunnerEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  runnerId: string;

  @ManyToOne(() => Runner, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runnerId' })
  runner: Runner;

  @Column({
    type: 'enum',
    enum: RunnerEventType,
  })
  eventType: RunnerEventType;

  @Column({ nullable: true, length: 2000 })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ nullable: true })
  previousStatus: string;

  @Column({ nullable: true })
  newStatus: string;

  @Column({ nullable: true })
  triggeredBy: string; // User ID or 'system'

  @Column({ nullable: true })
  ipAddress: string;

  @Column()
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;
}
