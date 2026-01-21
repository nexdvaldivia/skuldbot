import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, LessThan, MoreThan, Like, IsNull, Not } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  Run,
  RunStatus,
  RunTriggerType,
  RunPriority,
  RunEvent,
  RunEventType,
  EventSeverity,
  RunArtifact,
  ArtifactType,
  RunLog,
  LogLevel,
  HitlRequest,
  HitlRequestStatus,
  HitlActionType,
} from './entities/run.entity';
import { Bot, BotVersion, BotStatus, VersionStatus } from '../bots/entities/bot.entity';
import { BotsService } from '../bots/bots.service';
import { User } from '../users/entities/user.entity';
import {
  CreateRunDto,
  CancelRunDto,
  PauseRunDto,
  ResumeRunDto,
  RetryRunDto,
  HitlActionDto,
  CreateHitlRequestDto,
  ListRunsQueryDto,
  ListRunEventsQueryDto,
  ListRunLogsQueryDto,
  ListHitlRequestsQueryDto,
  RunSummaryDto,
  RunDetailDto,
  RunEventDto,
  RunLogDto,
  RunArtifactDto,
  HitlRequestDto,
  PaginatedRunsDto,
  PaginatedRunEventsDto,
  PaginatedRunLogsDto,
  PaginatedHitlRequestsDto,
  RunStatsDto,
  RunTimelineStatsDto,
  BotRunStatsDto,
  ExecuteRunJobDto,
  UpdateRunProgressDto,
  CompleteRunDto,
  AddRunEventDto,
  AddRunLogDto,
  AddRunArtifactDto,
} from './dto/run.dto';
import {
  RUN_QUEUE,
  JOB_EXECUTE_RUN,
  DEFAULT_JOB_OPTIONS,
  RUN_MAX_DURATION_MS,
} from './runs.constants';

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(RunEvent)
    private readonly eventRepository: Repository<RunEvent>,
    @InjectRepository(RunArtifact)
    private readonly artifactRepository: Repository<RunArtifact>,
    @InjectRepository(RunLog)
    private readonly logRepository: Repository<RunLog>,
    @InjectRepository(HitlRequest)
    private readonly hitlRepository: Repository<HitlRequest>,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
    @InjectRepository(Bot)
    private readonly botRepository: Repository<Bot>,
    @InjectQueue(RUN_QUEUE)
    private readonly runQueue: Queue,
    private readonly botsService: BotsService,
  ) {}

  // ============================================================================
  // RUN CREATION & MANAGEMENT
  // ============================================================================

  /**
   * Create and queue a new run.
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateRunDto,
  ): Promise<RunDetailDto> {
    // Check tenant quotas
    await this.checkRunQuota(tenantId);

    // Get bot and version
    const { bot, version } = await this.resolveBotVersion(tenantId, dto.botId, dto.versionId);

    // Validate bot is executable
    if (bot.status === BotStatus.ARCHIVED) {
      throw new BadRequestException('Cannot run an archived bot');
    }

    if (version.status !== VersionStatus.PUBLISHED && version.status !== VersionStatus.COMPILED) {
      throw new BadRequestException(
        `Version ${version.id} is not published or compiled. Status: ${version.status}`,
      );
    }

    if (!version.compiledPlan) {
      throw new BadRequestException(
        `Version ${version.id} is not compiled. Compile it first.`,
      );
    }

    // Calculate timeout
    const timeoutSeconds = dto.timeoutSeconds ?? bot.timeoutSeconds ?? 3600;
    const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000);

    // Get parent run depth
    let depth = 0;
    let rootRunId: string | null = null;
    if (dto.parentRunId) {
      const parentRun = await this.runRepository.findOne({
        where: { id: dto.parentRunId, tenantId },
      });
      if (!parentRun) {
        throw new NotFoundException(`Parent run ${dto.parentRunId} not found`);
      }
      depth = parentRun.depth + 1;
      rootRunId = parentRun.rootRunId ?? parentRun.id;

      // Limit nesting depth
      if (depth > 10) {
        throw new BadRequestException('Maximum run nesting depth exceeded (10)');
      }
    }

    // Create run record
    const run = this.runRepository.create({
      tenantId,
      botId: bot.id,
      botVersionId: version.id,
      botName: bot.name,
      botVersionLabel: version.label ?? version.version,
      status: RunStatus.PENDING,
      priority: dto.priority ?? RunPriority.NORMAL,
      triggerType: dto.triggerType ?? RunTriggerType.API,
      triggeredBy: userId,
      parentRunId: dto.parentRunId,
      depth,
      rootRunId,
      scheduleId: dto.scheduleId,
      scheduleExecutionId: dto.scheduleExecutionId,
      inputs: dto.inputs,
      planHash: version.planHash,
      policyPackVersion: version.metadata?.policyPackVersion,
      totalSteps: version.nodeCount ?? 0,
      timeoutSeconds,
      timeoutAt,
      maxRetries: dto.retry?.maxRetries ?? bot.maxRetries ?? 0,
      retryDelaySeconds: dto.retry?.retryDelaySeconds ?? bot.retryDelaySeconds ?? 60,
      retryBackoffMultiplier: dto.retry?.backoffMultiplier ?? 2.0,
      retryMaxDelaySeconds: dto.retry?.maxDelaySeconds ?? 3600,
      runnerPoolId: dto.runnerPoolId ?? bot.runnerGroupId,
      runnerTags: dto.runnerTags ?? [],
      hitlConfig: dto.hitlConfig,
      requiresApproval: dto.hitlConfig?.enabled ?? false,
      notificationConfig: dto.notifications,
      tags: dto.tags ?? [],
      labels: dto.labels,
      metadata: dto.metadata,
      notes: dto.notes,
      billable: dto.billable ?? true,
      billingCategory: dto.billingCategory,
    });

    await this.runRepository.save(run);

    this.logger.log(
      `Created run ${run.id} for bot ${bot.name} (${bot.id}) version ${version.version}`,
    );

    // Queue the run
    await this.queueRun(run);

    return this.toDetailDto(run);
  }

  /**
   * Queue a run for execution.
   */
  private async queueRun(run: Run): Promise<void> {
    // Update status to queued
    run.status = RunStatus.QUEUED;
    run.queuedAt = new Date();
    await this.runRepository.save(run);

    // Add run queued event
    await this.addEvent({
      tenantId: run.tenantId,
      runId: run.id,
      eventType: RunEventType.RUN_QUEUED,
      severity: EventSeverity.INFO,
      message: `Run queued with priority ${run.priority}`,
      timestamp: run.queuedAt,
    });

    // Create job data
    const jobData: ExecuteRunJobDto = {
      runId: run.id,
      tenantId: run.tenantId,
      botId: run.botId,
      botVersionId: run.botVersionId,
      planHash: run.planHash,
      policyPackVersion: run.policyPackVersion,
      priority: run.priority,
      timeoutSeconds: run.timeoutSeconds,
      inputs: run.inputs,
      context: run.context,
      retryCount: run.retryCount,
      maxRetries: run.maxRetries,
    };

    // Add to queue with priority
    await this.runQueue.add(JOB_EXECUTE_RUN, jobData, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: run.id,
      priority: run.priority,
      delay: run.nextRetryAt ? run.nextRetryAt.getTime() - Date.now() : 0,
    });

    this.logger.log(`Queued run ${run.id} with priority ${run.priority}`);
  }

  /**
   * Get all runs for a tenant with filtering.
   */
  async findAll(
    tenantId: string,
    query: ListRunsQueryDto,
  ): Promise<PaginatedRunsDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.runRepository
      .createQueryBuilder('run')
      .where('run.tenantId = :tenantId', { tenantId });

    // Apply filters
    if (query.botId) {
      qb.andWhere('run.botId = :botId', { botId: query.botId });
    }

    if (query.versionId) {
      qb.andWhere('run.botVersionId = :versionId', { versionId: query.versionId });
    }

    if (query.status) {
      qb.andWhere('run.status = :status', { status: query.status });
    } else if (query.statuses?.length) {
      qb.andWhere('run.status IN (:...statuses)', { statuses: query.statuses });
    }

    if (query.triggerType) {
      qb.andWhere('run.triggerType = :triggerType', { triggerType: query.triggerType });
    }

    if (query.priority) {
      qb.andWhere('run.priority = :priority', { priority: query.priority });
    }

    if (query.runnerId) {
      qb.andWhere('run.runnerId = :runnerId', { runnerId: query.runnerId });
    }

    if (query.runnerPoolId) {
      qb.andWhere('run.runnerPoolId = :runnerPoolId', { runnerPoolId: query.runnerPoolId });
    }

    if (query.scheduleId) {
      qb.andWhere('run.scheduleId = :scheduleId', { scheduleId: query.scheduleId });
    }

    if (query.parentRunId) {
      qb.andWhere('run.parentRunId = :parentRunId', { parentRunId: query.parentRunId });
    }

    if (query.topLevelOnly) {
      qb.andWhere('run.parentRunId IS NULL');
    }

    if (query.triggeredBy) {
      qb.andWhere('run.triggeredBy = :triggeredBy', { triggeredBy: query.triggeredBy });
    }

    if (query.startDate) {
      qb.andWhere('run.createdAt >= :startDate', { startDate: new Date(query.startDate) });
    }

    if (query.endDate) {
      qb.andWhere('run.createdAt <= :endDate', { endDate: new Date(query.endDate) });
    }

    if (query.tags?.length) {
      qb.andWhere('run.tags @> :tags', { tags: JSON.stringify(query.tags) });
    }

    if (query.labelKey && query.labelValue) {
      qb.andWhere(`run.labels->>'${query.labelKey}' = :labelValue`, { labelValue: query.labelValue });
    }

    if (query.search) {
      qb.andWhere(
        '(run.botName ILIKE :search OR run.notes ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    // Sort
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'DESC';
    qb.orderBy(`run.${sortBy}`, sortOrder);

    // Pagination
    qb.skip(offset).take(limit);

    // Include relations
    if (query.includeBot) {
      qb.leftJoinAndSelect('run.bot', 'bot');
    }
    if (query.includeRunner) {
      qb.leftJoinAndSelect('run.runner', 'runner');
    }

    const [runs, total] = await qb.getManyAndCount();

    return {
      runs: runs.map((r) => this.toSummaryDto(r)),
      total,
      limit,
      offset,
      hasMore: offset + runs.length < total,
    };
  }

  /**
   * Get a single run by ID.
   */
  async findOne(tenantId: string, runId: string): Promise<RunDetailDto> {
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
      relations: ['bot', 'botVersion', 'runner'],
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Get additional counts
    const [eventCount, artifactCount, childRunCount] = await Promise.all([
      this.eventRepository.count({ where: { runId } }),
      this.artifactRepository.count({ where: { runId } }),
      this.runRepository.count({ where: { parentRunId: runId } }),
    ]);

    const dto = this.toDetailDto(run);
    dto.eventCount = eventCount;
    dto.artifactCount = artifactCount;
    dto.childRunCount = childRunCount;

    return dto;
  }

  /**
   * Cancel a run.
   */
  async cancel(
    tenantId: string,
    runId: string,
    userId: string,
    dto: CancelRunDto,
  ): Promise<RunDetailDto> {
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Check if cancellable
    const cancellableStatuses = [
      RunStatus.PENDING,
      RunStatus.QUEUED,
      RunStatus.LEASED,
      RunStatus.RUNNING,
      RunStatus.PAUSED,
      RunStatus.WAITING_APPROVAL,
      RunStatus.RETRY_SCHEDULED,
    ];

    if (!cancellableStatuses.includes(run.status)) {
      throw new BadRequestException(`Cannot cancel run in status ${run.status}`);
    }

    // Update run
    const now = new Date();
    run.status = RunStatus.CANCELLED;
    run.completedAt = now;
    run.cancelledAt = now;
    run.cancelledBy = userId;
    run.errorMessage = dto.reason ?? 'Cancelled by user';

    if (run.queuedAt) {
      run.queueDurationMs = (run.startedAt ?? now).getTime() - run.queuedAt.getTime();
    }
    if (run.startedAt) {
      run.executionDurationMs = now.getTime() - run.startedAt.getTime();
    }
    run.totalDurationMs = now.getTime() - run.createdAt.getTime();

    await this.runRepository.save(run);

    // Add cancellation event
    await this.addEvent({
      tenantId,
      runId,
      eventType: RunEventType.RUN_CANCELLED,
      severity: EventSeverity.WARNING,
      message: dto.reason ?? 'Cancelled by user',
      timestamp: now,
    });

    // Remove from queue if still queued
    try {
      const job = await this.runQueue.getJob(runId);
      if (job) {
        await job.remove();
      }
    } catch (error) {
      this.logger.warn(`Failed to remove job ${runId} from queue: ${error}`);
    }

    // Cancel child runs if requested
    if (dto.cancelChildRuns) {
      const childRuns = await this.runRepository.find({
        where: {
          parentRunId: runId,
          status: In(cancellableStatuses),
        },
      });

      for (const childRun of childRuns) {
        await this.cancel(tenantId, childRun.id, userId, {
          reason: `Parent run ${runId} was cancelled`,
        });
      }
    }

    this.logger.log(`Cancelled run ${runId}`);

    return this.toDetailDto(run);
  }

  /**
   * Pause a running run.
   */
  async pause(
    tenantId: string,
    runId: string,
    userId: string,
    dto: PauseRunDto,
  ): Promise<RunDetailDto> {
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status !== RunStatus.RUNNING) {
      throw new BadRequestException(`Can only pause running runs. Current status: ${run.status}`);
    }

    run.status = RunStatus.PAUSED;
    run.pausedAt = new Date();

    await this.runRepository.save(run);

    await this.addEvent({
      tenantId,
      runId,
      eventType: RunEventType.RUN_PAUSED,
      severity: EventSeverity.INFO,
      message: dto.reason ?? 'Paused by user',
      timestamp: run.pausedAt,
    });

    this.logger.log(`Paused run ${runId}`);

    return this.toDetailDto(run);
  }

  /**
   * Resume a paused run.
   */
  async resume(
    tenantId: string,
    runId: string,
    userId: string,
    dto: ResumeRunDto,
  ): Promise<RunDetailDto> {
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status !== RunStatus.PAUSED) {
      throw new BadRequestException(`Can only resume paused runs. Current status: ${run.status}`);
    }

    run.status = RunStatus.RUNNING;
    run.resumedAt = new Date();

    if (dto.modifiedInputs) {
      run.inputs = { ...run.inputs, ...dto.modifiedInputs };
    }

    await this.runRepository.save(run);

    await this.addEvent({
      tenantId,
      runId,
      eventType: RunEventType.RUN_RESUMED,
      severity: EventSeverity.INFO,
      message: 'Resumed by user',
      timestamp: run.resumedAt,
    });

    this.logger.log(`Resumed run ${runId}`);

    return this.toDetailDto(run);
  }

  /**
   * Retry a failed run.
   */
  async retry(
    tenantId: string,
    runId: string,
    userId: string,
    dto: RetryRunDto,
  ): Promise<RunDetailDto> {
    const originalRun = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!originalRun) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Check if can retry
    const retryableStatuses = [RunStatus.FAILED, RunStatus.TIMED_OUT, RunStatus.REJECTED];
    if (!retryableStatuses.includes(originalRun.status)) {
      throw new BadRequestException(
        `Cannot retry run in status ${originalRun.status}. Must be failed, timed out, or rejected.`,
      );
    }

    // Create new run based on original
    const createDto: CreateRunDto = {
      botId: originalRun.botId,
      versionId: originalRun.botVersionId,
      triggerType: RunTriggerType.RETRY,
      priority: dto.priority ?? originalRun.priority,
      inputs: dto.inputs ?? originalRun.inputs,
      parentRunId: originalRun.parentRunId,
      scheduleId: originalRun.scheduleId,
      tags: originalRun.tags,
      labels: originalRun.labels,
      metadata: {
        ...originalRun.metadata,
        retriedFromRunId: runId,
        retryAttempt: (originalRun.retryCount ?? 0) + 1,
      },
    };

    return this.create(tenantId, userId, createDto);
  }

  // ============================================================================
  // RUN EVENTS
  // ============================================================================

  /**
   * Get events for a run.
   */
  async getEvents(
    tenantId: string,
    runId: string,
    query: ListRunEventsQueryDto,
  ): Promise<PaginatedRunEventsDto> {
    // Verify run exists
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const qb = this.eventRepository
      .createQueryBuilder('event')
      .where('event.runId = :runId', { runId });

    if (query.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: query.eventType });
    } else if (query.eventTypes?.length) {
      qb.andWhere('event.eventType IN (:...eventTypes)', { eventTypes: query.eventTypes });
    }

    if (query.severity) {
      qb.andWhere('event.severity = :severity', { severity: query.severity });
    }

    if (query.stepId) {
      qb.andWhere('event.stepId = :stepId', { stepId: query.stepId });
    }

    if (query.nodeId) {
      qb.andWhere('event.nodeId = :nodeId', { nodeId: query.nodeId });
    }

    if (query.startDate) {
      qb.andWhere('event.createdAt >= :startDate', { startDate: new Date(query.startDate) });
    }

    if (query.endDate) {
      qb.andWhere('event.createdAt <= :endDate', { endDate: new Date(query.endDate) });
    }

    qb.orderBy('event.createdAt', 'ASC');
    qb.skip(offset).take(limit);

    const [events, total] = await qb.getManyAndCount();

    return {
      events: events.map((e) => this.toEventDto(e)),
      total,
      limit,
      offset,
      hasMore: offset + events.length < total,
    };
  }

  /**
   * Add an event to a run (internal method for processors).
   */
  async addEvent(data: any): Promise<RunEvent> {
    const timestamp = data.timestamp instanceof Date
      ? data.timestamp
      : data.timestamp
        ? new Date(data.timestamp)
        : new Date();

    const event = this.eventRepository.create({
      ...data,
      timestamp,
    });
    return this.eventRepository.save(event) as unknown as Promise<RunEvent>;
  }

  // ============================================================================
  // RUN LOGS
  // ============================================================================

  /**
   * Get logs for a run.
   */
  async getLogs(
    tenantId: string,
    runId: string,
    query: ListRunLogsQueryDto,
  ): Promise<PaginatedRunLogsDto> {
    // Verify run exists
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const limit = query.limit ?? 1000;
    const offset = query.offset ?? 0;

    const qb = this.logRepository
      .createQueryBuilder('log')
      .where('log.runId = :runId', { runId });

    if (query.level) {
      qb.andWhere('log.level = :level', { level: query.level });
    } else if (query.levels?.length) {
      qb.andWhere('log.level IN (:...levels)', { levels: query.levels });
    }

    if (query.stepId) {
      qb.andWhere('log.stepId = :stepId', { stepId: query.stepId });
    }

    if (query.nodeId) {
      qb.andWhere('log.nodeId = :nodeId', { nodeId: query.nodeId });
    }

    if (query.source) {
      qb.andWhere('log.source = :source', { source: query.source });
    }

    if (query.search) {
      qb.andWhere('log.message ILIKE :search', { search: `%${query.search}%` });
    }

    if (query.startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate: new Date(query.startDate) });
    }

    if (query.endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate: new Date(query.endDate) });
    }

    qb.orderBy('log.createdAt', 'ASC');
    qb.skip(offset).take(limit);

    const [logs, total] = await qb.getManyAndCount();

    return {
      logs: logs.map((l) => this.toLogDto(l)),
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    };
  }

  /**
   * Add a log entry to a run (internal method for processors).
   */
  async addLog(runId: string, tenantId: string, data: AddRunLogDto): Promise<RunLog> {
    const log = this.logRepository.create({
      runId,
      tenantId,
      ...data,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    });
    return this.logRepository.save(log);
  }

  // ============================================================================
  // RUN ARTIFACTS
  // ============================================================================

  /**
   * Get artifacts for a run.
   */
  async getArtifacts(tenantId: string, runId: string): Promise<RunArtifactDto[]> {
    // Verify run exists
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const artifacts = await this.artifactRepository.find({
      where: { runId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    return artifacts.map((a) => this.toArtifactDto(a));
  }

  /**
   * Get a single artifact.
   */
  async getArtifact(tenantId: string, runId: string, artifactId: string): Promise<RunArtifactDto> {
    const artifact = await this.artifactRepository.findOne({
      where: { id: artifactId, runId, tenantId, deletedAt: IsNull() },
    });

    if (!artifact) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }

    return this.toArtifactDto(artifact);
  }

  /**
   * Add an artifact to a run (internal method for processors).
   */
  async addArtifact(runId: string, tenantId: string, data: AddRunArtifactDto): Promise<RunArtifact> {
    const artifact = this.artifactRepository.create({
      runId,
      tenantId,
      ...data,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
    return this.artifactRepository.save(artifact);
  }

  // ============================================================================
  // HITL (Human In The Loop)
  // ============================================================================

  /**
   * Get HITL requests.
   */
  async getHitlRequests(
    tenantId: string,
    userId: string,
    query: ListHitlRequestsQueryDto,
  ): Promise<PaginatedHitlRequestsDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.hitlRepository
      .createQueryBuilder('req')
      .where('req.tenantId = :tenantId', { tenantId });

    if (query.runId) {
      qb.andWhere('req.runId = :runId', { runId: query.runId });
    }

    if (query.status) {
      qb.andWhere('req.status = :status', { status: query.status });
    } else if (query.statuses?.length) {
      qb.andWhere('req.status IN (:...statuses)', { statuses: query.statuses });
    }

    if (query.assignedTo) {
      qb.andWhere('req.assignedTo = :assignedTo', { assignedTo: query.assignedTo });
    } else if (query.assignedToMe) {
      qb.andWhere('(req.assignedTo = :userId OR req.approverIds @> :userIdArray)', {
        userId,
        userIdArray: JSON.stringify([userId]),
      });
    }

    if (query.overdueOnly) {
      qb.andWhere('req.deadline < :now AND req.status = :pending', {
        now: new Date(),
        pending: HitlRequestStatus.PENDING,
      });
    }

    if (query.urgency) {
      qb.andWhere('req.urgency = :urgency', { urgency: query.urgency });
    }

    qb.orderBy('req.createdAt', 'DESC');
    qb.skip(offset).take(limit);

    const [requests, total] = await qb.getManyAndCount();

    return {
      requests: requests.map((r) => this.toHitlRequestDto(r)),
      total,
      limit,
      offset,
      hasMore: offset + requests.length < total,
    };
  }

  /**
   * Get a single HITL request.
   */
  async getHitlRequest(tenantId: string, requestId: string): Promise<HitlRequestDto> {
    const request = await this.hitlRepository.findOne({
      where: { id: requestId, tenantId },
      relations: ['assignee', 'resolver'],
    });

    if (!request) {
      throw new NotFoundException(`HITL request ${requestId} not found`);
    }

    return this.toHitlRequestDto(request);
  }

  /**
   * Create a HITL request (internal method for processors).
   */
  async createHitlRequest(
    runId: string,
    tenantId: string,
    data: CreateHitlRequestDto,
  ): Promise<HitlRequest> {
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const request = this.hitlRepository.create({
      runId,
      tenantId,
      ...data,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      allowedActions: data.allowedActions ?? [HitlActionType.APPROVE, HitlActionType.REJECT],
    });

    await this.hitlRepository.save(request);

    // Update run status
    run.status = RunStatus.WAITING_APPROVAL;
    run.requiresApproval = true;
    run.approvalRequestedAt = new Date();
    run.hitlState = {
      pendingApproval: true,
      stepId: data.stepId,
      nodeId: data.nodeId,
      nodeType: data.nodeType,
      requestedAt: new Date().toISOString(),
      requestedData: data.requestData,
    };
    await this.runRepository.save(run);

    // Add HITL event
    await this.addEvent({
      tenantId,
      runId,
      eventType: RunEventType.HITL_REQUESTED,
      severity: data.urgency ?? EventSeverity.INFO,
      stepId: data.stepId,
      nodeId: data.nodeId,
      nodeType: data.nodeType,
      message: data.title,
      payload: { requestId: request.id, requestData: data.requestData },
    });

    return request;
  }

  /**
   * Process a HITL action (approve, reject, modify, etc.).
   */
  async processHitlAction(
    tenantId: string,
    requestId: string,
    userId: string,
    dto: HitlActionDto,
  ): Promise<HitlRequestDto> {
    const request = await this.hitlRepository.findOne({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException(`HITL request ${requestId} not found`);
    }

    if (request.status !== HitlRequestStatus.PENDING) {
      throw new BadRequestException(`Request already resolved with status ${request.status}`);
    }

    // Check if user can process this request
    if (request.approverIds.length > 0 && !request.approverIds.includes(userId)) {
      if (request.assignedTo && request.assignedTo !== userId) {
        throw new ForbiddenException('You are not authorized to process this request');
      }
    }

    // Validate action
    if (!request.allowedActions.includes(dto.action)) {
      throw new BadRequestException(
        `Action ${dto.action} is not allowed. Allowed: ${request.allowedActions.join(', ')}`,
      );
    }

    if (dto.action === HitlActionType.MODIFY && !request.dataModificationAllowed) {
      throw new BadRequestException('Data modification is not allowed for this request');
    }

    // Update request
    const now = new Date();
    request.action = dto.action;
    request.resolvedBy = userId;
    request.resolvedAt = now;
    request.resolutionComments = dto.comments;

    // Map action to status
    switch (dto.action) {
      case HitlActionType.APPROVE:
        request.status = HitlRequestStatus.APPROVED;
        break;
      case HitlActionType.REJECT:
        request.status = HitlRequestStatus.REJECTED;
        break;
      case HitlActionType.MODIFY:
        request.status = HitlRequestStatus.MODIFIED;
        request.modifiedData = dto.modifiedData;
        break;
      case HitlActionType.ESCALATE:
        request.status = HitlRequestStatus.ESCALATED;
        request.escalatedAt = now;
        break;
      default:
        request.status = HitlRequestStatus.APPROVED;
    }

    // Add to audit trail
    request.auditTrail = [
      ...(request.auditTrail ?? []),
      {
        action: dto.action,
        userId,
        timestamp: now.toISOString(),
        comments: dto.comments,
        data: dto.modifiedData,
      },
    ];

    await this.hitlRepository.save(request);

    // Update run based on action
    const run = await this.runRepository.findOne({
      where: { id: request.runId },
    });

    if (run) {
      run.hitlState = {
        ...run.hitlState,
        pendingApproval: false,
        approvedBy: dto.action === HitlActionType.APPROVE ? userId : undefined,
        approvedAt: dto.action === HitlActionType.APPROVE ? now.toISOString() : undefined,
        rejectedBy: dto.action === HitlActionType.REJECT ? userId : undefined,
        rejectedAt: dto.action === HitlActionType.REJECT ? now.toISOString() : undefined,
        action: dto.action,
        comments: dto.comments,
        modifiedData: dto.modifiedData,
      };

      if (dto.action === HitlActionType.APPROVE || dto.action === HitlActionType.MODIFY) {
        run.status = RunStatus.RUNNING;
        run.requiresApproval = false;
      } else if (dto.action === HitlActionType.REJECT) {
        run.status = RunStatus.REJECTED;
        run.completedAt = now;
        run.errorMessage = dto.comments ?? 'Rejected by human reviewer';
      }

      await this.runRepository.save(run);

      // Add event
      const eventType = dto.action === HitlActionType.APPROVE
        ? RunEventType.HITL_APPROVED
        : dto.action === HitlActionType.REJECT
          ? RunEventType.HITL_REJECTED
          : dto.action === HitlActionType.MODIFY
            ? RunEventType.HITL_MODIFIED
            : RunEventType.HITL_ESCALATED;

      await this.addEvent({
        tenantId,
        runId: run.id,
        eventType,
        severity: dto.action === HitlActionType.REJECT ? EventSeverity.WARNING : EventSeverity.INFO,
        stepId: request.stepId,
        nodeId: request.nodeId,
        message: `HITL request ${dto.action} by user`,
        payload: { requestId, comments: dto.comments },
      });
    }

    this.logger.log(`HITL request ${requestId} processed: ${dto.action}`);

    return this.toHitlRequestDto(request);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get run statistics for a tenant.
   */
  async getStats(tenantId: string, botId?: string): Promise<RunStatsDto> {
    const qb = this.runRepository
      .createQueryBuilder('run')
      .where('run.tenantId = :tenantId', { tenantId });

    if (botId) {
      qb.andWhere('run.botId = :botId', { botId });
    }

    const statusCounts = await qb
      .clone()
      .select('run.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('run.status')
      .getRawMany();

    const performanceStats = await qb
      .clone()
      .select('AVG(run.queueDurationMs)', 'avgQueue')
      .addSelect('AVG(run.executionDurationMs)', 'avgExecution')
      .addSelect('AVG(run.totalDurationMs)', 'avgTotal')
      .where('run.status = :succeeded', { succeeded: RunStatus.SUCCEEDED })
      .getRawOne();

    const result: RunStatsDto = {
      total: 0,
      pending: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      timedOut: 0,
      waitingApproval: 0,
    };

    for (const stat of statusCounts) {
      const count = parseInt(stat.count, 10);
      result.total += count;

      switch (stat.status) {
        case RunStatus.PENDING:
          result.pending = count;
          break;
        case RunStatus.QUEUED:
        case RunStatus.LEASED:
          result.queued += count;
          break;
        case RunStatus.RUNNING:
        case RunStatus.PAUSED:
          result.running += count;
          break;
        case RunStatus.SUCCEEDED:
          result.succeeded = count;
          break;
        case RunStatus.FAILED:
        case RunStatus.REJECTED:
          result.failed += count;
          break;
        case RunStatus.CANCELLED:
          result.cancelled = count;
          break;
        case RunStatus.TIMED_OUT:
          result.timedOut = count;
          break;
        case RunStatus.WAITING_APPROVAL:
          result.waitingApproval = count;
          break;
      }
    }

    if (performanceStats) {
      result.avgQueueDurationMs = performanceStats.avgQueue
        ? Math.round(parseFloat(performanceStats.avgQueue))
        : undefined;
      result.avgExecutionDurationMs = performanceStats.avgExecution
        ? Math.round(parseFloat(performanceStats.avgExecution))
        : undefined;
      result.avgTotalDurationMs = performanceStats.avgTotal
        ? Math.round(parseFloat(performanceStats.avgTotal))
        : undefined;
    }

    const completedRuns = result.succeeded + result.failed + result.timedOut;
    if (completedRuns > 0) {
      result.successRate = Math.round((result.succeeded / completedRuns) * 10000) / 100;
    }

    return result;
  }

  /**
   * Get run timeline statistics.
   */
  async getTimelineStats(
    tenantId: string,
    period: 'hour' | 'day' | 'week',
    botId?: string,
  ): Promise<RunTimelineStatsDto> {
    const intervals = period === 'hour' ? 24 : period === 'day' ? 30 : 12;
    const intervalMs = period === 'hour' ? 3600000 : period === 'day' ? 86400000 : 604800000;

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - intervals * intervalMs);

    const qb = this.runRepository
      .createQueryBuilder('run')
      .where('run.tenantId = :tenantId', { tenantId })
      .andWhere('run.createdAt >= :startTime', { startTime })
      .andWhere('run.createdAt <= :endTime', { endTime });

    if (botId) {
      qb.andWhere('run.botId = :botId', { botId });
    }

    const runs = await qb.getMany();

    // Group by interval
    const data: RunTimelineStatsDto['data'] = [];
    for (let i = 0; i < intervals; i++) {
      const intervalStart = new Date(startTime.getTime() + i * intervalMs);
      const intervalEnd = new Date(intervalStart.getTime() + intervalMs);

      const intervalRuns = runs.filter(
        (r) => r.createdAt >= intervalStart && r.createdAt < intervalEnd,
      );

      const succeeded = intervalRuns.filter((r) => r.status === RunStatus.SUCCEEDED).length;
      const failed = intervalRuns.filter(
        (r) => r.status === RunStatus.FAILED || r.status === RunStatus.TIMED_OUT,
      ).length;
      const cancelled = intervalRuns.filter((r) => r.status === RunStatus.CANCELLED).length;

      const completedRuns = intervalRuns.filter((r) => r.totalDurationMs != null);
      const avgDurationMs = completedRuns.length > 0
        ? Math.round(
            completedRuns.reduce((sum, r) => sum + (r.totalDurationMs ?? 0), 0) / completedRuns.length,
          )
        : undefined;

      data.push({
        timestamp: intervalStart.toISOString(),
        total: intervalRuns.length,
        succeeded,
        failed,
        cancelled,
        avgDurationMs,
      });
    }

    return { period, data };
  }

  // ============================================================================
  // INTERNAL METHODS (for job processors)
  // ============================================================================

  /**
   * Lease a run (mark as picked up by a runner).
   */
  async leaseRun(runId: string, runnerId: string, runnerName?: string): Promise<Run | null> {
    const run = await this.runRepository.findOne({
      where: { id: runId, status: RunStatus.QUEUED },
    });

    if (!run) {
      return null;
    }

    const now = new Date();
    run.status = RunStatus.LEASED;
    run.runnerId = runnerId;
    run.runnerName = runnerName;
    run.leasedAt = now;

    await this.runRepository.save(run);

    await this.addEvent({
      tenantId: run.tenantId,
      runId,
      eventType: RunEventType.RUN_LEASED,
      severity: EventSeverity.INFO,
      message: `Leased by runner ${runnerName ?? runnerId}`,
      timestamp: now,
    });

    return run;
  }

  /**
   * Start a run.
   */
  async startRun(runId: string): Promise<Run | null> {
    const run = await this.runRepository.findOne({
      where: { id: runId },
    });

    if (!run) {
      return null;
    }

    const now = new Date();
    run.status = RunStatus.RUNNING;
    run.startedAt = now;

    if (run.queuedAt) {
      run.queueDurationMs = now.getTime() - run.queuedAt.getTime();
    }

    await this.runRepository.save(run);

    await this.addEvent({
      tenantId: run.tenantId,
      runId,
      eventType: RunEventType.RUN_STARTED,
      severity: EventSeverity.INFO,
      message: 'Run started',
      timestamp: now,
    });

    return run;
  }

  /**
   * Update run progress.
   */
  async updateProgress(runId: string, dto: UpdateRunProgressDto): Promise<Run | null> {
    const run = await this.runRepository.findOne({
      where: { id: runId },
    });

    if (!run) {
      return null;
    }

    if (dto.status) run.status = dto.status;
    if (dto.currentStepId) run.currentStepId = dto.currentStepId;
    if (dto.currentNodeId) run.currentNodeId = dto.currentNodeId;
    if (dto.completedSteps !== undefined) run.completedSteps = dto.completedSteps;
    if (dto.failedSteps !== undefined) run.failedSteps = dto.failedSteps;
    if (dto.memoryMb !== undefined) {
      run.peakMemoryMb = Math.max(run.peakMemoryMb ?? 0, dto.memoryMb);
    }
    if (dto.outputs) {
      run.outputs = { ...run.outputs, ...dto.outputs };
    }

    return this.runRepository.save(run);
  }

  /**
   * Complete a run.
   */
  async completeRun(runId: string, dto: CompleteRunDto): Promise<Run | null> {
    const run = await this.runRepository.findOne({
      where: { id: runId },
    });

    if (!run) {
      return null;
    }

    const now = new Date();
    run.status = dto.success ? RunStatus.SUCCEEDED : RunStatus.FAILED;
    run.completedAt = now;
    run.outputs = dto.outputs ?? run.outputs;

    if (run.startedAt) {
      run.executionDurationMs = now.getTime() - run.startedAt.getTime();
    }
    run.totalDurationMs = now.getTime() - run.createdAt.getTime();

    if (!dto.success) {
      run.errorMessage = dto.errorMessage;
      run.errorCode = dto.errorCode;
      run.errorNodeId = dto.errorNodeId;
      run.errorStepId = dto.errorStepId;
      run.errorDetails = dto.errorDetails;
    }

    run.warnings = dto.warnings ?? [];
    run.peakMemoryMb = dto.peakMemoryMb ?? run.peakMemoryMb;
    run.avgCpuPercent = dto.avgCpuPercent;
    run.networkBytesIn = dto.networkBytesIn ?? run.networkBytesIn;
    run.networkBytesOut = dto.networkBytesOut ?? run.networkBytesOut;
    run.storageReadBytes = dto.storageReadBytes ?? run.storageReadBytes;
    run.storageWriteBytes = dto.storageWriteBytes ?? run.storageWriteBytes;

    await this.runRepository.save(run);

    // Add completion event
    await this.addEvent({
      tenantId: run.tenantId,
      runId,
      eventType: dto.success ? RunEventType.RUN_COMPLETED : RunEventType.RUN_FAILED,
      severity: dto.success ? EventSeverity.INFO : EventSeverity.ERROR,
      message: dto.success
        ? `Run completed successfully in ${run.totalDurationMs}ms`
        : dto.errorMessage ?? 'Run failed',
      payload: dto.success
        ? { outputs: dto.outputs }
        : { errorCode: dto.errorCode, errorDetails: dto.errorDetails },
      timestamp: now,
    });

    // Update bot stats
    await this.botsService.updateRunStats(
      run.tenantId,
      run.botId,
      dto.success,
      run.executionDurationMs,
    );

    // Handle retry if failed
    if (!dto.success && run.retryCount < run.maxRetries) {
      await this.scheduleRetry(run);
    }

    return run;
  }

  /**
   * Schedule a retry for a failed run.
   */
  private async scheduleRetry(run: Run): Promise<void> {
    // Calculate delay with exponential backoff
    const attempt = run.retryCount + 1;
    const baseDelay = run.retryDelaySeconds * 1000;
    const delay = Math.min(
      baseDelay * Math.pow(run.retryBackoffMultiplier, run.retryCount),
      run.retryMaxDelaySeconds * 1000,
    );

    const nextRetryAt = new Date(Date.now() + delay);

    // Add to retry history
    run.retryHistory = [
      ...(run.retryHistory ?? []),
      {
        attempt: run.retryCount,
        status: run.status,
        error: run.errorMessage,
        startedAt: run.startedAt?.toISOString() ?? '',
        completedAt: run.completedAt?.toISOString() ?? '',
        durationMs: run.executionDurationMs ?? 0,
      },
    ];

    // Update run for retry
    run.status = RunStatus.RETRY_SCHEDULED;
    run.retryCount = attempt;
    run.nextRetryAt = nextRetryAt;
    run.completedAt = null;
    run.errorMessage = null;
    run.errorDetails = null;

    await this.runRepository.save(run);

    // Queue for retry
    await this.queueRun(run);

    this.logger.log(`Scheduled retry ${attempt} for run ${run.id} at ${nextRetryAt.toISOString()}`);
  }

  /**
   * Mark run as timed out.
   */
  async timeoutRun(runId: string): Promise<Run | null> {
    const run = await this.runRepository.findOne({
      where: { id: runId },
    });

    if (!run || run.status === RunStatus.SUCCEEDED || run.status === RunStatus.FAILED) {
      return null;
    }

    const now = new Date();
    run.status = RunStatus.TIMED_OUT;
    run.completedAt = now;
    run.errorMessage = `Run timed out after ${run.timeoutSeconds} seconds`;

    if (run.startedAt) {
      run.executionDurationMs = now.getTime() - run.startedAt.getTime();
    }
    run.totalDurationMs = now.getTime() - run.createdAt.getTime();

    await this.runRepository.save(run);

    await this.addEvent({
      tenantId: run.tenantId,
      runId,
      eventType: RunEventType.RUN_TIMED_OUT,
      severity: EventSeverity.ERROR,
      message: `Run timed out after ${run.timeoutSeconds} seconds`,
      timestamp: now,
    });

    return run;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Check run quota against license limits.
   * In single-tenant mode, limits come from license features.
   * @param maxConcurrentRuns - Max concurrent runs from license (-1 for unlimited)
   * @param maxMonthlyRuns - Max monthly runs from license (-1 for unlimited)
   */
  async checkRunQuota(
    tenantId: string,
    maxConcurrentRuns = -1,
    maxMonthlyRuns = -1,
  ): Promise<void> {
    // Check concurrent runs limit
    if (maxConcurrentRuns > 0) {
      const runningCount = await this.runRepository.count({
        where: {
          tenantId,
          status: In([RunStatus.QUEUED, RunStatus.LEASED, RunStatus.RUNNING]),
        },
      });

      if (runningCount >= maxConcurrentRuns) {
        throw new BadRequestException(
          `Maximum concurrent runs limit reached (${maxConcurrentRuns}). Wait for running jobs to complete.`,
        );
      }
    }

    // Check monthly runs limit
    if (maxMonthlyRuns > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthlyCount = await this.runRepository.count({
        where: {
          tenantId,
          createdAt: MoreThan(monthStart),
        },
      });

      if (monthlyCount >= maxMonthlyRuns) {
        throw new BadRequestException(
          `Monthly runs limit reached (${maxMonthlyRuns}). Upgrade your plan or wait until next month.`,
        );
      }
    }
  }

  /**
   * Resolve bot and version from IDs.
   */
  private async resolveBotVersion(
    tenantId: string,
    botId: string,
    versionId?: string,
  ): Promise<{ bot: Bot; version: BotVersion }> {
    const bot = await this.botRepository.findOne({
      where: { id: botId, tenantId },
    });

    if (!bot) {
      throw new NotFoundException(`Bot ${botId} not found`);
    }

    let version: BotVersion | null;

    if (versionId) {
      version = await this.versionRepository.findOne({
        where: { id: versionId, botId },
      });
      if (!version) {
        throw new NotFoundException(`Version ${versionId} not found`);
      }
    } else {
      // Get latest published version
      version = await this.versionRepository.findOne({
        where: { botId, status: VersionStatus.PUBLISHED },
        order: { createdAt: 'DESC' },
      });

      if (!version) {
        throw new BadRequestException(`Bot ${botId} has no published versions`);
      }
    }

    return { bot, version };
  }

  // ============================================================================
  // DTO MAPPERS
  // ============================================================================

  private toSummaryDto(run: Run): RunSummaryDto {
    return {
      id: run.id,
      tenantId: run.tenantId,
      botId: run.botId,
      botVersionId: run.botVersionId,
      botName: run.botName,
      botVersionLabel: run.botVersionLabel,
      status: run.status,
      priority: run.priority,
      triggerType: run.triggerType,
      triggeredBy: run.triggeredBy,
      runnerId: run.runnerId,
      runnerName: run.runnerName,
      parentRunId: run.parentRunId,
      scheduleId: run.scheduleId,
      totalSteps: run.totalSteps,
      completedSteps: run.completedSteps,
      failedSteps: run.failedSteps,
      queuedAt: run.queuedAt?.toISOString(),
      startedAt: run.startedAt?.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      totalDurationMs: run.totalDurationMs,
      errorMessage: run.errorMessage,
      requiresApproval: run.requiresApproval,
      tags: run.tags ?? [],
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private toDetailDto(run: Run): RunDetailDto {
    return {
      ...this.toSummaryDto(run),
      inputs: run.inputs,
      outputs: run.outputs,
      context: run.context,
      planHash: run.planHash,
      policyPackVersion: run.policyPackVersion,
      currentStepId: run.currentStepId,
      currentNodeId: run.currentNodeId,
      timeoutSeconds: run.timeoutSeconds,
      maxRetries: run.maxRetries,
      retryCount: run.retryCount,
      nextRetryAt: run.nextRetryAt?.toISOString(),
      retryHistory: run.retryHistory,
      leasedAt: run.leasedAt?.toISOString(),
      pausedAt: run.pausedAt?.toISOString(),
      resumedAt: run.resumedAt?.toISOString(),
      cancelledAt: run.cancelledAt?.toISOString(),
      cancelledBy: run.cancelledBy,
      timeoutAt: run.timeoutAt?.toISOString(),
      queueDurationMs: run.queueDurationMs,
      executionDurationMs: run.executionDurationMs,
      peakMemoryMb: run.peakMemoryMb,
      avgCpuPercent: run.avgCpuPercent,
      networkBytesIn: run.networkBytesIn,
      networkBytesOut: run.networkBytesOut,
      storageReadBytes: run.storageReadBytes,
      storageWriteBytes: run.storageWriteBytes,
      errorCode: run.errorCode,
      errorNodeId: run.errorNodeId,
      errorStepId: run.errorStepId,
      errorDetails: run.errorDetails,
      warnings: run.warnings ?? [],
      hitlConfig: run.hitlConfig,
      hitlState: run.hitlState,
      notificationConfig: run.notificationConfig,
      notificationsSent: run.notificationsSent,
      labels: run.labels,
      metadata: run.metadata,
      notes: run.notes,
      billable: run.billable,
      computeUnits: run.computeUnits,
      billingCategory: run.billingCategory,
      depth: run.depth,
      rootRunId: run.rootRunId,
      runnerPoolId: run.runnerPoolId,
      runnerTags: run.runnerTags ?? [],
    };
  }

  private toEventDto(event: RunEvent): RunEventDto {
    return {
      id: event.id,
      runId: event.runId,
      eventType: event.eventType,
      severity: event.severity,
      stepId: event.stepId,
      nodeId: event.nodeId,
      nodeType: event.nodeType,
      nodeLabel: event.nodeLabel,
      status: event.status,
      durationMs: event.durationMs,
      message: event.message,
      payload: event.payload,
      inputSnapshot: event.inputSnapshot,
      outputSnapshot: event.outputSnapshot,
      classification: event.classification,
      controlsApplied: event.controlsApplied,
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
      memoryMb: event.memoryMb,
      cpuPercent: event.cpuPercent,
      correlationId: event.correlationId,
      spanId: event.spanId,
      timestamp: event.timestamp?.toISOString(),
      createdAt: event.createdAt.toISOString(),
    };
  }

  private toLogDto(log: RunLog): RunLogDto {
    return {
      id: log.id,
      runId: log.runId,
      level: log.level,
      stepId: log.stepId,
      nodeId: log.nodeId,
      source: log.source,
      message: log.message,
      data: log.data,
      timestamp: log.timestamp?.toISOString(),
      createdAt: log.createdAt.toISOString(),
    };
  }

  private toArtifactDto(artifact: RunArtifact): RunArtifactDto {
    return {
      id: artifact.id,
      runId: artifact.runId,
      name: artifact.name,
      originalName: artifact.originalName,
      type: artifact.type,
      mimeType: artifact.mimeType,
      sizeBytes: Number(artifact.sizeBytes),
      stepId: artifact.stepId,
      nodeId: artifact.nodeId,
      description: artifact.description,
      tags: artifact.tags ?? [],
      encrypted: artifact.encrypted,
      classification: artifact.classification,
      checksum: artifact.checksum,
      expiresAt: artifact.expiresAt?.toISOString(),
      permanent: artifact.permanent,
      // downloadUrl would be generated by a separate storage service
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString(),
    };
  }

  private toHitlRequestDto(request: HitlRequest): HitlRequestDto {
    const now = new Date();
    const isOverdue = request.deadline
      ? request.deadline < now && request.status === HitlRequestStatus.PENDING
      : false;

    return {
      id: request.id,
      runId: request.runId,
      status: request.status,
      stepId: request.stepId,
      nodeId: request.nodeId,
      nodeType: request.nodeType,
      nodeLabel: request.nodeLabel,
      title: request.title,
      description: request.description,
      urgency: request.urgency,
      requestData: request.requestData,
      contextData: request.contextData,
      allowedActions: request.allowedActions ?? [],
      dataModificationAllowed: request.dataModificationAllowed,
      assignedTo: request.assignedTo,
      assigneeName: (request as any).assignee?.displayName,
      approverIds: request.approverIds ?? [],
      escalatedTo: request.escalatedTo,
      escalatedAt: request.escalatedAt?.toISOString(),
      deadline: request.deadline?.toISOString(),
      escalationDeadline: request.escalationDeadline?.toISOString(),
      autoExpire: request.autoExpire,
      action: request.action,
      resolvedBy: request.resolvedBy,
      resolverName: (request as any).resolver?.displayName,
      resolvedAt: request.resolvedAt?.toISOString(),
      resolutionComments: request.resolutionComments,
      modifiedData: request.modifiedData,
      auditTrail: request.auditTrail,
      isOverdue,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}
