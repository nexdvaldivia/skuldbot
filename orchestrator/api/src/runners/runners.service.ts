import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { Runner, RunnerStatus, RunnerPool } from './entities/runner.entity';
import { Run, RunStatus, RunEventType } from '../runs/entities/run.entity';
import { BotVersion } from '../bots/entities/bot.entity';
import { RunsService } from '../runs/runs.service';
import { RealtimeGateway } from '../websocket/websocket.gateway';
import {
  RegisterRunnerDto,
  UpdateRunnerDto,
  HeartbeatDto,
  ReportProgressDto,
  CompleteRunDto,
  SendLogDto,
} from './dto/runner.dto';
import {
  RunnerResponseDto,
  RunnerRegistrationResponseDto,
  PendingJobDto,
  JobClaimResponseDto,
  RunnerStatsDto,
} from './dto/runner-response.dto';

const HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 1 minute without heartbeat = offline

@Injectable()
export class RunnersService {
  private readonly logger = new Logger(RunnersService.name);

  constructor(
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
    @InjectRepository(RunnerPool)
    private readonly poolRepository: Repository<RunnerPool>,
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
    private readonly runsService: RunsService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Register a new runner
   */
  async register(
    tenantId: string,
    dto: RegisterRunnerDto,
    ipAddress?: string,
  ): Promise<RunnerRegistrationResponseDto> {
    // Generate API key
    const apiKey = this.generateApiKey();
    const apiKeyHash = this.hashApiKey(apiKey);

    const runner = this.runnerRepository.create({
      tenantId,
      name: dto.name,
      status: RunnerStatus.ONLINE,
      labels: dto.labels,
      capabilities: dto.capabilities,
      agentVersion: dto.agentVersion,
      systemInfo: dto.systemInfo,
      secretsConfig: dto.secretsConfig,
      ipAddress,
      apiKeyHash,
      lastHeartbeatAt: new Date(),
    });

    await this.runnerRepository.save(runner);

    this.logger.log(`Registered runner ${runner.id} (${runner.name})`);

    // Emit real-time event
    this.realtimeGateway.emitRunnerStatus({
      runnerId: runner.id,
      name: runner.name,
      status: runner.status,
      timestamp: new Date().toISOString(),
    });

    return {
      runner: this.toResponseDto(runner),
      apiKey, // Only returned once
    };
  }

  /**
   * Authenticate runner by API key
   */
  async authenticateByApiKey(apiKey: string): Promise<Runner | null> {
    const apiKeyHash = this.hashApiKey(apiKey);
    return this.runnerRepository.findOne({
      where: { apiKeyHash },
    });
  }

  /**
   * Get all runners for a tenant
   */
  async findAll(tenantId: string): Promise<RunnerResponseDto[]> {
    const runners = await this.runnerRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
    return runners.map((r) => this.toResponseDto(r));
  }

  /**
   * Get a single runner
   */
  async findOne(tenantId: string, runnerId: string): Promise<RunnerResponseDto> {
    const runner = await this.runnerRepository.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) {
      throw new NotFoundException(`Runner ${runnerId} not found`);
    }
    return this.toResponseDto(runner);
  }

  /**
   * Update a runner
   */
  async update(
    tenantId: string,
    runnerId: string,
    dto: UpdateRunnerDto,
  ): Promise<RunnerResponseDto> {
    const runner = await this.runnerRepository.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) {
      throw new NotFoundException(`Runner ${runnerId} not found`);
    }

    Object.assign(runner, dto);
    await this.runnerRepository.save(runner);

    return this.toResponseDto(runner);
  }

  /**
   * Delete a runner
   */
  async remove(tenantId: string, runnerId: string): Promise<void> {
    const runner = await this.runnerRepository.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) {
      throw new NotFoundException(`Runner ${runnerId} not found`);
    }

    await this.runnerRepository.remove(runner);
    this.logger.log(`Removed runner ${runnerId}`);
  }

  /**
   * Process heartbeat from runner
   */
  async heartbeat(
    runner: Runner,
    dto: HeartbeatDto,
  ): Promise<{ acknowledged: boolean; pendingJobs: number }> {
    runner.lastHeartbeatAt = new Date();

    if (dto.status) {
      runner.status = dto.status;
    }

    await this.runnerRepository.save(runner);

    // Count pending jobs for this runner's tenant
    const pendingJobs = await this.runRepository.count({
      where: {
        tenantId: runner.tenantId,
        status: RunStatus.QUEUED,
      },
    });

    return { acknowledged: true, pendingJobs };
  }

  /**
   * Get pending jobs for a runner to claim
   */
  async getPendingJobs(runner: Runner): Promise<PendingJobDto[]> {
    const runs = await this.runRepository.find({
      where: {
        tenantId: runner.tenantId,
        status: RunStatus.QUEUED,
      },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    return runs.map((run) => ({
      runId: run.id,
      tenantId: run.tenantId,
      botVersionId: run.botVersionId,
      planHash: run.planHash,
      inputs: run.inputs ?? undefined,
      queuedAt: run.createdAt.toISOString(),
    }));
  }

  /**
   * Runner claims a job
   */
  async claimJob(runner: Runner, runId: string): Promise<JobClaimResponseDto> {
    // Try to claim the run (optimistic locking via status check)
    const run = await this.runRepository.findOne({
      where: {
        id: runId,
        tenantId: runner.tenantId,
        status: RunStatus.QUEUED,
      },
    });

    if (!run) {
      return {
        success: false,
        message: 'Job not available (already claimed or not found)',
      };
    }

    // Get the execution plan
    const version = await this.versionRepository.findOne({
      where: { id: run.botVersionId },
    });

    if (!version?.compiledPlan) {
      return {
        success: false,
        message: 'No compiled plan found for this version',
      };
    }

    // Claim the job
    run.status = RunStatus.LEASED;
    run.runnerId = runner.id;
    await this.runRepository.save(run);

    // Update runner status
    runner.status = RunnerStatus.BUSY;
    await this.runnerRepository.save(runner);

    this.logger.log(`Runner ${runner.id} claimed job ${runId}`);

    return {
      success: true,
      job: {
        runId: run.id,
        tenantId: run.tenantId,
        botVersionId: run.botVersionId,
        plan: version.compiledPlan,
        inputs: run.inputs ?? undefined,
      },
    };
  }

  /**
   * Runner reports progress on a step
   */
  async reportProgress(runner: Runner, dto: ReportProgressDto): Promise<void> {
    // Verify the run belongs to this runner
    const run = await this.runRepository.findOne({
      where: {
        id: dto.runId,
        runnerId: runner.id,
      },
    });

    if (!run) {
      throw new BadRequestException('Run not found or not assigned to this runner');
    }

    // If this is step_start and run is LEASED, mark as RUNNING
    if (dto.eventType === 'step_start' && run.status === RunStatus.LEASED) {
      await this.runsService.startRun(dto.runId);

      // Emit status change
      this.realtimeGateway.emitRunStatus(dto.runId, {
        runId: dto.runId,
        status: 'running',
        timestamp: new Date().toISOString(),
      });
    }

    // Add event
    await this.runsService.addEvent({
      runId: dto.runId,
      stepId: dto.stepId,
      nodeId: dto.nodeId,
      eventType: dto.eventType as RunEventType,
      status: dto.status,
      durationMs: dto.durationMs,
      payload: dto.payload,
      classification: dto.classification,
      controlsApplied: dto.controlsApplied,
    });

    // Emit real-time step progress
    this.realtimeGateway.emitRunStep(dto.runId, {
      runId: dto.runId,
      stepIndex: dto.stepId ? parseInt(dto.stepId.split('-')[1] || '0', 10) : 0,
      nodeId: dto.nodeId || '',
      nodeType: dto.payload?.nodeType || 'unknown',
      status: this.mapEventTypeToStepStatus(dto.eventType),
      startedAt: dto.eventType === 'step_start' ? new Date().toISOString() : undefined,
      completedAt: dto.eventType === 'step_complete' ? new Date().toISOString() : undefined,
      output: dto.payload?.output,
      error: dto.payload?.error,
    });

    // Emit log entry
    if (dto.payload?.log) {
      this.realtimeGateway.emitRunLog(dto.runId, {
        runId: dto.runId,
        timestamp: new Date().toISOString(),
        level: dto.eventType === 'step_error' ? 'error' : 'info',
        message: dto.payload.log,
        nodeId: dto.nodeId,
      });
    }
  }

  private mapEventTypeToStepStatus(
    eventType: string,
  ): 'running' | 'success' | 'failed' | 'skipped' {
    switch (eventType) {
      case 'step_start':
        return 'running';
      case 'step_complete':
        return 'success';
      case 'step_error':
        return 'failed';
      case 'step_skipped':
        return 'skipped';
      default:
        return 'running';
    }
  }

  /**
   * Send a log entry for real-time streaming
   */
  async sendLog(runner: Runner, dto: SendLogDto): Promise<void> {
    // Verify the run belongs to this runner
    const run = await this.runRepository.findOne({
      where: {
        id: dto.runId,
        runnerId: runner.id,
      },
    });

    if (!run) {
      // Silently ignore logs for runs not assigned to this runner
      // to avoid failing the execution for permission issues
      return;
    }

    // Emit the log entry via WebSocket for real-time streaming
    this.realtimeGateway.emitRunLog(dto.runId, {
      runId: dto.runId,
      timestamp: dto.timestamp,
      level: dto.level,
      message: dto.message,
      nodeId: dto.nodeId,
      stepIndex: dto.stepIndex,
    });
  }

  /**
   * Runner completes a run
   */
  async completeRun(runner: Runner, dto: CompleteRunDto): Promise<void> {
    // Verify the run belongs to this runner
    const run = await this.runRepository.findOne({
      where: {
        id: dto.runId,
        runnerId: runner.id,
      },
    });

    if (!run) {
      throw new BadRequestException('Run not found or not assigned to this runner');
    }

    const completedAt = new Date();
    const startedAt = run.startedAt || run.createdAt;
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Complete the run
    await this.runsService.completeRun(dto.runId, {
      success: dto.success,
      outputs: dto.outputs,
      errorMessage: dto.errorMessage,
    });

    // Update runner status back to online
    runner.status = RunnerStatus.ONLINE;
    await this.runnerRepository.save(runner);

    // Emit run completion event
    this.realtimeGateway.emitRunComplete(dto.runId, {
      runId: dto.runId,
      status: dto.success ? 'success' : 'failed',
      completedAt: completedAt.toISOString(),
      durationMs,
      stepsCompleted: dto.stepsCompleted || 0,
      stepsFailed: dto.stepsFailed || 0,
      error: dto.errorMessage,
    });

    // Emit runner status change
    this.realtimeGateway.emitRunnerStatus({
      runnerId: runner.id,
      name: runner.name,
      status: 'online',
      currentRunId: undefined,
      timestamp: completedAt.toISOString(),
    });

    this.logger.log(
      `Runner ${runner.id} completed run ${dto.runId} (success: ${dto.success})`,
    );
  }

  /**
   * Get runner statistics for a tenant
   */
  async getStats(tenantId: string): Promise<RunnerStatsDto> {
    const runners = await this.runnerRepository.find({
      where: { tenantId },
      select: ['status'],
    });

    const stats: RunnerStatsDto = {
      total: runners.length,
      online: 0,
      busy: 0,
      offline: 0,
      maintenance: 0,
    };

    for (const runner of runners) {
      switch (runner.status) {
        case RunnerStatus.ONLINE:
          stats.online++;
          break;
        case RunnerStatus.BUSY:
          stats.busy++;
          break;
        case RunnerStatus.OFFLINE:
          stats.offline++;
          break;
        case RunnerStatus.MAINTENANCE:
          stats.maintenance++;
          break;
      }
    }

    return stats;
  }

  /**
   * Mark stale runners as offline (called by scheduler)
   */
  async markStaleRunnersOffline(): Promise<number> {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

    const result = await this.runnerRepository.update(
      {
        status: RunnerStatus.ONLINE,
        lastHeartbeatAt: LessThan(cutoff),
      },
      {
        status: RunnerStatus.OFFLINE,
      },
    );

    if (result.affected && result.affected > 0) {
      this.logger.warn(`Marked ${result.affected} stale runners as offline`);
    }

    return result.affected ?? 0;
  }

  /**
   * Regenerate API key for a runner
   */
  async regenerateApiKey(
    tenantId: string,
    runnerId: string,
  ): Promise<{ apiKey: string }> {
    const runner = await this.runnerRepository.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) {
      throw new NotFoundException(`Runner ${runnerId} not found`);
    }

    const apiKey = this.generateApiKey();
    runner.apiKeyHash = this.hashApiKey(apiKey);
    await this.runnerRepository.save(runner);

    this.logger.log(`Regenerated API key for runner ${runnerId}`);

    return { apiKey };
  }

  // Helper methods

  private generateApiKey(): string {
    return `skr_${randomBytes(32).toString('hex')}`;
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private toResponseDto(runner: Runner): RunnerResponseDto {
    return {
      id: runner.id,
      tenantId: runner.tenantId,
      name: runner.name,
      status: runner.status,
      labels: runner.labels ?? undefined,
      capabilities: runner.capabilities ?? undefined,
      lastHeartbeatAt: runner.lastHeartbeatAt?.toISOString(),
      ipAddress: runner.ipAddress ?? undefined,
      agentVersion: runner.agentVersion ?? undefined,
      systemInfo: runner.systemInfo ?? undefined,
      createdAt: runner.createdAt.toISOString(),
      updatedAt: runner.updatedAt.toISOString(),
    };
  }
}
