import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Runner, RunnerStatus } from '../runners/entities/runner.entity';
import { Run, RunStatus, RunTriggerType } from '../runs/entities/run.entity';
import { BotVersion } from '../bots/entities/bot.entity';
import { Schedule, ScheduleTargetType } from '../schedules/entities/schedule.entity';
import { InfraPowerService } from './infra-power.service';

// Queue names
export const QUEUE_DEFAULT = 'runs';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
    @InjectQueue(QUEUE_DEFAULT)
    private readonly defaultQueue: Queue,
    private readonly infraPowerService: InfraPowerService,
  ) {}

  /**
   * Dispatch a run based on schedule configuration
   */
  async dispatchFromSchedule(schedule: Schedule): Promise<Run> {
    if (!schedule.botVersionId) {
      throw new BadRequestException('Schedule has no bot version configured');
    }

    const version = await this.versionRepository.findOne({
      where: { id: schedule.botVersionId },
    });

    if (!version?.compiledPlan) {
      throw new BadRequestException('Bot version not compiled');
    }

    // Create run record
    const run = this.runRepository.create({
      tenantId: schedule.tenantId,
      botVersionId: schedule.botVersionId,
      status: RunStatus.QUEUED,
      triggerType: RunTriggerType.SCHEDULE,
      triggeredBy: `schedule:${schedule.id}`,
      inputs: schedule.inputs ?? undefined,
      planHash: version.planHash ?? undefined,
    });

    await this.runRepository.save(run);

    // Route based on target type
    await this.routeRun(run, schedule.targetType, {
      pinnedRunnerId: schedule.targetRunnerId,
      groupSelector: schedule.targetLabels
        ? { labels: schedule.targetLabels, capabilities: schedule.targetCapabilities ?? undefined }
        : null,
    });

    return run;
  }

  /**
   * Dispatch a manual/API run
   */
  async dispatchManualRun(
    tenantId: string,
    botVersionId: string,
    inputs?: Record<string, any>,
    targetType: ScheduleTargetType = ScheduleTargetType.ANY,
    pinnedRunnerId?: string,
  ): Promise<Run> {
    const version = await this.versionRepository.findOne({
      where: { id: botVersionId },
    });

    if (!version?.compiledPlan) {
      throw new BadRequestException('Bot version not compiled');
    }

    const run = this.runRepository.create({
      tenantId,
      botVersionId,
      status: RunStatus.QUEUED,
      triggerType: RunTriggerType.MANUAL,
      triggeredBy: 'manual',
      inputs,
      planHash: version.planHash ?? undefined,
    });

    await this.runRepository.save(run);

    await this.routeRun(run, targetType, { pinnedRunnerId });

    return run;
  }

  /**
   * Route a run to the appropriate queue
   */
  private async routeRun(
    run: Run,
    targetType: ScheduleTargetType,
    options: {
      pinnedRunnerId?: string | null;
      groupSelector?: { labels?: Record<string, string>; capabilities?: string[] } | null;
    },
  ): Promise<void> {
    const { pinnedRunnerId, groupSelector } = options;

    switch (targetType) {
      case ScheduleTargetType.PINNED:
        if (!pinnedRunnerId) {
          throw new BadRequestException('Pinned runner ID required');
        }
        await this.routeToPinnedRunner(run, pinnedRunnerId);
        break;

      case ScheduleTargetType.POOL:
      case ScheduleTargetType.CAPABILITY:
        await this.routeToGroup(run, groupSelector);
        break;

      case ScheduleTargetType.ANY:
      default:
        await this.routeToAny(run);
        break;
    }
  }

  /**
   * Route to a specific pinned runner
   */
  private async routeToPinnedRunner(run: Run, runnerId: string): Promise<void> {
    const runner = await this.runnerRepository.findOne({
      where: { id: runnerId, tenantId: run.tenantId },
    });

    if (!runner) {
      throw new BadRequestException(`Runner ${runnerId} not found`);
    }

    // If runner is offline, try to power on the VM
    if (runner.status === RunnerStatus.OFFLINE) {
      this.logger.log(`Runner ${runnerId} is offline, attempting to power on`);

      const powered = await this.infraPowerService.ensureRunnerOnline(runner);
      if (!powered) {
        this.logger.warn(`Could not power on runner ${runnerId}, run will wait`);
      }
    }

    // Add to runner-specific queue
    const queueName = `runner-${runnerId}`;
    await this.addToQueue(run, queueName);

    this.logger.log(`Dispatched run ${run.id} to pinned runner ${runnerId}`);
  }

  /**
   * Route to runners matching group selector
   */
  private async routeToGroup(
    run: Run,
    selector?: { labels?: Record<string, string>; capabilities?: string[] } | null,
  ): Promise<void> {
    // For now, route to tenant queue
    // Runners with matching labels/capabilities will pull from this queue
    // In production, implement more sophisticated routing

    const queueName = `tenant-${run.tenantId}`;
    await this.addToQueue(run, queueName);

    this.logger.log(`Dispatched run ${run.id} to tenant group queue`);
  }

  /**
   * Route to any available runner
   */
  private async routeToAny(run: Run): Promise<void> {
    // Route to tenant queue (runners poll their tenant queue)
    const queueName = `tenant-${run.tenantId}`;
    await this.addToQueue(run, queueName);

    this.logger.log(`Dispatched run ${run.id} to tenant queue`);
  }

  /**
   * Add job to queue
   */
  private async addToQueue(run: Run, queueName: string): Promise<void> {
    // For now, use default queue
    // In production, dynamically create/get queue by name
    await this.defaultQueue.add(
      'execute-run',
      {
        runId: run.id,
        tenantId: run.tenantId,
        botVersionId: run.botVersionId,
        planHash: run.planHash,
        targetQueue: queueName,
      },
      {
        jobId: run.id,
        attempts: 1,
        removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
        removeOnFail: { count: 5000, age: 7 * 24 * 60 * 60 },
      },
    );
  }

  /**
   * Find best available runner for a run
   */
  async findBestRunner(
    tenantId: string,
    selector?: { labels?: Record<string, string>; capabilities?: string[] },
  ): Promise<Runner | null> {
    let query = this.runnerRepository
      .createQueryBuilder('runner')
      .where('runner.tenantId = :tenantId', { tenantId })
      .andWhere('runner.status = :status', { status: RunnerStatus.ONLINE });

    // Filter by labels
    if (selector?.labels && Object.keys(selector.labels).length > 0) {
      for (const [key, value] of Object.entries(selector.labels)) {
        query = query.andWhere(`runner.labels->>'${key}' = :${key}`, {
          [key]: value,
        });
      }
    }

    // Filter by capabilities
    if (selector?.capabilities && selector.capabilities.length > 0) {
      for (const cap of selector.capabilities) {
        query = query.andWhere(`runner.capabilities @> :cap`, {
          cap: JSON.stringify([cap]),
        });
      }
    }

    return query.getOne();
  }
}
