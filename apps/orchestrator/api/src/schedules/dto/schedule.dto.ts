import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsArray,
  IsNumber,
  IsDateString,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  ScheduleStatus,
  ScheduleTriggerType,
  ScheduleTargetType,
  SchedulePriority,
  ScheduleOverlapPolicy,
  ScheduleCatchupPolicy,
  ScheduleExecutionStatus,
  WebhookTriggerStatus,
  EventTriggerSourceType,
} from '../entities/schedule.entity';

// ============================================================================
// NESTED DTOs
// ============================================================================

/**
 * Blackout window configuration.
 */
export class BlackoutWindowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  startTime: string; // HH:mm

  @IsString()
  endTime: string; // HH:mm

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;
}

/**
 * Alert configuration.
 */
export class AlertConfigDto {
  @IsArray()
  @IsEnum(['email', 'slack', 'teams', 'webhook', 'pagerduty'], { each: true })
  channels: ('email' | 'slack' | 'teams' | 'webhook' | 'pagerduty')[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  slackChannel?: string;

  @IsOptional()
  @IsString()
  teamsChannel?: string;

  @IsOptional()
  @IsString()
  pagerdutyKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownMinutes?: number;
}

/**
 * Calendar dates configuration.
 */
export class CalendarDatesDto {
  @IsArray()
  @IsDateString({}, { each: true })
  dates: string[];

  @IsArray()
  @IsString({ each: true })
  times: string[]; // HH:mm

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  excludeDates?: string[];
}

// ============================================================================
// CREATE DTOs
// ============================================================================

/**
 * Create schedule DTO.
 */
export class CreateScheduleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsUUID()
  botId: string;

  @IsOptional()
  @IsUUID()
  botVersionId?: string;

  @IsOptional()
  @IsBoolean()
  useLatestVersion?: boolean;

  @IsOptional()
  @IsBoolean()
  useDraftVersion?: boolean;

  // Trigger configuration
  @IsEnum(ScheduleTriggerType)
  triggerType: ScheduleTriggerType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cronExpression?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @IsOptional()
  @IsDateString()
  intervalStartTime?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendarDatesDto)
  calendarDates?: CalendarDatesDto;

  // Runner targeting
  @IsOptional()
  @IsEnum(ScheduleTargetType)
  targetType?: ScheduleTargetType;

  @IsOptional()
  @IsUUID()
  targetPoolId?: string;

  @IsOptional()
  @IsUUID()
  targetRunnerId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCapabilities?: string[];

  @IsOptional()
  @IsObject()
  targetLabels?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  runnerAcquireTimeoutSeconds?: number;

  // Execution configuration
  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>;

  @IsOptional()
  @IsObject()
  environmentOverrides?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  credentialIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(30)
  timeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  // Overlap & concurrency
  @IsOptional()
  @IsEnum(ScheduleOverlapPolicy)
  overlapPolicy?: ScheduleOverlapPolicy;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrentRuns?: number;

  // Catchup policy
  @IsOptional()
  @IsEnum(ScheduleCatchupPolicy)
  catchupPolicy?: ScheduleCatchupPolicy;

  @IsOptional()
  @IsInt()
  @Min(60)
  catchupWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxCatchupRuns?: number;

  // Blackout windows
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlackoutWindowDto)
  @ArrayMaxSize(20)
  blackoutWindows?: BlackoutWindowDto[];

  // Execution limits
  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalExecutions?: number;

  // Validity period
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsBoolean()
  autoDisableOnExpiry?: boolean;

  // SLA & alerting
  @IsOptional()
  @IsInt()
  @Min(1)
  slaMaxDurationSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  slaMaxFailureRate?: number;

  @IsOptional()
  @IsBoolean()
  alertOnFailure?: boolean;

  @IsOptional()
  @IsBoolean()
  alertOnSlaViolation?: boolean;

  @IsOptional()
  @IsBoolean()
  alertOnSkip?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  alertAfterConsecutiveFailures?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AlertConfigDto)
  alertConfig?: AlertConfigDto;

  // Auto-pause
  @IsOptional()
  @IsBoolean()
  autoPauseOnFailure?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  autoPauseAfterFailures?: number;

  @IsOptional()
  @IsBoolean()
  autoResumeEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  autoResumeAfterSeconds?: number;

  // Tags & metadata
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  // Activate immediately
  @IsOptional()
  @IsBoolean()
  activateImmediately?: boolean;
}

/**
 * Update schedule DTO.
 */
export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  botVersionId?: string;

  @IsOptional()
  @IsBoolean()
  useLatestVersion?: boolean;

  @IsOptional()
  @IsBoolean()
  useDraftVersion?: boolean;

  // Trigger configuration
  @IsOptional()
  @IsEnum(ScheduleTriggerType)
  triggerType?: ScheduleTriggerType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cronExpression?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @IsOptional()
  @IsDateString()
  intervalStartTime?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendarDatesDto)
  calendarDates?: CalendarDatesDto;

  // Runner targeting
  @IsOptional()
  @IsEnum(ScheduleTargetType)
  targetType?: ScheduleTargetType;

  @IsOptional()
  @IsUUID()
  targetPoolId?: string;

  @IsOptional()
  @IsUUID()
  targetRunnerId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCapabilities?: string[];

  @IsOptional()
  @IsObject()
  targetLabels?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  runnerAcquireTimeoutSeconds?: number;

  // Execution configuration
  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>;

  @IsOptional()
  @IsObject()
  environmentOverrides?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  credentialIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(30)
  timeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  // Overlap & concurrency
  @IsOptional()
  @IsEnum(ScheduleOverlapPolicy)
  overlapPolicy?: ScheduleOverlapPolicy;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrentRuns?: number;

  // Catchup policy
  @IsOptional()
  @IsEnum(ScheduleCatchupPolicy)
  catchupPolicy?: ScheduleCatchupPolicy;

  @IsOptional()
  @IsInt()
  @Min(60)
  catchupWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxCatchupRuns?: number;

  // Blackout windows
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlackoutWindowDto)
  @ArrayMaxSize(20)
  blackoutWindows?: BlackoutWindowDto[];

  // Execution limits
  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalExecutions?: number;

  // Validity period
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsBoolean()
  autoDisableOnExpiry?: boolean;

  // SLA & alerting
  @IsOptional()
  @IsInt()
  @Min(1)
  slaMaxDurationSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  slaMaxFailureRate?: number;

  @IsOptional()
  @IsBoolean()
  alertOnFailure?: boolean;

  @IsOptional()
  @IsBoolean()
  alertOnSlaViolation?: boolean;

  @IsOptional()
  @IsBoolean()
  alertOnSkip?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  alertAfterConsecutiveFailures?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AlertConfigDto)
  alertConfig?: AlertConfigDto;

  // Auto-pause
  @IsOptional()
  @IsBoolean()
  autoPauseOnFailure?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  autoPauseAfterFailures?: number;

  @IsOptional()
  @IsBoolean()
  autoResumeEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  autoResumeAfterSeconds?: number;

  // Tags & metadata
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * Pause schedule DTO.
 */
export class PauseScheduleDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsDateString()
  resumeAt?: string; // Auto-resume time
}

/**
 * Resume schedule DTO.
 */
export class ResumeScheduleDto {
  @IsOptional()
  @IsBoolean()
  triggerImmediately?: boolean;

  @IsOptional()
  @IsBoolean()
  catchupMissed?: boolean;
}

/**
 * Trigger schedule manually DTO.
 */
export class TriggerScheduleDto {
  @IsOptional()
  @IsObject()
  inputOverrides?: Record<string, any>;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priorityOverride?: SchedulePriority;

  @IsOptional()
  @IsUUID()
  targetRunnerIdOverride?: string;

  @IsOptional()
  @IsBoolean()
  ignoreBlackout?: boolean;

  @IsOptional()
  @IsBoolean()
  ignoreQuota?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  triggerReason?: string;
}

// ============================================================================
// WEBHOOK TRIGGER DTOs
// ============================================================================

/**
 * Create webhook trigger DTO.
 */
export class CreateWebhookTriggerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  requireSignature?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];

  @IsOptional()
  @IsObject()
  requiredHeaders?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCallsPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCallsPerHour?: number;

  @IsOptional()
  @IsObject()
  inputMapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  payloadSchema?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  validatePayload?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCalls?: number;
}

/**
 * Update webhook trigger DTO.
 */
export class UpdateWebhookTriggerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  requireSignature?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];

  @IsOptional()
  @IsObject()
  requiredHeaders?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCallsPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCallsPerHour?: number;

  @IsOptional()
  @IsObject()
  inputMapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  payloadSchema?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  validatePayload?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCalls?: number;
}

/**
 * Revoke webhook trigger DTO.
 */
export class RevokeWebhookTriggerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ============================================================================
// EVENT TRIGGER DTOs
// ============================================================================

/**
 * Create event trigger DTO.
 */
export class CreateEventTriggerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(EventTriggerSourceType)
  sourceType: EventTriggerSourceType;

  // Bot completion trigger
  @IsOptional()
  @IsUUID()
  sourceBotId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceStatusFilter?: string[];

  // File watcher trigger
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  watchPath?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filePatterns?: string[];

  // Queue trigger
  @IsOptional()
  @IsString()
  @MaxLength(500)
  queueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  queueUrl?: string;

  // Email trigger
  @IsOptional()
  @IsString()
  @MaxLength(500)
  emailAddress?: string;

  @IsOptional()
  @IsObject()
  emailFilters?: {
    fromAddresses?: string[];
    subjectPatterns?: string[];
    hasAttachment?: boolean;
    attachmentPatterns?: string[];
  };

  // Custom event
  @IsOptional()
  @IsString()
  @MaxLength(200)
  eventType?: string;

  @IsOptional()
  @IsObject()
  eventFilter?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(0)
  debounceSeconds?: number;

  @IsOptional()
  @IsObject()
  inputMapping?: Record<string, string>;
}

/**
 * Update event trigger DTO.
 */
export class UpdateEventTriggerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceStatusFilter?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  watchPath?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filePatterns?: string[];

  @IsOptional()
  @IsObject()
  emailFilters?: {
    fromAddresses?: string[];
    subjectPatterns?: string[];
    hasAttachment?: boolean;
    attachmentPatterns?: string[];
  };

  @IsOptional()
  @IsObject()
  eventFilter?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(0)
  debounceSeconds?: number;

  @IsOptional()
  @IsObject()
  inputMapping?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

// ============================================================================
// QUERY DTOs
// ============================================================================

/**
 * List schedules query DTO.
 */
export class ListSchedulesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsEnum(ScheduleTriggerType)
  triggerType?: ScheduleTriggerType;

  @IsOptional()
  @IsUUID()
  botId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  tags?: string[];

  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'createdAt' | 'nextRunAt' | 'lastRunAt' | 'status';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeDisabled?: boolean;
}

/**
 * List schedule executions query DTO.
 */
export class ListScheduleExecutionsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(ScheduleExecutionStatus)
  status?: ScheduleExecutionStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

/**
 * List webhook triggers query DTO.
 */
export class ListWebhookTriggersQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(WebhookTriggerStatus)
  status?: WebhookTriggerStatus;
}

/**
 * List event triggers query DTO.
 */
export class ListEventTriggersQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(EventTriggerSourceType)
  sourceType?: EventTriggerSourceType;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  enabled?: boolean;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Schedule summary response DTO.
 */
export class ScheduleSummaryDto {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  status: ScheduleStatus;
  triggerType: ScheduleTriggerType;
  botId: string;
  botName?: string;
  cronExpression?: string;
  timezone: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Schedule detail response DTO.
 */
export class ScheduleDetailDto extends ScheduleSummaryDto {
  botVersionId?: string;
  botVersionLabel?: string;
  useLatestVersion: boolean;
  useDraftVersion: boolean;

  // Trigger config
  intervalMinutes?: number;
  intervalStartTime?: string;
  calendarDates?: CalendarDatesDto;

  // Runner targeting
  targetType: ScheduleTargetType;
  targetPoolId?: string;
  targetRunnerId?: string;
  targetCapabilities?: string[];
  targetLabels?: Record<string, string>;
  runnerAcquireTimeoutSeconds: number;

  // Execution config
  priority: SchedulePriority;
  inputs?: Record<string, any>;
  environmentOverrides?: Record<string, string>;
  credentialIds: string[];
  timeoutSeconds?: number;
  maxRetries?: number;

  // Overlap & concurrency
  overlapPolicy: ScheduleOverlapPolicy;
  maxConcurrentRuns: number;
  currentRunningCount: number;
  activeRunIds: string[];

  // Catchup
  catchupPolicy: ScheduleCatchupPolicy;
  catchupWindowSeconds: number;
  maxCatchupRuns: number;

  // Blackout windows
  blackoutWindows?: { windows: BlackoutWindowDto[] };

  // Execution limits
  maxExecutionsPerHour?: number;
  maxExecutionsPerDay?: number;
  maxExecutionsPerWeek?: number;
  maxExecutionsPerMonth?: number;
  maxTotalExecutions?: number;
  executionsThisHour: number;
  executionsThisDay: number;
  executionsThisWeek: number;
  executionsThisMonth: number;

  // Validity period
  effectiveFrom?: string;
  effectiveUntil?: string;
  autoDisableOnExpiry: boolean;

  // Execution state
  lastSuccessAt?: string;
  lastSuccessRunId?: string;
  lastFailureAt?: string;
  lastFailureRunId?: string;
  lastRunId?: string;
  skipCount: number;
  avgDurationSeconds: number;
  lastError?: string;
  consecutiveFailures: number;
  consecutiveSkips: number;

  // SLA & alerting
  slaMaxDurationSeconds?: number;
  slaMaxFailureRate?: number;
  alertOnFailure: boolean;
  alertOnSlaViolation: boolean;
  alertOnSkip: boolean;
  alertAfterConsecutiveFailures: number;
  alertConfig?: AlertConfigDto;
  lastAlertAt?: string;

  // Auto-pause
  autoPauseOnFailure: boolean;
  autoPauseAfterFailures: number;
  autoResumeEnabled: boolean;
  autoResumeAfterSeconds: number;
  autoPausedAt?: string;
  autoResumeAt?: string;

  // Ownership
  createdBy: string;
  creatorName?: string;
  updatedBy?: string;
  ownerId?: string;
  ownerName?: string;

  // Metadata
  metadata?: Record<string, any>;
  notes?: string;
  pauseReason?: string;
  disableReason?: string;

  // Timestamps
  activatedAt?: string;
  pausedAt?: string;
  disabledAt?: string;

  // Related counts
  webhookTriggerCount?: number;
  eventTriggerCount?: number;
}

/**
 * Schedule execution response DTO.
 */
export class ScheduleExecutionDto {
  id: string;
  scheduleId: string;
  status: ScheduleExecutionStatus;
  runId?: string;
  scheduledAt: string;
  triggeredAt: string;
  runStartedAt?: string;
  runCompletedAt?: string;
  durationMs?: number;
  skipReason?: string;
  errorMessage?: string;
  triggerContext?: {
    triggerType: ScheduleTriggerType;
    cronExpression?: string;
    eventId?: string;
    webhookId?: string;
    manualTriggeredBy?: string;
    catchup?: boolean;
  };
  runnerInfo?: {
    runnerId: string;
    runnerName: string;
    poolId?: string;
  };
  botVersionId?: string;
  inputs?: Record<string, any>;
  createdAt: string;
}

/**
 * Webhook trigger response DTO.
 */
export class WebhookTriggerDto {
  id: string;
  scheduleId: string;
  name: string;
  description?: string;
  token: string;
  webhookUrl: string; // Full URL
  requireSignature: boolean;
  hasSecret: boolean;
  allowedIps?: string[];
  requiredHeaders?: Record<string, string>;
  status: WebhookTriggerStatus;
  maxCallsPerMinute?: number;
  maxCallsPerHour?: number;
  callsThisMinute: number;
  callsThisHour: number;
  inputMapping?: Record<string, string>;
  validatePayload: boolean;
  expiresAt?: string;
  maxCalls?: number;
  totalCalls: number;
  lastCalledAt?: string;
  lastCallerIp?: string;
  successCount: number;
  failureCount: number;
  createdAt: string;
  createdBy: string;
}

/**
 * Event trigger response DTO.
 */
export class EventTriggerDto {
  id: string;
  scheduleId: string;
  name: string;
  description?: string;
  sourceType: EventTriggerSourceType;
  sourceBotId?: string;
  sourceBotName?: string;
  sourceStatusFilter?: string[];
  watchPath?: string;
  filePatterns?: string[];
  queueName?: string;
  queueUrl?: string;
  emailAddress?: string;
  emailFilters?: {
    fromAddresses?: string[];
    subjectPatterns?: string[];
    hasAttachment?: boolean;
    attachmentPatterns?: string[];
  };
  eventType?: string;
  eventFilter?: Record<string, any>;
  debounceSeconds: number;
  inputMapping?: Record<string, string>;
  enabled: boolean;
  disabledReason?: string;
  lastTriggeredAt?: string;
  createdAt: string;
  createdBy: string;
}

/**
 * Paginated schedules response DTO.
 */
export class PaginatedSchedulesDto {
  data: ScheduleSummaryDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated schedule executions response DTO.
 */
export class PaginatedScheduleExecutionsDto {
  data: ScheduleExecutionDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Schedule stats response DTO.
 */
export class ScheduleStatsDto {
  totalSchedules: number;
  activeSchedules: number;
  pausedSchedules: number;
  disabledSchedules: number;
  errorSchedules: number;

  totalExecutionsToday: number;
  successfulExecutionsToday: number;
  failedExecutionsToday: number;
  skippedExecutionsToday: number;

  avgSuccessRate: number;
  avgDurationSeconds: number;

  upcomingExecutions: Array<{
    scheduleId: string;
    scheduleName: string;
    botId: string;
    botName: string;
    nextRunAt: string;
  }>;

  recentFailures: Array<{
    scheduleId: string;
    scheduleName: string;
    runId: string;
    failedAt: string;
    errorMessage?: string;
  }>;
}

/**
 * Trigger result response DTO.
 */
export class TriggerResultDto {
  scheduleId: string;
  runId: string;
  triggeredAt: string;
  status: 'triggered' | 'skipped' | 'failed';
  skipReason?: string;
  errorMessage?: string;
}

// ============================================================================
// INTERNAL DTOs (for service layer)
// ============================================================================

/**
 * Schedule trigger job data.
 */
export class ScheduleTriggerJobDto {
  scheduleId: string;
  tenantId: string;
  scheduledAt: Date;
  triggerType: ScheduleTriggerType;
  cronExpression?: string;
  eventId?: string;
  webhookId?: string;
  manualTriggeredBy?: string;
  catchup?: boolean;
  inputOverrides?: Record<string, any>;
  priorityOverride?: SchedulePriority;
  targetRunnerIdOverride?: string;
  ignoreBlackout?: boolean;
  ignoreQuota?: boolean;
}

/**
 * Update schedule execution status.
 */
export class UpdateScheduleExecutionDto {
  status?: ScheduleExecutionStatus;
  runId?: string;
  runStartedAt?: Date;
  runCompletedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  runnerInfo?: {
    runnerId: string;
    runnerName: string;
    poolId?: string;
  };
}
