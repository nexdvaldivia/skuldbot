import {
  IsString,
  IsOptional,
  IsObject,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsArray,
  IsInt,
  IsDate,
  Min,
  Max,
  ValidateNested,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  RunStatus,
  RunTriggerType,
  RunPriority,
  RunEventType,
  EventSeverity,
  LogLevel,
  ArtifactType,
  HitlActionType,
  HitlRequestStatus,
} from '../entities/run.entity';

// ============================================================================
// NESTED DTOs
// ============================================================================

/**
 * HITL configuration DTO.
 */
export class HitlConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFor?: string[]; // Node types requiring approval

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  approvers?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080) // Max 1 week
  escalationAfterMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  autoRejectAfterMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(['email', 'slack', 'teams', 'webhook'], { each: true })
  notifyChannels?: ('email' | 'slack' | 'teams' | 'webhook')[];
}

/**
 * Notification channel config DTO.
 */
export class NotificationChannelConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @IsEnum(['email', 'slack', 'teams', 'webhook'], { each: true })
  channels: ('email' | 'slack' | 'teams' | 'webhook')[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];
}

/**
 * Run notification config DTO.
 */
export class RunNotificationConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelConfigDto)
  onStart?: NotificationChannelConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelConfigDto)
  onComplete?: NotificationChannelConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelConfigDto)
  onFailure?: NotificationChannelConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelConfigDto)
  onHitl?: NotificationChannelConfigDto;
}

/**
 * Retry configuration DTO.
 */
export class RetryConfigDto {
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400) // Max 24 hours
  retryDelaySeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  backoffMultiplier?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  maxDelaySeconds?: number;
}

// ============================================================================
// CREATE RUN DTO
// ============================================================================

/**
 * DTO for creating a new run.
 */
export class CreateRunDto {
  @IsUUID()
  botId: string;

  @IsOptional()
  @IsUUID()
  versionId?: string; // If not provided, uses latest published version

  @IsOptional()
  @IsEnum(RunTriggerType)
  triggerType?: RunTriggerType;

  @IsOptional()
  @IsEnum(RunPriority)
  priority?: RunPriority;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>;

  @IsOptional()
  @IsString()
  triggeredBy?: string;

  // Runner preferences
  @IsOptional()
  @IsUUID()
  preferredRunnerId?: string;

  @IsOptional()
  @IsString()
  runnerPoolId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  runnerTags?: string[];

  // Timeout & retry
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400) // Max 24 hours
  timeoutSeconds?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => RetryConfigDto)
  retry?: RetryConfigDto;

  // HITL
  @IsOptional()
  @ValidateNested()
  @Type(() => HitlConfigDto)
  hitlConfig?: HitlConfigDto;

  // Notifications
  @IsOptional()
  @ValidateNested()
  @Type(() => RunNotificationConfigDto)
  notifications?: RunNotificationConfigDto;

  // Parent run (for sub-bots)
  @IsOptional()
  @IsUUID()
  parentRunId?: string;

  // Schedule reference
  @IsOptional()
  @IsUUID()
  scheduleId?: string;

  @IsOptional()
  @IsString()
  scheduleExecutionId?: string;

  // Metadata
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // Billing
  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @IsOptional()
  @IsString()
  billingCategory?: string;
}

// ============================================================================
// CANCEL RUN DTO
// ============================================================================

/**
 * DTO for cancelling a run.
 */
export class CancelRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  cancelChildRuns?: boolean; // Also cancel child runs
}

// ============================================================================
// PAUSE/RESUME RUN DTOs
// ============================================================================

/**
 * DTO for pausing a run.
 */
export class PauseRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * DTO for resuming a paused run.
 */
export class ResumeRunDto {
  @IsOptional()
  @IsObject()
  modifiedInputs?: Record<string, any>; // Allow input modification on resume
}

// ============================================================================
// RETRY RUN DTO
// ============================================================================

/**
 * DTO for manually retrying a failed run.
 */
export class RetryRunDto {
  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>; // Override inputs for retry

  @IsOptional()
  @IsBoolean()
  fromFailedStep?: boolean; // Retry from the failed step

  @IsOptional()
  @IsEnum(RunPriority)
  priority?: RunPriority;
}

// ============================================================================
// HITL ACTION DTOs
// ============================================================================

/**
 * DTO for HITL approval/rejection.
 */
export class HitlActionDto {
  @IsEnum(HitlActionType)
  action: HitlActionType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;

  @IsOptional()
  @IsObject()
  modifiedData?: Record<string, any>; // For MODIFY action
}

/**
 * DTO for creating a HITL request.
 */
export class CreateHitlRequestDto {
  @IsString()
  stepId: string;

  @IsString()
  nodeId: string;

  @IsOptional()
  @IsString()
  nodeType?: string;

  @IsOptional()
  @IsString()
  nodeLabel?: string;

  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(EventSeverity)
  urgency?: EventSeverity;

  @IsOptional()
  @IsObject()
  requestData?: Record<string, any>;

  @IsOptional()
  @IsObject()
  contextData?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsEnum(HitlActionType, { each: true })
  allowedActions?: HitlActionType[];

  @IsOptional()
  @IsBoolean()
  dataModificationAllowed?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  approverIds?: string[];

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsBoolean()
  autoExpire?: boolean;
}

// ============================================================================
// QUERY DTOs
// ============================================================================

/**
 * DTO for querying runs.
 */
export class ListRunsQueryDto {
  // Pagination
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;

  // Filters
  @IsOptional()
  @IsUUID()
  botId?: string;

  @IsOptional()
  @IsUUID()
  versionId?: string;

  @IsOptional()
  @IsEnum(RunStatus)
  status?: RunStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(RunStatus, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  statuses?: RunStatus[];

  @IsOptional()
  @IsEnum(RunTriggerType)
  triggerType?: RunTriggerType;

  @IsOptional()
  @IsEnum(RunPriority)
  priority?: RunPriority;

  @IsOptional()
  @IsUUID()
  runnerId?: string;

  @IsOptional()
  @IsString()
  runnerPoolId?: string;

  @IsOptional()
  @IsUUID()
  scheduleId?: string;

  @IsOptional()
  @IsUUID()
  parentRunId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  topLevelOnly?: boolean; // Exclude child runs

  @IsOptional()
  @IsUUID()
  triggeredBy?: string;

  // Date range
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // Tags & labels
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  tags?: string[];

  @IsOptional()
  @IsString()
  labelKey?: string;

  @IsOptional()
  @IsString()
  labelValue?: string;

  // Search
  @IsOptional()
  @IsString()
  search?: string; // Search in bot name, notes

  // Sort
  @IsOptional()
  @IsEnum(['createdAt', 'startedAt', 'completedAt', 'priority', 'status', 'totalDurationMs'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  // Includes
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeBot?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeRunner?: boolean;
}

/**
 * DTO for querying run events.
 */
export class ListRunEventsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 100;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;

  @IsOptional()
  @IsEnum(RunEventType)
  eventType?: RunEventType;

  @IsOptional()
  @IsArray()
  @IsEnum(RunEventType, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  eventTypes?: RunEventType[];

  @IsOptional()
  @IsEnum(EventSeverity)
  severity?: EventSeverity;

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * DTO for querying run logs.
 */
export class ListRunLogsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 1000;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;

  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;

  @IsOptional()
  @IsArray()
  @IsEnum(LogLevel, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  levels?: LogLevel[];

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  search?: string; // Search in message

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * DTO for querying HITL requests.
 */
export class ListHitlRequestsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;

  @IsOptional()
  @IsUUID()
  runId?: string;

  @IsOptional()
  @IsEnum(HitlRequestStatus)
  status?: HitlRequestStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(HitlRequestStatus, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  statuses?: HitlRequestStatus[];

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  assignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  overdueOnly?: boolean;

  @IsOptional()
  @IsEnum(EventSeverity)
  urgency?: EventSeverity;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Run summary response DTO.
 */
export class RunSummaryDto {
  id: string;
  tenantId: string;
  botId: string;
  botVersionId: string;
  botName?: string;
  botVersionLabel?: string;
  status: RunStatus;
  priority: RunPriority;
  triggerType: RunTriggerType;
  triggeredBy?: string;
  runnerId?: string;
  runnerName?: string;
  parentRunId?: string;
  scheduleId?: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  totalDurationMs?: number;
  errorMessage?: string;
  requiresApproval: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Full run detail response DTO.
 */
export class RunDetailDto extends RunSummaryDto {
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  context?: Record<string, any>;
  planHash?: string;
  policyPackVersion?: string;
  currentStepId?: string;
  currentNodeId?: string;
  timeoutSeconds: number;
  maxRetries: number;
  retryCount: number;
  nextRetryAt?: string;
  retryHistory?: {
    attempt: number;
    status: string;
    error?: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  }[];
  leasedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  timeoutAt?: string;
  queueDurationMs?: number;
  executionDurationMs?: number;
  peakMemoryMb?: number;
  avgCpuPercent?: number;
  networkBytesIn: number;
  networkBytesOut: number;
  storageReadBytes: number;
  storageWriteBytes: number;
  errorCode?: string;
  errorNodeId?: string;
  errorStepId?: string;
  errorDetails?: {
    type?: string;
    stack?: string;
    nodeType?: string;
    retryable?: boolean;
    category?: string;
    resolution?: string;
  };
  warnings: string[];
  hitlConfig?: HitlConfigDto;
  hitlState?: {
    pendingApproval: boolean;
    stepId?: string;
    nodeId?: string;
    nodeType?: string;
    requestedAt?: string;
    action?: HitlActionType;
    comments?: string;
  };
  notificationConfig?: RunNotificationConfigDto;
  notificationsSent?: {
    type: string;
    channel: string;
    sentAt: string;
    recipient?: string;
    status: 'sent' | 'failed';
  }[];
  labels?: Record<string, string>;
  metadata?: Record<string, any>;
  notes?: string;
  billable: boolean;
  computeUnits: number;
  billingCategory?: string;
  depth: number;
  rootRunId?: string;
  runnerPoolId?: string;
  runnerTags: string[];
  childRunCount?: number;
  eventCount?: number;
  artifactCount?: number;
}

/**
 * Run event response DTO.
 */
export class RunEventDto {
  id: string;
  runId: string;
  eventType: RunEventType;
  severity: EventSeverity;
  stepId?: string;
  nodeId?: string;
  nodeType?: string;
  nodeLabel?: string;
  status?: string;
  durationMs?: number;
  message?: string;
  payload?: Record<string, any>;
  inputSnapshot?: Record<string, any>;
  outputSnapshot?: Record<string, any>;
  classification?: {
    in: string;
    out: string;
  };
  controlsApplied?: string[];
  errorCode?: string;
  errorMessage?: string;
  memoryMb?: number;
  cpuPercent?: number;
  correlationId?: string;
  spanId?: string;
  timestamp?: string;
  createdAt: string;
}

/**
 * Run log response DTO.
 */
export class RunLogDto {
  id: string;
  runId: string;
  level: LogLevel;
  stepId?: string;
  nodeId?: string;
  source?: string;
  message: string;
  data?: Record<string, any>;
  timestamp?: string;
  createdAt: string;
}

/**
 * Run artifact response DTO.
 */
export class RunArtifactDto {
  id: string;
  runId: string;
  name: string;
  originalName?: string;
  type: ArtifactType;
  mimeType: string;
  sizeBytes: number;
  stepId?: string;
  nodeId?: string;
  description?: string;
  tags: string[];
  encrypted: boolean;
  classification?: string;
  checksum?: string;
  expiresAt?: string;
  permanent: boolean;
  downloadUrl?: string; // Signed URL for download
  createdAt: string;
  updatedAt: string;
}

/**
 * HITL request response DTO.
 */
export class HitlRequestDto {
  id: string;
  runId: string;
  status: HitlRequestStatus;
  stepId: string;
  nodeId: string;
  nodeType?: string;
  nodeLabel?: string;
  title: string;
  description?: string;
  urgency: EventSeverity;
  requestData?: Record<string, any>;
  contextData?: Record<string, any>;
  allowedActions: HitlActionType[];
  dataModificationAllowed: boolean;
  assignedTo?: string;
  assigneeName?: string;
  approverIds: string[];
  escalatedTo?: string;
  escalatedAt?: string;
  deadline?: string;
  escalationDeadline?: string;
  autoExpire: boolean;
  action?: HitlActionType;
  resolvedBy?: string;
  resolverName?: string;
  resolvedAt?: string;
  resolutionComments?: string;
  modifiedData?: Record<string, any>;
  auditTrail?: {
    action: string;
    userId?: string;
    timestamp: string;
    comments?: string;
  }[];
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PAGINATED RESPONSE DTOs
// ============================================================================

/**
 * Paginated runs response DTO.
 */
export class PaginatedRunsDto {
  runs: RunSummaryDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated run events response DTO.
 */
export class PaginatedRunEventsDto {
  events: RunEventDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated run logs response DTO.
 */
export class PaginatedRunLogsDto {
  logs: RunLogDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated HITL requests response DTO.
 */
export class PaginatedHitlRequestsDto {
  requests: HitlRequestDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// STATS DTOs
// ============================================================================

/**
 * Run statistics response DTO.
 */
export class RunStatsDto {
  // Counts by status
  total: number;
  pending: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  timedOut: number;
  waitingApproval: number;

  // Performance
  avgQueueDurationMs?: number;
  avgExecutionDurationMs?: number;
  avgTotalDurationMs?: number;
  p50DurationMs?: number;
  p95DurationMs?: number;
  p99DurationMs?: number;

  // Success rate
  successRate?: number; // Percentage

  // Resource usage
  totalComputeUnits?: number;
  avgMemoryMb?: number;
  avgCpuPercent?: number;

  // Time range
  periodStart?: string;
  periodEnd?: string;
}

/**
 * Run timeline stats DTO.
 */
export class RunTimelineStatsDto {
  period: string; // hour, day, week
  data: {
    timestamp: string;
    total: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    avgDurationMs?: number;
  }[];
}

/**
 * Bot run stats DTO.
 */
export class BotRunStatsDto {
  botId: string;
  botName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs?: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
}

// ============================================================================
// INTERNAL/PROCESSOR DTOs
// ============================================================================

/**
 * DTO for run execution job data.
 */
export class ExecuteRunJobDto {
  runId: string;
  tenantId: string;
  botId: string;
  botVersionId: string;
  planHash?: string;
  policyPackVersion?: string;
  priority: RunPriority;
  timeoutSeconds: number;
  inputs?: Record<string, any>;
  context?: Record<string, any>;
  retryCount: number;
  maxRetries: number;
}

/**
 * DTO for updating run progress (from runner).
 */
export class UpdateRunProgressDto {
  @IsOptional()
  @IsEnum(RunStatus)
  status?: RunStatus;

  @IsOptional()
  @IsString()
  currentStepId?: string;

  @IsOptional()
  @IsString()
  currentNodeId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedSteps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  failedSteps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  memoryMb?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuPercent?: number;

  @IsOptional()
  @IsObject()
  outputs?: Record<string, any>; // Partial outputs
}

/**
 * DTO for completing a run (from runner).
 */
export class CompleteRunDto {
  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsObject()
  outputs?: Record<string, any>;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  errorNodeId?: string;

  @IsOptional()
  @IsString()
  errorStepId?: string;

  @IsOptional()
  @IsObject()
  errorDetails?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  peakMemoryMb?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  avgCpuPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  networkBytesIn?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  networkBytesOut?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  storageReadBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  storageWriteBytes?: number;
}

/**
 * DTO for adding a run event.
 */
export class AddRunEventDto {
  @IsEnum(RunEventType)
  eventType: RunEventType;

  @IsOptional()
  @IsEnum(EventSeverity)
  severity?: EventSeverity;

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  nodeType?: string;

  @IsOptional()
  @IsString()
  nodeLabel?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @IsOptional()
  @IsObject()
  inputSnapshot?: Record<string, any>;

  @IsOptional()
  @IsObject()
  outputSnapshot?: Record<string, any>;

  @IsOptional()
  @IsObject()
  classification?: {
    in: string;
    out: string;
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  controlsApplied?: string[];

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  errorMessage?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  memoryMb?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuPercent?: number;

  @IsOptional()
  @IsString()
  correlationId?: string;

  @IsOptional()
  @IsString()
  spanId?: string;

  @IsOptional()
  @IsDateString()
  timestamp?: string;
}

/**
 * DTO for adding a run log.
 */
export class AddRunLogDto {
  @IsEnum(LogLevel)
  level: LogLevel;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  timestamp?: string;
}

/**
 * DTO for adding a run artifact.
 */
export class AddRunArtifactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalName?: string;

  @IsEnum(ArtifactType)
  type: ArtifactType;

  @IsString()
  mimeType: string;

  @IsInt()
  @Min(0)
  sizeBytes: number;

  @IsString()
  storageKey: string;

  @IsOptional()
  @IsString()
  storageBucket?: string;

  @IsOptional()
  @IsString()
  storageRegion?: string;

  @IsOptional()
  @IsString()
  storageProvider?: string;

  @IsOptional()
  @IsString()
  checksum?: string;

  @IsOptional()
  @IsString()
  checksumAlgorithm?: string;

  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;

  @IsOptional()
  @IsString()
  encryptionKeyId?: string;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  stepId?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  permanent?: boolean;
}
