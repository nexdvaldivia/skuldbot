import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual, Between, Not, IsNull, DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  Schedule,
  ScheduleExecution,
  WebhookTrigger,
  EventTrigger,
  ScheduleCalendarEntry,
  ScheduleGroup,
  ScheduleStatus,
  ScheduleTriggerType,
  ScheduleTargetType,
  SchedulePriority,
  ScheduleOverlapPolicy,
  ScheduleCatchupPolicy,
  ScheduleExecutionStatus,
  WebhookTriggerStatus,
  EventTriggerSourceType,
} from './entities/schedule.entity';
import { Bot, BotVersion, BotStatus, VersionStatus } from '../bots/entities/bot.entity';
import { User } from '../users/entities/user.entity';
import { CronParser } from './cron/cron-parser';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  PauseScheduleDto,
  ResumeScheduleDto,
  TriggerScheduleDto,
  CreateWebhookTriggerDto,
  UpdateWebhookTriggerDto,
  RevokeWebhookTriggerDto,
  CreateEventTriggerDto,
  UpdateEventTriggerDto,
  ListSchedulesQueryDto,
  ListScheduleExecutionsQueryDto,
  ListWebhookTriggersQueryDto,
  ListEventTriggersQueryDto,
  ScheduleSummaryDto,
  ScheduleDetailDto,
  ScheduleExecutionDto,
  WebhookTriggerDto,
  EventTriggerDto,
  PaginatedSchedulesDto,
  PaginatedScheduleExecutionsDto,
  ScheduleStatsDto,
  TriggerResultDto,
  ScheduleTriggerJobDto,
} from './dto/schedule.dto';

/**
 * Enterprise Schedule Management Service.
 *
 * Features:
 * - Multiple trigger types (cron, interval, calendar, event, webhook)
 * - Timezone-aware scheduling with DST handling
 * - Blackout windows for maintenance periods
 * - Execution quotas and rate limiting
 * - Overlap and catchup policies
 * - SLA tracking and alerting
 * - Distributed locking for HA deployments
 * - Complete audit trail
 * - Webhook and event-based triggers
 */
@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(ScheduleExecution)
    private readonly executionRepository: Repository<ScheduleExecution>,
    @InjectRepository(WebhookTrigger)
    private readonly webhookRepository: Repository<WebhookTrigger>,
    @InjectRepository(EventTrigger)
    private readonly eventTriggerRepository: Repository<EventTrigger>,
    @InjectRepository(ScheduleCalendarEntry)
    private readonly calendarEntryRepository: Repository<ScheduleCalendarEntry>,
    @InjectRepository(ScheduleGroup)
    private readonly groupRepository: Repository<ScheduleGroup>,
    @InjectRepository(Bot)
    private readonly botRepository: Repository<Bot>,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================================
  // SCHEDULE CRUD
  // ============================================================================

  /**
   * Create a new schedule.
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateScheduleDto,
  ): Promise<ScheduleDetailDto> {
    // Validate bot
    const bot = await this.botRepository.findOne({
      where: { id: dto.botId, tenantId },
    });
    if (!bot) {
      throw new NotFoundException(`Bot ${dto.botId} not found`);
    }
    if (bot.status === BotStatus.ARCHIVED) {
      throw new BadRequestException('Cannot schedule an archived bot');
    }

    // Validate bot version if specified
    let botVersionId: string | null = null;
    if (dto.botVersionId) {
      const version = await this.versionRepository.findOne({
        where: { id: dto.botVersionId, botId: dto.botId },
      });
      if (!version) {
        throw new NotFoundException(`Bot version ${dto.botVersionId} not found`);
      }
      if (version.status !== VersionStatus.PUBLISHED && !dto.useDraftVersion) {
        throw new BadRequestException('Bot version is not published');
      }
      botVersionId = version.id;
    } else if (!dto.useLatestVersion) {
      // Use current published version
      botVersionId = bot.currentVersionId;
      if (!botVersionId) {
        throw new BadRequestException('Bot has no published version');
      }
    }

    // Validate trigger configuration
    await this.validateTriggerConfig(dto);

    // Calculate initial next run time
    const nextRunAt = this.calculateNextRunTime(dto);

    // Create schedule
    const schedule = this.scheduleRepository.create({
      tenantId,
      name: dto.name,
      description: dto.description,
      status: dto.activateImmediately ? ScheduleStatus.ACTIVE : ScheduleStatus.DRAFT,
      tags: dto.tags || [],
      botId: dto.botId,
      botVersionId,
      useLatestVersion: dto.useLatestVersion ?? false,
      useDraftVersion: dto.useDraftVersion ?? false,
      triggerType: dto.triggerType,
      cronExpression: dto.cronExpression,
      timezone: dto.timezone || 'UTC',
      intervalMinutes: dto.intervalMinutes,
      intervalStartTime: dto.intervalStartTime ? new Date(dto.intervalStartTime) : null,
      calendarDates: dto.calendarDates,
      targetType: dto.targetType || ScheduleTargetType.ANY,
      targetPoolId: dto.targetPoolId,
      targetRunnerId: dto.targetRunnerId,
      targetCapabilities: dto.targetCapabilities,
      targetLabels: dto.targetLabels,
      runnerAcquireTimeoutSeconds: dto.runnerAcquireTimeoutSeconds ?? 300,
      priority: dto.priority || SchedulePriority.NORMAL,
      inputs: dto.inputs,
      environmentOverrides: dto.environmentOverrides,
      credentialIds: dto.credentialIds || [],
      timeoutSeconds: dto.timeoutSeconds,
      maxRetries: dto.maxRetries,
      overlapPolicy: dto.overlapPolicy || ScheduleOverlapPolicy.SKIP,
      maxConcurrentRuns: dto.maxConcurrentRuns ?? 1,
      catchupPolicy: dto.catchupPolicy || ScheduleCatchupPolicy.NONE,
      catchupWindowSeconds: dto.catchupWindowSeconds ?? 3600,
      maxCatchupRuns: dto.maxCatchupRuns ?? 10,
      blackoutWindows: dto.blackoutWindows ? { windows: dto.blackoutWindows } : null,
      maxExecutionsPerHour: dto.maxExecutionsPerHour,
      maxExecutionsPerDay: dto.maxExecutionsPerDay,
      maxExecutionsPerWeek: dto.maxExecutionsPerWeek,
      maxExecutionsPerMonth: dto.maxExecutionsPerMonth,
      maxTotalExecutions: dto.maxTotalExecutions,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
      autoDisableOnExpiry: dto.autoDisableOnExpiry ?? false,
      nextRunAt,
      slaMaxDurationSeconds: dto.slaMaxDurationSeconds,
      slaMaxFailureRate: dto.slaMaxFailureRate,
      alertOnFailure: dto.alertOnFailure ?? false,
      alertOnSlaViolation: dto.alertOnSlaViolation ?? false,
      alertOnSkip: dto.alertOnSkip ?? false,
      alertAfterConsecutiveFailures: dto.alertAfterConsecutiveFailures ?? 3,
      alertConfig: dto.alertConfig,
      autoPauseOnFailure: dto.autoPauseOnFailure ?? false,
      autoPauseAfterFailures: dto.autoPauseAfterFailures ?? 5,
      autoResumeEnabled: dto.autoResumeEnabled ?? false,
      autoResumeAfterSeconds: dto.autoResumeAfterSeconds ?? 3600,
      createdBy: userId,
      ownerId: userId,
      metadata: dto.metadata,
      activatedAt: dto.activateImmediately ? new Date() : null,
    });

    await this.scheduleRepository.save(schedule);

    this.logger.log(
      `Created schedule ${schedule.id} (${schedule.name}) for bot ${bot.name}`,
    );

    return this.findOne(tenantId, schedule.id);
  }

  /**
   * Update a schedule.
   */
  async update(
    tenantId: string,
    scheduleId: string,
    userId: string,
    dto: UpdateScheduleDto,
  ): Promise<ScheduleDetailDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    // Validate bot version if changing
    if (dto.botVersionId !== undefined) {
      if (dto.botVersionId) {
        const version = await this.versionRepository.findOne({
          where: { id: dto.botVersionId, botId: schedule.botId },
        });
        if (!version) {
          throw new NotFoundException(`Bot version ${dto.botVersionId} not found`);
        }
      }
      schedule.botVersionId = dto.botVersionId || null;
    }

    // Validate trigger config if changing
    if (dto.triggerType || dto.cronExpression || dto.intervalMinutes) {
      await this.validateTriggerConfig({
        ...schedule,
        ...dto,
        triggerType: dto.triggerType || schedule.triggerType,
      } as CreateScheduleDto);
    }

    // Update fields
    if (dto.name !== undefined) schedule.name = dto.name;
    if (dto.description !== undefined) schedule.description = dto.description;
    if (dto.useLatestVersion !== undefined) schedule.useLatestVersion = dto.useLatestVersion;
    if (dto.useDraftVersion !== undefined) schedule.useDraftVersion = dto.useDraftVersion;
    if (dto.triggerType !== undefined) schedule.triggerType = dto.triggerType;
    if (dto.cronExpression !== undefined) schedule.cronExpression = dto.cronExpression;
    if (dto.timezone !== undefined) schedule.timezone = dto.timezone;
    if (dto.intervalMinutes !== undefined) schedule.intervalMinutes = dto.intervalMinutes;
    if (dto.intervalStartTime !== undefined) {
      schedule.intervalStartTime = dto.intervalStartTime ? new Date(dto.intervalStartTime) : null;
    }
    if (dto.calendarDates !== undefined) schedule.calendarDates = dto.calendarDates;
    if (dto.targetType !== undefined) schedule.targetType = dto.targetType;
    if (dto.targetPoolId !== undefined) schedule.targetPoolId = dto.targetPoolId;
    if (dto.targetRunnerId !== undefined) schedule.targetRunnerId = dto.targetRunnerId;
    if (dto.targetCapabilities !== undefined) schedule.targetCapabilities = dto.targetCapabilities;
    if (dto.targetLabels !== undefined) schedule.targetLabels = dto.targetLabels;
    if (dto.runnerAcquireTimeoutSeconds !== undefined) {
      schedule.runnerAcquireTimeoutSeconds = dto.runnerAcquireTimeoutSeconds;
    }
    if (dto.priority !== undefined) schedule.priority = dto.priority;
    if (dto.inputs !== undefined) schedule.inputs = dto.inputs;
    if (dto.environmentOverrides !== undefined) schedule.environmentOverrides = dto.environmentOverrides;
    if (dto.credentialIds !== undefined) schedule.credentialIds = dto.credentialIds;
    if (dto.timeoutSeconds !== undefined) schedule.timeoutSeconds = dto.timeoutSeconds;
    if (dto.maxRetries !== undefined) schedule.maxRetries = dto.maxRetries;
    if (dto.overlapPolicy !== undefined) schedule.overlapPolicy = dto.overlapPolicy;
    if (dto.maxConcurrentRuns !== undefined) schedule.maxConcurrentRuns = dto.maxConcurrentRuns;
    if (dto.catchupPolicy !== undefined) schedule.catchupPolicy = dto.catchupPolicy;
    if (dto.catchupWindowSeconds !== undefined) schedule.catchupWindowSeconds = dto.catchupWindowSeconds;
    if (dto.maxCatchupRuns !== undefined) schedule.maxCatchupRuns = dto.maxCatchupRuns;
    if (dto.blackoutWindows !== undefined) {
      schedule.blackoutWindows = dto.blackoutWindows ? { windows: dto.blackoutWindows } : null;
    }
    if (dto.maxExecutionsPerHour !== undefined) schedule.maxExecutionsPerHour = dto.maxExecutionsPerHour;
    if (dto.maxExecutionsPerDay !== undefined) schedule.maxExecutionsPerDay = dto.maxExecutionsPerDay;
    if (dto.maxExecutionsPerWeek !== undefined) schedule.maxExecutionsPerWeek = dto.maxExecutionsPerWeek;
    if (dto.maxExecutionsPerMonth !== undefined) schedule.maxExecutionsPerMonth = dto.maxExecutionsPerMonth;
    if (dto.maxTotalExecutions !== undefined) schedule.maxTotalExecutions = dto.maxTotalExecutions;
    if (dto.effectiveFrom !== undefined) {
      schedule.effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : null;
    }
    if (dto.effectiveUntil !== undefined) {
      schedule.effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;
    }
    if (dto.autoDisableOnExpiry !== undefined) schedule.autoDisableOnExpiry = dto.autoDisableOnExpiry;
    if (dto.slaMaxDurationSeconds !== undefined) schedule.slaMaxDurationSeconds = dto.slaMaxDurationSeconds;
    if (dto.slaMaxFailureRate !== undefined) schedule.slaMaxFailureRate = dto.slaMaxFailureRate;
    if (dto.alertOnFailure !== undefined) schedule.alertOnFailure = dto.alertOnFailure;
    if (dto.alertOnSlaViolation !== undefined) schedule.alertOnSlaViolation = dto.alertOnSlaViolation;
    if (dto.alertOnSkip !== undefined) schedule.alertOnSkip = dto.alertOnSkip;
    if (dto.alertAfterConsecutiveFailures !== undefined) {
      schedule.alertAfterConsecutiveFailures = dto.alertAfterConsecutiveFailures;
    }
    if (dto.alertConfig !== undefined) schedule.alertConfig = dto.alertConfig;
    if (dto.autoPauseOnFailure !== undefined) schedule.autoPauseOnFailure = dto.autoPauseOnFailure;
    if (dto.autoPauseAfterFailures !== undefined) schedule.autoPauseAfterFailures = dto.autoPauseAfterFailures;
    if (dto.autoResumeEnabled !== undefined) schedule.autoResumeEnabled = dto.autoResumeEnabled;
    if (dto.autoResumeAfterSeconds !== undefined) schedule.autoResumeAfterSeconds = dto.autoResumeAfterSeconds;
    if (dto.tags !== undefined) schedule.tags = dto.tags;
    if (dto.metadata !== undefined) schedule.metadata = dto.metadata;

    schedule.updatedBy = userId;

    // Recalculate next run if trigger config changed
    if (dto.cronExpression || dto.intervalMinutes || dto.timezone || dto.triggerType) {
      schedule.nextRunAt = this.calculateNextRunTime(schedule as any);
    }

    await this.scheduleRepository.save(schedule);

    this.logger.log(`Updated schedule ${scheduleId}`);

    return this.findOne(tenantId, scheduleId);
  }

  /**
   * Get all schedules for a tenant with filtering.
   */
  async findAll(
    tenantId: string,
    query: ListSchedulesQueryDto,
  ): Promise<PaginatedSchedulesDto> {
    const {
      limit = 20,
      offset = 0,
      status,
      triggerType,
      botId,
      search,
      tags,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeDisabled = false,
    } = query;

    const qb = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.bot', 'bot')
      .where('schedule.tenantId = :tenantId', { tenantId })
      .andWhere('schedule.deletedAt IS NULL');

    if (status) {
      qb.andWhere('schedule.status = :status', { status });
    } else if (!includeDisabled) {
      qb.andWhere('schedule.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [ScheduleStatus.DISABLED, ScheduleStatus.EXPIRED],
      });
    }

    if (triggerType) {
      qb.andWhere('schedule.triggerType = :triggerType', { triggerType });
    }

    if (botId) {
      qb.andWhere('schedule.botId = :botId', { botId });
    }

    if (search) {
      qb.andWhere(
        '(schedule.name ILIKE :search OR schedule.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (tags && tags.length > 0) {
      qb.andWhere('schedule.tags && :tags', { tags });
    }

    // Sorting
    const sortColumn = {
      name: 'schedule.name',
      createdAt: 'schedule.createdAt',
      nextRunAt: 'schedule.nextRunAt',
      lastRunAt: 'schedule.lastRunAt',
      status: 'schedule.status',
    }[sortBy] || 'schedule.createdAt';

    qb.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const [schedules, total] = await qb
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      data: schedules.map((s) => this.toSummaryDto(s)),
      total,
      limit,
      offset,
      hasMore: offset + schedules.length < total,
    };
  }

  /**
   * Get a single schedule with full details.
   */
  async findOne(tenantId: string, scheduleId: string): Promise<ScheduleDetailDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
      relations: ['bot', 'botVersion', 'creator', 'owner'],
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    // Get related counts
    const [webhookCount, eventTriggerCount] = await Promise.all([
      this.webhookRepository.count({ where: { scheduleId } }),
      this.eventTriggerRepository.count({ where: { scheduleId } }),
    ]);

    return this.toDetailDto(schedule, webhookCount, eventTriggerCount);
  }

  /**
   * Delete a schedule.
   */
  async delete(tenantId: string, scheduleId: string, userId: string): Promise<void> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    // Soft delete
    schedule.deletedAt = new Date();
    schedule.status = ScheduleStatus.DISABLED;
    schedule.updatedBy = userId;

    await this.scheduleRepository.save(schedule);

    this.logger.log(`Deleted schedule ${scheduleId}`);
  }

  // ============================================================================
  // SCHEDULE LIFECYCLE
  // ============================================================================

  /**
   * Activate a schedule.
   */
  async activate(
    tenantId: string,
    scheduleId: string,
    userId: string,
  ): Promise<ScheduleDetailDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    if (schedule.status === ScheduleStatus.ACTIVE) {
      throw new BadRequestException('Schedule is already active');
    }

    // Validate can be activated
    await this.validateCanActivate(schedule);

    // Calculate next run
    schedule.nextRunAt = this.calculateNextRunTime(schedule as any);
    schedule.status = ScheduleStatus.ACTIVE;
    schedule.activatedAt = new Date();
    schedule.pausedAt = null;
    schedule.pauseReason = null;
    schedule.disabledAt = null;
    schedule.disableReason = null;
    schedule.updatedBy = userId;

    await this.scheduleRepository.save(schedule);

    this.logger.log(`Activated schedule ${scheduleId}`);

    return this.findOne(tenantId, scheduleId);
  }

  /**
   * Pause a schedule.
   */
  async pause(
    tenantId: string,
    scheduleId: string,
    userId: string,
    dto: PauseScheduleDto,
  ): Promise<ScheduleDetailDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    if (schedule.status === ScheduleStatus.PAUSED) {
      throw new BadRequestException('Schedule is already paused');
    }

    schedule.status = ScheduleStatus.PAUSED;
    schedule.pausedAt = new Date();
    schedule.pauseReason = dto.reason;
    schedule.updatedBy = userId;

    if (dto.resumeAt) {
      schedule.autoResumeAt = new Date(dto.resumeAt);
    }

    await this.scheduleRepository.save(schedule);

    this.logger.log(`Paused schedule ${scheduleId}`);

    return this.findOne(tenantId, scheduleId);
  }

  /**
   * Resume a paused schedule.
   */
  async resume(
    tenantId: string,
    scheduleId: string,
    userId: string,
    dto: ResumeScheduleDto,
  ): Promise<ScheduleDetailDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    if (schedule.status !== ScheduleStatus.PAUSED) {
      throw new BadRequestException('Schedule is not paused');
    }

    // Calculate next run, optionally catching up missed
    if (dto.catchupMissed && schedule.catchupPolicy !== ScheduleCatchupPolicy.NONE) {
      await this.processCatchup(schedule);
    }

    schedule.nextRunAt = dto.triggerImmediately
      ? new Date()
      : this.calculateNextRunTime(schedule as any);
    schedule.status = ScheduleStatus.ACTIVE;
    schedule.pausedAt = null;
    schedule.pauseReason = null;
    schedule.autoResumeAt = null;
    schedule.autoPausedAt = null;
    schedule.consecutiveFailures = 0;
    schedule.updatedBy = userId;

    await this.scheduleRepository.save(schedule);

    this.logger.log(`Resumed schedule ${scheduleId}`);

    return this.findOne(tenantId, scheduleId);
  }

  /**
   * Disable a schedule.
   */
  async disable(
    tenantId: string,
    scheduleId: string,
    userId: string,
    reason?: string,
  ): Promise<ScheduleDetailDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    schedule.status = ScheduleStatus.DISABLED;
    schedule.disabledAt = new Date();
    schedule.disableReason = reason;
    schedule.nextRunAt = null;
    schedule.updatedBy = userId;

    await this.scheduleRepository.save(schedule);

    this.logger.log(`Disabled schedule ${scheduleId}`);

    return this.findOne(tenantId, scheduleId);
  }

  // ============================================================================
  // MANUAL TRIGGER
  // ============================================================================

  /**
   * Manually trigger a schedule.
   */
  async triggerNow(
    tenantId: string,
    scheduleId: string,
    userId: string,
    dto: TriggerScheduleDto,
  ): Promise<TriggerResultDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
      relations: ['bot', 'botVersion'],
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    const now = new Date();

    // Check blackout windows (unless ignored)
    if (!dto.ignoreBlackout && this.isInBlackoutWindow(schedule, now)) {
      return {
        scheduleId,
        runId: '',
        triggeredAt: now.toISOString(),
        status: 'skipped',
        skipReason: 'Currently in blackout window',
      };
    }

    // Check quotas (unless ignored)
    if (!dto.ignoreQuota) {
      const quotaCheck = this.checkQuotas(schedule);
      if (!quotaCheck.allowed) {
        return {
          scheduleId,
          runId: '',
          triggeredAt: now.toISOString(),
          status: 'skipped',
          skipReason: quotaCheck.reason,
        };
      }
    }

    // Check overlap policy
    if (schedule.currentRunningCount >= schedule.maxConcurrentRuns) {
      if (schedule.overlapPolicy === ScheduleOverlapPolicy.SKIP) {
        return {
          scheduleId,
          runId: '',
          triggeredAt: now.toISOString(),
          status: 'skipped',
          skipReason: 'Max concurrent runs reached',
        };
      }
    }

    // Create execution record
    const execution = this.executionRepository.create({
      tenantId,
      scheduleId,
      status: ScheduleExecutionStatus.TRIGGERED,
      scheduledAt: now,
      triggeredAt: now,
      triggerContext: {
        triggerType: schedule.triggerType,
        cronExpression: schedule.cronExpression || undefined,
        manualTriggeredBy: userId,
      },
      botVersionId: schedule.botVersionId,
      inputs: dto.inputOverrides
        ? { ...schedule.inputs, ...dto.inputOverrides }
        : schedule.inputs,
    });

    await this.executionRepository.save(execution);

    // Update schedule stats
    schedule.lastRunAt = now;
    schedule.totalExecutions = Number(schedule.totalExecutions) + 1;
    this.incrementQuotaCounters(schedule);

    await this.scheduleRepository.save(schedule);

    this.logger.log(
      `Manually triggered schedule ${scheduleId} by user ${userId}`,
    );

    // TODO: Actually dispatch the run via RunsService
    // For now, return the execution ID as runId placeholder
    return {
      scheduleId,
      runId: execution.id,
      triggeredAt: now.toISOString(),
      status: 'triggered',
    };
  }

  // ============================================================================
  // EXECUTION HISTORY
  // ============================================================================

  /**
   * Get execution history for a schedule.
   */
  async getExecutions(
    tenantId: string,
    scheduleId: string,
    query: ListScheduleExecutionsQueryDto,
  ): Promise<PaginatedScheduleExecutionsDto> {
    // Verify schedule exists
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    const { limit = 50, offset = 0, status, from, to, sortOrder = 'desc' } = query;

    const qb = this.executionRepository
      .createQueryBuilder('exec')
      .where('exec.scheduleId = :scheduleId', { scheduleId });

    if (status) {
      qb.andWhere('exec.status = :status', { status });
    }

    if (from) {
      qb.andWhere('exec.triggeredAt >= :from', { from: new Date(from) });
    }

    if (to) {
      qb.andWhere('exec.triggeredAt <= :to', { to: new Date(to) });
    }

    qb.orderBy('exec.triggeredAt', sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const [executions, total] = await qb
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      data: executions.map((e) => this.toExecutionDto(e)),
      total,
      limit,
      offset,
      hasMore: offset + executions.length < total,
    };
  }

  // ============================================================================
  // WEBHOOK TRIGGERS
  // ============================================================================

  /**
   * Create a webhook trigger for a schedule.
   */
  async createWebhookTrigger(
    tenantId: string,
    scheduleId: string,
    userId: string,
    dto: CreateWebhookTriggerDto,
  ): Promise<WebhookTriggerDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const secret = dto.requireSignature ? randomBytes(32).toString('hex') : null;

    const webhook = this.webhookRepository.create({
      tenantId,
      scheduleId,
      name: dto.name,
      description: dto.description,
      token,
      secret,
      requireSignature: dto.requireSignature ?? false,
      allowedIps: dto.allowedIps,
      requiredHeaders: dto.requiredHeaders,
      maxCallsPerMinute: dto.maxCallsPerMinute,
      maxCallsPerHour: dto.maxCallsPerHour,
      inputMapping: dto.inputMapping,
      payloadSchema: dto.payloadSchema,
      validatePayload: dto.validatePayload ?? false,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      maxCalls: dto.maxCalls,
      createdBy: userId,
    });

    await this.webhookRepository.save(webhook);

    this.logger.log(`Created webhook trigger ${webhook.id} for schedule ${scheduleId}`);

    return this.toWebhookDto(webhook);
  }

  /**
   * Update a webhook trigger.
   */
  async updateWebhookTrigger(
    tenantId: string,
    scheduleId: string,
    webhookId: string,
    dto: UpdateWebhookTriggerDto,
  ): Promise<WebhookTriggerDto> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, scheduleId, tenantId },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook trigger ${webhookId} not found`);
    }

    Object.assign(webhook, dto);

    // Regenerate secret if enabling signature requirement
    if (dto.requireSignature && !webhook.secret) {
      webhook.secret = randomBytes(32).toString('hex');
    }

    await this.webhookRepository.save(webhook);

    return this.toWebhookDto(webhook);
  }

  /**
   * Revoke a webhook trigger.
   */
  async revokeWebhookTrigger(
    tenantId: string,
    scheduleId: string,
    webhookId: string,
    userId: string,
    dto: RevokeWebhookTriggerDto,
  ): Promise<void> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, scheduleId, tenantId },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook trigger ${webhookId} not found`);
    }

    webhook.status = WebhookTriggerStatus.REVOKED;
    webhook.revokedAt = new Date();
    webhook.revokedBy = userId;
    webhook.revokeReason = dto.reason;

    await this.webhookRepository.save(webhook);

    this.logger.log(`Revoked webhook trigger ${webhookId}`);
  }

  /**
   * Get webhook triggers for a schedule.
   */
  async getWebhookTriggers(
    tenantId: string,
    scheduleId: string,
    query: ListWebhookTriggersQueryDto,
  ): Promise<WebhookTriggerDto[]> {
    const { limit = 20, offset = 0, status } = query;

    const qb = this.webhookRepository
      .createQueryBuilder('webhook')
      .where('webhook.scheduleId = :scheduleId', { scheduleId })
      .andWhere('webhook.tenantId = :tenantId', { tenantId });

    if (status) {
      qb.andWhere('webhook.status = :status', { status });
    }

    const webhooks = await qb
      .orderBy('webhook.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return webhooks.map((w) => this.toWebhookDto(w));
  }

  // ============================================================================
  // EVENT TRIGGERS
  // ============================================================================

  /**
   * Create an event trigger for a schedule.
   */
  async createEventTrigger(
    tenantId: string,
    scheduleId: string,
    userId: string,
    dto: CreateEventTriggerDto,
  ): Promise<EventTriggerDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, tenantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${scheduleId} not found`);
    }

    const eventTrigger = this.eventTriggerRepository.create({
      tenantId,
      scheduleId,
      name: dto.name,
      description: dto.description,
      sourceType: dto.sourceType,
      sourceBotId: dto.sourceBotId,
      sourceStatusFilter: dto.sourceStatusFilter,
      watchPath: dto.watchPath,
      filePatterns: dto.filePatterns,
      queueName: dto.queueName,
      queueUrl: dto.queueUrl,
      emailAddress: dto.emailAddress,
      emailFilters: dto.emailFilters,
      eventType: dto.eventType,
      eventFilter: dto.eventFilter,
      debounceSeconds: dto.debounceSeconds ?? 0,
      inputMapping: dto.inputMapping,
      createdBy: userId,
    });

    await this.eventTriggerRepository.save(eventTrigger);

    this.logger.log(`Created event trigger ${eventTrigger.id} for schedule ${scheduleId}`);

    return this.toEventTriggerDto(eventTrigger);
  }

  /**
   * Update an event trigger.
   */
  async updateEventTrigger(
    tenantId: string,
    scheduleId: string,
    triggerId: string,
    dto: UpdateEventTriggerDto,
  ): Promise<EventTriggerDto> {
    const trigger = await this.eventTriggerRepository.findOne({
      where: { id: triggerId, scheduleId, tenantId },
    });
    if (!trigger) {
      throw new NotFoundException(`Event trigger ${triggerId} not found`);
    }

    Object.assign(trigger, dto);
    await this.eventTriggerRepository.save(trigger);

    return this.toEventTriggerDto(trigger);
  }

  /**
   * Delete an event trigger.
   */
  async deleteEventTrigger(
    tenantId: string,
    scheduleId: string,
    triggerId: string,
  ): Promise<void> {
    const result = await this.eventTriggerRepository.delete({
      id: triggerId,
      scheduleId,
      tenantId,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`Event trigger ${triggerId} not found`);
    }

    this.logger.log(`Deleted event trigger ${triggerId}`);
  }

  /**
   * Get event triggers for a schedule.
   */
  async getEventTriggers(
    tenantId: string,
    scheduleId: string,
    query: ListEventTriggersQueryDto,
  ): Promise<EventTriggerDto[]> {
    const { limit = 20, offset = 0, sourceType, enabled } = query;

    const qb = this.eventTriggerRepository
      .createQueryBuilder('trigger')
      .where('trigger.scheduleId = :scheduleId', { scheduleId })
      .andWhere('trigger.tenantId = :tenantId', { tenantId });

    if (sourceType) {
      qb.andWhere('trigger.sourceType = :sourceType', { sourceType });
    }

    if (enabled !== undefined) {
      qb.andWhere('trigger.enabled = :enabled', { enabled });
    }

    const triggers = await qb
      .orderBy('trigger.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return triggers.map((t) => this.toEventTriggerDto(t));
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get schedule statistics for a tenant.
   */
  async getStats(tenantId: string, botId?: string): Promise<ScheduleStatsDto> {
    const whereClause = botId
      ? { tenantId, botId, deletedAt: IsNull() }
      : { tenantId, deletedAt: IsNull() };

    // Get schedule counts by status
    const schedules = await this.scheduleRepository.find({
      where: whereClause,
      relations: ['bot'],
    });

    const totalSchedules = schedules.length;
    const activeSchedules = schedules.filter((s) => s.status === ScheduleStatus.ACTIVE).length;
    const pausedSchedules = schedules.filter((s) => s.status === ScheduleStatus.PAUSED).length;
    const disabledSchedules = schedules.filter((s) => s.status === ScheduleStatus.DISABLED).length;
    const errorSchedules = schedules.filter((s) => s.status === ScheduleStatus.ERROR).length;

    // Get today's executions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayExecutions = await this.executionRepository
      .createQueryBuilder('exec')
      .innerJoin('exec.schedule', 'schedule')
      .where('schedule.tenantId = :tenantId', { tenantId })
      .andWhere('exec.triggeredAt >= :todayStart', { todayStart })
      .getMany();

    const totalExecutionsToday = todayExecutions.length;
    const successfulExecutionsToday = todayExecutions.filter(
      (e) => e.status === ScheduleExecutionStatus.TRIGGERED && e.runId,
    ).length;
    const failedExecutionsToday = todayExecutions.filter(
      (e) => e.status === ScheduleExecutionStatus.FAILED,
    ).length;
    const skippedExecutionsToday = todayExecutions.filter((e) =>
      [
        ScheduleExecutionStatus.SKIPPED_OVERLAP,
        ScheduleExecutionStatus.SKIPPED_BLACKOUT,
        ScheduleExecutionStatus.SKIPPED_QUOTA,
      ].includes(e.status),
    ).length;

    // Calculate averages
    const avgSuccessRate =
      totalSchedules > 0
        ? schedules.reduce((acc, s) => {
            const total = Number(s.successCount) + Number(s.failureCount);
            return acc + (total > 0 ? Number(s.successCount) / total : 0);
          }, 0) / totalSchedules
        : 0;

    const avgDurationSeconds =
      totalSchedules > 0
        ? schedules.reduce((acc, s) => acc + s.avgDurationSeconds, 0) / totalSchedules
        : 0;

    // Get upcoming executions
    const upcomingExecutions = schedules
      .filter((s) => s.status === ScheduleStatus.ACTIVE && s.nextRunAt)
      .sort((a, b) => a.nextRunAt!.getTime() - b.nextRunAt!.getTime())
      .slice(0, 10)
      .map((s) => ({
        scheduleId: s.id,
        scheduleName: s.name,
        botId: s.botId,
        botName: s.bot?.name || 'Unknown',
        nextRunAt: s.nextRunAt!.toISOString(),
      }));

    // Get recent failures
    const recentFailures = await this.executionRepository
      .createQueryBuilder('exec')
      .innerJoin('exec.schedule', 'schedule')
      .where('schedule.tenantId = :tenantId', { tenantId })
      .andWhere('exec.status = :status', { status: ScheduleExecutionStatus.FAILED })
      .orderBy('exec.triggeredAt', 'DESC')
      .limit(10)
      .getMany();

    return {
      totalSchedules,
      activeSchedules,
      pausedSchedules,
      disabledSchedules,
      errorSchedules,
      totalExecutionsToday,
      successfulExecutionsToday,
      failedExecutionsToday,
      skippedExecutionsToday,
      avgSuccessRate: Math.round(avgSuccessRate * 100),
      avgDurationSeconds: Math.round(avgDurationSeconds),
      upcomingExecutions,
      recentFailures: recentFailures.map((e) => ({
        scheduleId: e.scheduleId,
        scheduleName: '', // Would need join
        runId: e.runId || '',
        failedAt: e.triggeredAt.toISOString(),
        errorMessage: e.errorMessage,
      })),
    };
  }

  // ============================================================================
  // SCHEDULER TICK (called by SchedulerService)
  // ============================================================================

  /**
   * Get schedules that are due to run.
   */
  async getDueSchedules(limit: number = 100): Promise<Schedule[]> {
    const now = new Date();

    return this.scheduleRepository.find({
      where: {
        status: ScheduleStatus.ACTIVE,
        nextRunAt: LessThanOrEqual(now),
        deletedAt: IsNull(),
      },
      relations: ['bot', 'botVersion'],
      take: limit,
      order: { nextRunAt: 'ASC' },
    });
  }

  /**
   * Process a schedule trigger (called by scheduler).
   */
  async processScheduleTrigger(job: ScheduleTriggerJobDto): Promise<TriggerResultDto> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: job.scheduleId, tenantId: job.tenantId },
      relations: ['bot', 'botVersion'],
    });

    if (!schedule) {
      return {
        scheduleId: job.scheduleId,
        runId: '',
        triggeredAt: new Date().toISOString(),
        status: 'failed',
        errorMessage: 'Schedule not found',
      };
    }

    const now = new Date();

    // Check if still active
    if (schedule.status !== ScheduleStatus.ACTIVE) {
      await this.recordSkippedExecution(
        schedule,
        ScheduleExecutionStatus.SKIPPED_PAUSED,
        job.scheduledAt,
        'Schedule is not active',
      );
      return {
        scheduleId: job.scheduleId,
        runId: '',
        triggeredAt: now.toISOString(),
        status: 'skipped',
        skipReason: 'Schedule is not active',
      };
    }

    // Check blackout windows
    if (!job.ignoreBlackout && this.isInBlackoutWindow(schedule, now)) {
      await this.recordSkippedExecution(
        schedule,
        ScheduleExecutionStatus.SKIPPED_BLACKOUT,
        job.scheduledAt,
        'In blackout window',
      );
      schedule.skipCount = Number(schedule.skipCount) + 1;
      schedule.consecutiveSkips++;
      schedule.nextRunAt = this.calculateNextRunTime(schedule as any);
      await this.scheduleRepository.save(schedule);

      return {
        scheduleId: job.scheduleId,
        runId: '',
        triggeredAt: now.toISOString(),
        status: 'skipped',
        skipReason: 'In blackout window',
      };
    }

    // Check quotas
    if (!job.ignoreQuota) {
      const quotaCheck = this.checkQuotas(schedule);
      if (!quotaCheck.allowed) {
        await this.recordSkippedExecution(
          schedule,
          ScheduleExecutionStatus.SKIPPED_QUOTA,
          job.scheduledAt,
          quotaCheck.reason,
        );
        schedule.status = ScheduleStatus.QUOTA_EXCEEDED;
        schedule.skipCount = Number(schedule.skipCount) + 1;
        await this.scheduleRepository.save(schedule);

        return {
          scheduleId: job.scheduleId,
          runId: '',
          triggeredAt: now.toISOString(),
          status: 'skipped',
          skipReason: quotaCheck.reason,
        };
      }
    }

    // Check overlap policy
    if (schedule.currentRunningCount >= schedule.maxConcurrentRuns) {
      if (schedule.overlapPolicy === ScheduleOverlapPolicy.SKIP) {
        await this.recordSkippedExecution(
          schedule,
          ScheduleExecutionStatus.SKIPPED_OVERLAP,
          job.scheduledAt,
          'Max concurrent runs reached',
        );
        schedule.skipCount = Number(schedule.skipCount) + 1;
        schedule.consecutiveSkips++;
        schedule.nextRunAt = this.calculateNextRunTime(schedule as any);
        await this.scheduleRepository.save(schedule);

        return {
          scheduleId: job.scheduleId,
          runId: '',
          triggeredAt: now.toISOString(),
          status: 'skipped',
          skipReason: 'Max concurrent runs reached',
        };
      }
    }

    // Create execution record
    const execution = this.executionRepository.create({
      tenantId: job.tenantId,
      scheduleId: job.scheduleId,
      status: job.catchup ? ScheduleExecutionStatus.CATCHUP : ScheduleExecutionStatus.TRIGGERED,
      scheduledAt: job.scheduledAt,
      triggeredAt: now,
      triggerContext: {
        triggerType: job.triggerType,
        cronExpression: job.cronExpression,
        eventId: job.eventId,
        webhookId: job.webhookId,
        manualTriggeredBy: job.manualTriggeredBy,
        catchup: job.catchup,
      },
      botVersionId: schedule.botVersionId,
      inputs: job.inputOverrides
        ? { ...schedule.inputs, ...job.inputOverrides }
        : schedule.inputs,
    });

    await this.executionRepository.save(execution);

    // Update schedule stats
    schedule.lastRunAt = now;
    schedule.lastRunId = execution.id;
    schedule.totalExecutions = Number(schedule.totalExecutions) + 1;
    schedule.consecutiveSkips = 0;
    this.incrementQuotaCounters(schedule);

    // Calculate next run
    schedule.nextRunAt = this.calculateNextRunTime(schedule as any);

    await this.scheduleRepository.save(schedule);

    this.logger.log(`Triggered schedule ${job.scheduleId}, execution ${execution.id}`);

    // TODO: Actually dispatch the run via RunsService
    return {
      scheduleId: job.scheduleId,
      runId: execution.id,
      triggeredAt: now.toISOString(),
      status: 'triggered',
    };
  }

  /**
   * Update schedule after run completes.
   */
  async onRunCompleted(
    scheduleId: string,
    runId: string,
    success: boolean,
    durationSeconds: number,
    errorMessage?: string,
  ): Promise<void> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId },
    });
    if (!schedule) return;

    // Update execution record
    const execution = await this.executionRepository.findOne({
      where: { scheduleId, runId },
    });
    if (execution) {
      execution.runCompletedAt = new Date();
      execution.durationMs = durationSeconds * 1000;
      if (!success) {
        execution.errorMessage = errorMessage;
      }
      await this.executionRepository.save(execution);
    }

    // Update schedule stats
    if (success) {
      schedule.successCount = Number(schedule.successCount) + 1;
      schedule.lastSuccessAt = new Date();
      schedule.lastSuccessRunId = runId;
      schedule.consecutiveFailures = 0;
    } else {
      schedule.failureCount = Number(schedule.failureCount) + 1;
      schedule.lastFailureAt = new Date();
      schedule.lastFailureRunId = runId;
      schedule.lastError = errorMessage;
      schedule.consecutiveFailures++;

      // Check auto-pause
      if (
        schedule.autoPauseOnFailure &&
        schedule.consecutiveFailures >= schedule.autoPauseAfterFailures
      ) {
        schedule.status = ScheduleStatus.PAUSED;
        schedule.autoPausedAt = new Date();
        schedule.pauseReason = `Auto-paused after ${schedule.consecutiveFailures} consecutive failures`;

        if (schedule.autoResumeEnabled) {
          schedule.autoResumeAt = new Date(
            Date.now() + schedule.autoResumeAfterSeconds * 1000,
          );
        }

        this.logger.warn(
          `Auto-paused schedule ${scheduleId} after ${schedule.consecutiveFailures} failures`,
        );
      }
    }

    // Update average duration
    const totalRuns = Number(schedule.successCount) + Number(schedule.failureCount);
    schedule.avgDurationSeconds =
      (schedule.avgDurationSeconds * (totalRuns - 1) + durationSeconds) / totalRuns;

    // Update concurrent run count
    schedule.currentRunningCount = Math.max(0, schedule.currentRunningCount - 1);
    schedule.activeRunIds = (schedule.activeRunIds || []).filter((id) => id !== runId);

    await this.scheduleRepository.save(schedule);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async validateTriggerConfig(dto: CreateScheduleDto): Promise<void> {
    switch (dto.triggerType) {
      case ScheduleTriggerType.CRON:
        if (!dto.cronExpression) {
          throw new BadRequestException('Cron expression is required for cron trigger');
        }
        const parser = new CronParser(dto.cronExpression, dto.timezone || 'UTC');
        if (!parser.isValid()) {
          throw new BadRequestException('Invalid cron expression');
        }
        break;

      case ScheduleTriggerType.INTERVAL:
        if (!dto.intervalMinutes || dto.intervalMinutes < 1) {
          throw new BadRequestException('Interval minutes must be at least 1');
        }
        break;

      case ScheduleTriggerType.CALENDAR:
        if (!dto.calendarDates || dto.calendarDates.dates.length === 0) {
          throw new BadRequestException('Calendar dates are required for calendar trigger');
        }
        break;

      case ScheduleTriggerType.EVENT:
      case ScheduleTriggerType.WEBHOOK:
        // These are configured via separate trigger entities
        break;

      default:
        throw new BadRequestException(`Unsupported trigger type: ${dto.triggerType}`);
    }
  }

  private async validateCanActivate(schedule: Schedule): Promise<void> {
    // Check bot exists and is active
    const bot = await this.botRepository.findOne({
      where: { id: schedule.botId },
    });
    if (!bot) {
      throw new BadRequestException('Bot not found');
    }
    if (bot.status === BotStatus.ARCHIVED) {
      throw new BadRequestException('Cannot activate schedule for archived bot');
    }

    // Check version exists if specified
    if (schedule.botVersionId) {
      const version = await this.versionRepository.findOne({
        where: { id: schedule.botVersionId },
      });
      if (!version) {
        throw new BadRequestException('Bot version not found');
      }
      if (!version.compiledPlan) {
        throw new BadRequestException('Bot version is not compiled');
      }
    } else if (!schedule.useLatestVersion && !bot.currentVersionId) {
      throw new BadRequestException('Bot has no published version');
    }
  }

  private calculateNextRunTime(schedule: CreateScheduleDto | Schedule): Date | null {
    const now = new Date();

    switch (schedule.triggerType) {
      case ScheduleTriggerType.CRON:
        if (!schedule.cronExpression) return null;
        const parser = new CronParser(
          schedule.cronExpression,
          (schedule as Schedule).timezone || 'UTC',
        );
        return parser.getNextRun(now);

      case ScheduleTriggerType.INTERVAL:
        if (!schedule.intervalMinutes) return null;
        const startTime = (schedule as any).intervalStartTime
          ? new Date((schedule as any).intervalStartTime)
          : now;
        const intervalMs = schedule.intervalMinutes * 60 * 1000;
        const elapsed = now.getTime() - startTime.getTime();
        const nextInterval = Math.ceil(elapsed / intervalMs) * intervalMs;
        return new Date(startTime.getTime() + nextInterval);

      case ScheduleTriggerType.CALENDAR:
        // Find next calendar date
        const calendarDates = (schedule as Schedule).calendarDates;
        if (!calendarDates) return null;
        // Implementation would parse dates and find next one
        return null;

      case ScheduleTriggerType.EVENT:
      case ScheduleTriggerType.WEBHOOK:
        // These don't have scheduled times
        return null;

      default:
        return null;
    }
  }

  private isInBlackoutWindow(schedule: Schedule, time: Date): boolean {
    if (!schedule.blackoutWindows?.windows?.length) {
      return false;
    }

    const timeInTz = time; // TODO: Convert to schedule timezone

    for (const window of schedule.blackoutWindows.windows) {
      const [startHour, startMin] = window.startTime.split(':').map(Number);
      const [endHour, endMin] = window.endTime.split(':').map(Number);

      const currentHour = timeInTz.getHours();
      const currentMin = timeInTz.getMinutes();
      const dayOfWeek = timeInTz.getDay();

      // Check day of week
      if (window.daysOfWeek && !window.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      // Check time range
      const currentMinutes = currentHour * 60 + currentMin;
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes <= endMinutes) {
        // Same day window
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          return true;
        }
      } else {
        // Overnight window
        if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
          return true;
        }
      }
    }

    return false;
  }

  private checkQuotas(schedule: Schedule): { allowed: boolean; reason?: string } {
    const now = new Date();

    // Reset expired counters
    this.resetExpiredQuotaCounters(schedule, now);

    // Check hourly
    if (
      schedule.maxExecutionsPerHour &&
      Number(schedule.executionsThisHour) >= schedule.maxExecutionsPerHour
    ) {
      return { allowed: false, reason: 'Hourly execution limit reached' };
    }

    // Check daily
    if (
      schedule.maxExecutionsPerDay &&
      Number(schedule.executionsThisDay) >= schedule.maxExecutionsPerDay
    ) {
      return { allowed: false, reason: 'Daily execution limit reached' };
    }

    // Check weekly
    if (
      schedule.maxExecutionsPerWeek &&
      Number(schedule.executionsThisWeek) >= schedule.maxExecutionsPerWeek
    ) {
      return { allowed: false, reason: 'Weekly execution limit reached' };
    }

    // Check monthly
    if (
      schedule.maxExecutionsPerMonth &&
      Number(schedule.executionsThisMonth) >= schedule.maxExecutionsPerMonth
    ) {
      return { allowed: false, reason: 'Monthly execution limit reached' };
    }

    // Check total
    if (
      schedule.maxTotalExecutions &&
      Number(schedule.totalExecutions) >= schedule.maxTotalExecutions
    ) {
      return { allowed: false, reason: 'Total execution limit reached' };
    }

    return { allowed: true };
  }

  private resetExpiredQuotaCounters(schedule: Schedule, now: Date): void {
    // Reset hourly
    if (!schedule.quotaResetHour || now >= schedule.quotaResetHour) {
      schedule.executionsThisHour = 0;
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      schedule.quotaResetHour = nextHour;
    }

    // Reset daily
    if (!schedule.quotaResetDay || now >= schedule.quotaResetDay) {
      schedule.executionsThisDay = 0;
      const nextDay = new Date(now);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      schedule.quotaResetDay = nextDay;
    }

    // Reset weekly
    if (!schedule.quotaResetWeek || now >= schedule.quotaResetWeek) {
      schedule.executionsThisWeek = 0;
      const nextWeek = new Date(now);
      const daysUntilMonday = (8 - nextWeek.getDay()) % 7 || 7;
      nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
      nextWeek.setHours(0, 0, 0, 0);
      schedule.quotaResetWeek = nextWeek;
    }

    // Reset monthly
    if (!schedule.quotaResetMonth || now >= schedule.quotaResetMonth) {
      schedule.executionsThisMonth = 0;
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      nextMonth.setHours(0, 0, 0, 0);
      schedule.quotaResetMonth = nextMonth;
    }
  }

  private incrementQuotaCounters(schedule: Schedule): void {
    schedule.executionsThisHour = Number(schedule.executionsThisHour) + 1;
    schedule.executionsThisDay = Number(schedule.executionsThisDay) + 1;
    schedule.executionsThisWeek = Number(schedule.executionsThisWeek) + 1;
    schedule.executionsThisMonth = Number(schedule.executionsThisMonth) + 1;
  }

  private async recordSkippedExecution(
    schedule: Schedule,
    status: ScheduleExecutionStatus,
    scheduledAt: Date,
    reason: string,
  ): Promise<void> {
    const execution = this.executionRepository.create({
      tenantId: schedule.tenantId,
      scheduleId: schedule.id,
      status,
      scheduledAt,
      triggeredAt: new Date(),
      skipReason: reason,
      triggerContext: {
        triggerType: schedule.triggerType,
        cronExpression: schedule.cronExpression || undefined,
      },
    });

    await this.executionRepository.save(execution);
  }

  private async processCatchup(schedule: Schedule): Promise<void> {
    // Implementation for catching up missed runs
    // Based on catchupPolicy, catchupWindowSeconds, maxCatchupRuns
  }

  // ============================================================================
  // DTO TRANSFORMERS
  // ============================================================================

  private toSummaryDto(schedule: Schedule): ScheduleSummaryDto {
    return {
      id: schedule.id,
      tenantId: schedule.tenantId,
      name: schedule.name,
      description: schedule.description || undefined,
      status: schedule.status,
      triggerType: schedule.triggerType,
      botId: schedule.botId,
      botName: schedule.bot?.name,
      cronExpression: schedule.cronExpression || undefined,
      timezone: schedule.timezone,
      nextRunAt: schedule.nextRunAt?.toISOString(),
      lastRunAt: schedule.lastRunAt?.toISOString(),
      totalExecutions: Number(schedule.totalExecutions),
      successCount: Number(schedule.successCount),
      failureCount: Number(schedule.failureCount),
      tags: schedule.tags || [],
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    };
  }

  private toDetailDto(
    schedule: Schedule,
    webhookCount: number,
    eventTriggerCount: number,
  ): ScheduleDetailDto {
    return {
      ...this.toSummaryDto(schedule),
      botVersionId: schedule.botVersionId || undefined,
      botVersionLabel: schedule.botVersion?.label || undefined,
      useLatestVersion: schedule.useLatestVersion,
      useDraftVersion: schedule.useDraftVersion,
      intervalMinutes: schedule.intervalMinutes || undefined,
      intervalStartTime: schedule.intervalStartTime?.toISOString(),
      calendarDates: schedule.calendarDates || undefined,
      targetType: schedule.targetType,
      targetPoolId: schedule.targetPoolId || undefined,
      targetRunnerId: schedule.targetRunnerId || undefined,
      targetCapabilities: schedule.targetCapabilities || undefined,
      targetLabels: schedule.targetLabels || undefined,
      runnerAcquireTimeoutSeconds: schedule.runnerAcquireTimeoutSeconds,
      priority: schedule.priority,
      inputs: schedule.inputs || undefined,
      environmentOverrides: schedule.environmentOverrides || undefined,
      credentialIds: schedule.credentialIds || [],
      timeoutSeconds: schedule.timeoutSeconds || undefined,
      maxRetries: schedule.maxRetries || undefined,
      overlapPolicy: schedule.overlapPolicy,
      maxConcurrentRuns: schedule.maxConcurrentRuns,
      currentRunningCount: schedule.currentRunningCount,
      activeRunIds: schedule.activeRunIds || [],
      catchupPolicy: schedule.catchupPolicy,
      catchupWindowSeconds: schedule.catchupWindowSeconds,
      maxCatchupRuns: schedule.maxCatchupRuns,
      blackoutWindows: schedule.blackoutWindows || undefined,
      maxExecutionsPerHour: schedule.maxExecutionsPerHour || undefined,
      maxExecutionsPerDay: schedule.maxExecutionsPerDay || undefined,
      maxExecutionsPerWeek: schedule.maxExecutionsPerWeek || undefined,
      maxExecutionsPerMonth: schedule.maxExecutionsPerMonth || undefined,
      maxTotalExecutions: schedule.maxTotalExecutions || undefined,
      executionsThisHour: Number(schedule.executionsThisHour),
      executionsThisDay: Number(schedule.executionsThisDay),
      executionsThisWeek: Number(schedule.executionsThisWeek),
      executionsThisMonth: Number(schedule.executionsThisMonth),
      effectiveFrom: schedule.effectiveFrom?.toISOString(),
      effectiveUntil: schedule.effectiveUntil?.toISOString(),
      autoDisableOnExpiry: schedule.autoDisableOnExpiry,
      lastSuccessAt: schedule.lastSuccessAt?.toISOString(),
      lastSuccessRunId: schedule.lastSuccessRunId || undefined,
      lastFailureAt: schedule.lastFailureAt?.toISOString(),
      lastFailureRunId: schedule.lastFailureRunId || undefined,
      lastRunId: schedule.lastRunId || undefined,
      skipCount: Number(schedule.skipCount),
      avgDurationSeconds: schedule.avgDurationSeconds,
      lastError: schedule.lastError || undefined,
      consecutiveFailures: schedule.consecutiveFailures,
      consecutiveSkips: schedule.consecutiveSkips,
      slaMaxDurationSeconds: schedule.slaMaxDurationSeconds || undefined,
      slaMaxFailureRate: schedule.slaMaxFailureRate || undefined,
      alertOnFailure: schedule.alertOnFailure,
      alertOnSlaViolation: schedule.alertOnSlaViolation,
      alertOnSkip: schedule.alertOnSkip,
      alertAfterConsecutiveFailures: schedule.alertAfterConsecutiveFailures,
      alertConfig: schedule.alertConfig || undefined,
      lastAlertAt: schedule.lastAlertAt?.toISOString(),
      autoPauseOnFailure: schedule.autoPauseOnFailure,
      autoPauseAfterFailures: schedule.autoPauseAfterFailures,
      autoResumeEnabled: schedule.autoResumeEnabled,
      autoResumeAfterSeconds: schedule.autoResumeAfterSeconds,
      autoPausedAt: schedule.autoPausedAt?.toISOString(),
      autoResumeAt: schedule.autoResumeAt?.toISOString(),
      createdBy: schedule.createdBy,
      creatorName: schedule.creator?.email,
      updatedBy: schedule.updatedBy || undefined,
      ownerId: schedule.ownerId || undefined,
      ownerName: schedule.owner?.email,
      metadata: schedule.metadata || undefined,
      notes: schedule.notes || undefined,
      pauseReason: schedule.pauseReason || undefined,
      disableReason: schedule.disableReason || undefined,
      activatedAt: schedule.activatedAt?.toISOString(),
      pausedAt: schedule.pausedAt?.toISOString(),
      disabledAt: schedule.disabledAt?.toISOString(),
      webhookTriggerCount: webhookCount,
      eventTriggerCount: eventTriggerCount,
    };
  }

  private toExecutionDto(execution: ScheduleExecution): ScheduleExecutionDto {
    return {
      id: execution.id,
      scheduleId: execution.scheduleId,
      status: execution.status,
      runId: execution.runId || undefined,
      scheduledAt: execution.scheduledAt.toISOString(),
      triggeredAt: execution.triggeredAt.toISOString(),
      runStartedAt: execution.runStartedAt?.toISOString(),
      runCompletedAt: execution.runCompletedAt?.toISOString(),
      durationMs: execution.durationMs || undefined,
      skipReason: execution.skipReason || undefined,
      errorMessage: execution.errorMessage || undefined,
      triggerContext: execution.triggerContext || undefined,
      runnerInfo: execution.runnerInfo || undefined,
      botVersionId: execution.botVersionId || undefined,
      inputs: execution.inputs || undefined,
      createdAt: execution.createdAt.toISOString(),
    };
  }

  private toWebhookDto(webhook: WebhookTrigger): WebhookTriggerDto {
    return {
      id: webhook.id,
      scheduleId: webhook.scheduleId,
      name: webhook.name,
      description: webhook.description || undefined,
      token: webhook.token,
      webhookUrl: `/api/webhooks/${webhook.token}`, // Placeholder URL
      requireSignature: webhook.requireSignature,
      hasSecret: !!webhook.secret,
      allowedIps: webhook.allowedIps || undefined,
      requiredHeaders: webhook.requiredHeaders || undefined,
      status: webhook.status,
      maxCallsPerMinute: webhook.maxCallsPerMinute || undefined,
      maxCallsPerHour: webhook.maxCallsPerHour || undefined,
      callsThisMinute: webhook.callsThisMinute,
      callsThisHour: webhook.callsThisHour,
      inputMapping: webhook.inputMapping || undefined,
      validatePayload: webhook.validatePayload,
      expiresAt: webhook.expiresAt?.toISOString(),
      maxCalls: webhook.maxCalls || undefined,
      totalCalls: Number(webhook.totalCalls),
      lastCalledAt: webhook.lastCalledAt?.toISOString(),
      lastCallerIp: webhook.lastCallerIp || undefined,
      successCount: Number(webhook.successCount),
      failureCount: Number(webhook.failureCount),
      createdAt: webhook.createdAt.toISOString(),
      createdBy: webhook.createdBy,
    };
  }

  private toEventTriggerDto(trigger: EventTrigger): EventTriggerDto {
    return {
      id: trigger.id,
      scheduleId: trigger.scheduleId,
      name: trigger.name,
      description: trigger.description || undefined,
      sourceType: trigger.sourceType,
      sourceBotId: trigger.sourceBotId || undefined,
      sourceStatusFilter: trigger.sourceStatusFilter || undefined,
      watchPath: trigger.watchPath || undefined,
      filePatterns: trigger.filePatterns || undefined,
      queueName: trigger.queueName || undefined,
      queueUrl: trigger.queueUrl || undefined,
      emailAddress: trigger.emailAddress || undefined,
      emailFilters: trigger.emailFilters || undefined,
      eventType: trigger.eventType || undefined,
      eventFilter: trigger.eventFilter || undefined,
      debounceSeconds: trigger.debounceSeconds,
      inputMapping: trigger.inputMapping || undefined,
      enabled: trigger.enabled,
      disabledReason: trigger.disabledReason || undefined,
      lastTriggeredAt: trigger.lastTriggeredAt?.toISOString(),
      createdAt: trigger.createdAt.toISOString(),
      createdBy: trigger.createdBy,
    };
  }
}
