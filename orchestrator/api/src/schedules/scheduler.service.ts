import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In, DataSource, QueryRunner } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Schedule,
  ScheduleStatus,
  ScheduleTriggerType,
  ScheduleExecution,
  ScheduleExecutionStatus,
  ScheduleOverlapPolicy,
  ScheduleCatchupPolicy,
} from './entities/schedule.entity';
import { SchedulesService } from './schedules.service';
import { CronParser } from './cron/cron-parser';

/**
 * Scheduler tick result for metrics
 */
interface SchedulerTickResult {
  processed: number;
  triggered: number;
  skipped: number;
  errors: number;
  duration: number;
}

/**
 * Distributed lock configuration
 */
interface LockConfig {
  lockKey: string;
  lockTimeout: number;
  renewInterval: number;
}

/**
 * Enterprise-grade Scheduler Service
 *
 * Features:
 * - High-availability with distributed locking (pg_advisory_lock)
 * - Multiple trigger types (cron, interval, calendar)
 * - Timezone-aware scheduling with DST handling
 * - Blackout window checking
 * - Quota enforcement (hourly, daily, weekly, monthly)
 * - Overlap policy handling (skip, queue, allow, cancel)
 * - Catchup policy handling (none, one, all, latest)
 * - Graceful shutdown
 * - Metrics and health reporting
 * - Auto-pause on consecutive failures
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);

  // Scheduler state
  private isRunning = false;
  private isLeader = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private lockRenewInterval: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  // Configuration
  private readonly tickIntervalMs: number;
  private readonly lockConfig: LockConfig;
  private readonly instanceId: string;
  private readonly enableDistributedLock: boolean;

  // Metrics
  private lastTickResult: SchedulerTickResult | null = null;
  private totalTicksProcessed = 0;
  private totalSchedulesTriggered = 0;
  private totalErrors = 0;
  private startedAt: Date | null = null;

  // Lock query runner (kept open for advisory lock)
  private lockQueryRunner: QueryRunner | null = null;

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(ScheduleExecution)
    private readonly executionRepository: Repository<ScheduleExecution>,
    private readonly schedulesService: SchedulesService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    // Load configuration
    this.tickIntervalMs = this.configService.get<number>(
      'SCHEDULER_TICK_INTERVAL_MS',
      10000, // 10 seconds default
    );

    this.enableDistributedLock = this.configService.get<boolean>(
      'SCHEDULER_DISTRIBUTED_LOCK',
      true,
    );

    this.instanceId =
      this.configService.get<string>('SCHEDULER_INSTANCE_ID') ||
      `scheduler-${process.pid}-${Date.now()}`;

    this.lockConfig = {
      lockKey: 'skuldbot_scheduler_lock',
      lockTimeout: 60000, // 60 seconds
      renewInterval: 15000, // 15 seconds
    };
  }

  async onModuleInit() {
    this.logger.log(`Scheduler instance ${this.instanceId} initializing...`);

    if (this.enableDistributedLock) {
      await this.tryAcquireLeadership();
    } else {
      // Single instance mode
      this.isLeader = true;
      this.startScheduler();
    }
  }

  async onModuleDestroy() {
    this.logger.log('Scheduler shutting down...');

    // Signal shutdown
    this.isRunning = false;

    // Stop tick interval
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Stop lock renewal
    if (this.lockRenewInterval) {
      clearInterval(this.lockRenewInterval);
      this.lockRenewInterval = null;
    }

    // Release distributed lock
    if (this.lockQueryRunner) {
      try {
        await this.releaseLock();
      } catch (error) {
        this.logger.error(`Error releasing lock: ${error}`);
      }
    }

    // Wait for any in-progress tick to complete
    if (this.shutdownPromise) {
      await this.shutdownPromise;
    }

    this.logger.log('Scheduler shutdown complete');
  }

  /**
   * Try to acquire leadership using PostgreSQL advisory lock
   */
  private async tryAcquireLeadership(): Promise<void> {
    try {
      // Create a dedicated query runner for the lock
      this.lockQueryRunner = this.dataSource.createQueryRunner();
      await this.lockQueryRunner.connect();

      // Convert lock key to numeric hash for pg_advisory_lock
      const lockId = this.hashCode(this.lockConfig.lockKey);

      // Try to acquire non-blocking advisory lock
      const result = await this.lockQueryRunner.query(
        `SELECT pg_try_advisory_lock($1) as acquired`,
        [lockId],
      );

      if (result[0]?.acquired) {
        this.isLeader = true;
        this.logger.log(
          `Instance ${this.instanceId} acquired scheduler leadership`,
        );
        this.startScheduler();
        this.startLockRenewal();
      } else {
        this.logger.log(
          `Instance ${this.instanceId} is standby (another instance is leader)`,
        );
        // Retry periodically
        setTimeout(() => this.tryAcquireLeadership(), 30000);
      }
    } catch (error) {
      this.logger.error(`Failed to acquire leadership: ${error}`);
      // Retry after delay
      setTimeout(() => this.tryAcquireLeadership(), 30000);
    }
  }

  /**
   * Release the distributed lock
   */
  private async releaseLock(): Promise<void> {
    if (!this.lockQueryRunner) return;

    try {
      const lockId = this.hashCode(this.lockConfig.lockKey);
      await this.lockQueryRunner.query(`SELECT pg_advisory_unlock($1)`, [
        lockId,
      ]);
      await this.lockQueryRunner.release();
      this.lockQueryRunner = null;
      this.isLeader = false;
      this.logger.log(`Instance ${this.instanceId} released scheduler lock`);
    } catch (error) {
      this.logger.error(`Error releasing lock: ${error}`);
    }
  }

  /**
   * Start lock renewal interval
   */
  private startLockRenewal(): void {
    this.lockRenewInterval = setInterval(async () => {
      if (!this.isLeader || !this.lockQueryRunner) return;

      try {
        // Advisory locks don't need renewal, but we verify we still hold it
        const lockId = this.hashCode(this.lockConfig.lockKey);
        const result = await this.lockQueryRunner.query(
          `SELECT pg_try_advisory_lock($1) as acquired`,
          [lockId],
        );
        // If we already hold it, pg_try_advisory_lock returns true
        if (!result[0]?.acquired) {
          this.logger.warn('Lost scheduler leadership, stopping...');
          this.isLeader = false;
          this.stopScheduler();
          // Try to reacquire
          setTimeout(() => this.tryAcquireLeadership(), 5000);
        }
      } catch (error) {
        this.logger.error(`Lock verification failed: ${error}`);
      }
    }, this.lockConfig.renewInterval);
  }

  /**
   * Simple hash function for lock key
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Start the scheduler tick loop
   */
  startScheduler(): void {
    if (this.tickInterval) {
      return; // Already running
    }

    this.logger.log(
      `Starting scheduler with ${this.tickIntervalMs}ms tick interval`,
    );
    this.isRunning = true;
    this.startedAt = new Date();

    // Run first tick immediately
    this.tick();

    // Set up interval
    this.tickInterval = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  /**
   * Stop the scheduler tick loop
   */
  stopScheduler(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.isRunning = false;
    this.logger.log('Scheduler stopped');
  }

  /**
   * Main scheduler tick - processes all due schedules
   */
  private async tick(): Promise<void> {
    if (!this.isRunning || !this.isLeader) return;

    const tickStart = Date.now();
    const result: SchedulerTickResult = {
      processed: 0,
      triggered: 0,
      skipped: 0,
      errors: 0,
      duration: 0,
    };

    // Create a promise that resolves when tick completes (for graceful shutdown)
    this.shutdownPromise = (async () => {
      try {
        const now = new Date();

        // Find all active schedules that are due
        const dueSchedules = await this.findDueSchedules(now);

        if (dueSchedules.length > 0) {
          this.logger.debug(`Found ${dueSchedules.length} due schedule(s)`);
        }

        // Process each schedule
        for (const schedule of dueSchedules) {
          if (!this.isRunning) break; // Check for shutdown

          result.processed++;

          try {
            const triggered = await this.processSchedule(schedule, now);
            if (triggered) {
              result.triggered++;
            } else {
              result.skipped++;
            }
          } catch (error) {
            result.errors++;
            this.logger.error(
              `Error processing schedule ${schedule.id}: ${error}`,
            );
          }
        }
      } catch (error) {
        this.logger.error(`Scheduler tick error: ${error}`);
        result.errors++;
      } finally {
        result.duration = Date.now() - tickStart;
        this.lastTickResult = result;
        this.totalTicksProcessed++;
        this.totalSchedulesTriggered += result.triggered;
        this.totalErrors += result.errors;

        if (result.processed > 0) {
          this.logger.debug(
            `Tick completed: ${result.triggered} triggered, ${result.skipped} skipped, ${result.errors} errors (${result.duration}ms)`,
          );
        }
      }
    })();

    await this.shutdownPromise;
    this.shutdownPromise = null;
  }

  /**
   * Find all schedules that are due for execution
   */
  private async findDueSchedules(now: Date): Promise<Schedule[]> {
    return this.scheduleRepository.find({
      where: {
        status: ScheduleStatus.ACTIVE,
        triggerType: In([
          ScheduleTriggerType.CRON,
          ScheduleTriggerType.INTERVAL,
          ScheduleTriggerType.CALENDAR,
        ]),
        nextRunAt: LessThanOrEqual(now),
      },
      relations: ['bot', 'botVersion'],
      order: { priority: 'DESC', nextRunAt: 'ASC' },
      take: 100, // Limit batch size
    });
  }

  /**
   * Process a single schedule
   * Returns true if triggered, false if skipped
   */
  private async processSchedule(
    schedule: Schedule,
    now: Date,
  ): Promise<boolean> {
    // Check if schedule is still valid (could have changed during tick)
    const currentSchedule = await this.scheduleRepository.findOne({
      where: { id: schedule.id },
    });

    if (!currentSchedule || currentSchedule.status !== ScheduleStatus.ACTIVE) {
      return false;
    }

    // Check effective dates
    if (
      currentSchedule.effectiveFrom &&
      now < currentSchedule.effectiveFrom
    ) {
      return false;
    }
    if (currentSchedule.effectiveUntil && now > currentSchedule.effectiveUntil) {
      // Schedule has expired
      await this.scheduleRepository.update(schedule.id, {
        status: ScheduleStatus.EXPIRED,
      });
      return false;
    }

    // Check blackout windows
    if (this.isInBlackoutWindow(currentSchedule, now)) {
      this.logger.debug(
        `Schedule ${schedule.id} is in blackout window, skipping`,
      );
      // Calculate next run after blackout
      await this.calculateAndUpdateNextRun(currentSchedule, now);
      return false;
    }

    // Check quotas
    if (!(await this.checkQuotas(currentSchedule))) {
      this.logger.debug(`Schedule ${schedule.id} quota exceeded, skipping`);
      await this.scheduleRepository.update(schedule.id, {
        status: ScheduleStatus.QUOTA_EXCEEDED,
      });
      return false;
    }

    // Check overlap policy
    const hasRunningExecution = await this.hasRunningExecution(schedule.id);
    if (hasRunningExecution) {
      return await this.handleOverlap(currentSchedule, now);
    }

    // Handle catchup for missed executions
    const missedCount = await this.calculateMissedExecutions(
      currentSchedule,
      now,
    );
    if (missedCount > 1) {
      await this.handleCatchup(currentSchedule, missedCount, now);
    }

    // Trigger the schedule
    await this.triggerSchedule(currentSchedule, now);

    return true;
  }

  /**
   * Check if current time is within any blackout window
   */
  private isInBlackoutWindow(schedule: Schedule, now: Date): boolean {
    const windows = schedule.blackoutWindows?.windows || [];
    if (windows.length === 0) {
      return false;
    }

    const timezone = schedule.timezone || 'UTC';

    for (const window of windows) {
      // Check if enabled
      if (!(window as any).enabled) continue;

      // Check day of week
      if (window.daysOfWeek && window.daysOfWeek.length > 0) {
        const nowInTz = new Date(
          now.toLocaleString('en-US', { timeZone: timezone }),
        );
        const dayOfWeek = nowInTz.getDay();
        if (!window.daysOfWeek.includes(dayOfWeek)) continue;
      }

      // Check time range
      const nowInTz = new Date(
        now.toLocaleString('en-US', { timeZone: timezone }),
      );
      const currentTime =
        nowInTz.getHours() * 60 + nowInTz.getMinutes();

      const [startH, startM] = window.startTime.split(':').map(Number);
      const [endH, endM] = window.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      // Handle overnight windows
      if (endMinutes < startMinutes) {
        // Overnight: 22:00 - 06:00
        if (currentTime >= startMinutes || currentTime < endMinutes) {
          return true;
        }
      } else {
        // Same day: 09:00 - 17:00
        if (currentTime >= startMinutes && currentTime < endMinutes) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check execution quotas
   * TODO: Align quota config with Schedule entity schema
   */
  private async checkQuotas(schedule: Schedule): Promise<boolean> {
    const quotaConfig = (schedule as any).quotaConfig;
    if (!quotaConfig) return true;

    const { hourlyLimit, dailyLimit, weeklyLimit, monthlyLimit } =
      quotaConfig;
    const now = new Date();

    // Helper to count executions in time range
    const _countExecutions = async (_since: Date): Promise<number> => {
      return this.executionRepository.count({
        where: {
          scheduleId: schedule.id,
        } as any,
      });
    };

    // Check hourly
    if (hourlyLimit) {
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const count = await this.executionRepository
        .createQueryBuilder('execution')
        .where('execution.scheduleId = :scheduleId', {
          scheduleId: schedule.id,
        })
        .andWhere('execution.startedAt >= :since', { since: hourAgo })
        .getCount();

      if (count >= hourlyLimit) return false;
    }

    // Check daily
    if (dailyLimit) {
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const count = await this.executionRepository
        .createQueryBuilder('execution')
        .where('execution.scheduleId = :scheduleId', {
          scheduleId: schedule.id,
        })
        .andWhere('execution.startedAt >= :since', { since: dayAgo })
        .getCount();

      if (count >= dailyLimit) return false;
    }

    // Check weekly
    if (weeklyLimit) {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const count = await this.executionRepository
        .createQueryBuilder('execution')
        .where('execution.scheduleId = :scheduleId', {
          scheduleId: schedule.id,
        })
        .andWhere('execution.startedAt >= :since', { since: weekAgo })
        .getCount();

      if (count >= weeklyLimit) return false;
    }

    // Check monthly
    if (monthlyLimit) {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const count = await this.executionRepository
        .createQueryBuilder('execution')
        .where('execution.scheduleId = :scheduleId', {
          scheduleId: schedule.id,
        })
        .andWhere('execution.startedAt >= :since', { since: monthAgo })
        .getCount();

      if (count >= monthlyLimit) return false;
    }

    return true;
  }

  /**
   * Check if schedule has a running execution
   */
  private async hasRunningExecution(scheduleId: string): Promise<boolean> {
    const count = await this.executionRepository.count({
      where: {
        scheduleId,
        status: In([
          ScheduleExecutionStatus.RUNNING,
          ScheduleExecutionStatus.PENDING,
        ]),
      },
    });
    return count > 0;
  }

  /**
   * Handle overlap based on policy
   */
  private async handleOverlap(
    schedule: Schedule,
    now: Date,
  ): Promise<boolean> {
    switch (schedule.overlapPolicy) {
      case ScheduleOverlapPolicy.SKIP:
        this.logger.debug(
          `Schedule ${schedule.id} has running execution, skipping (SKIP policy)`,
        );
        await this.calculateAndUpdateNextRun(schedule, now);
        return false;

      case ScheduleOverlapPolicy.QUEUE:
        this.logger.debug(
          `Schedule ${schedule.id} has running execution, queuing (QUEUE policy)`,
        );
        // Create a pending execution to run after current completes
        await this.schedulesService.processScheduleTrigger({
          scheduleId: schedule.id,
        } as any);
        return true;

      case ScheduleOverlapPolicy.ALLOW:
        // Allow parallel execution
        await this.triggerSchedule(schedule, now);
        return true;

      case ScheduleOverlapPolicy.CANCEL_PREVIOUS:
        // Cancel running executions and start new one
        await this.cancelRunningExecutions(schedule.id);
        await this.triggerSchedule(schedule, now);
        return true;

      case ScheduleOverlapPolicy.CANCEL_NEW:
        // Keep existing, don't start new
        await this.calculateAndUpdateNextRun(schedule, now);
        return false;

      default:
        await this.calculateAndUpdateNextRun(schedule, now);
        return false;
    }
  }

  /**
   * Cancel all running executions for a schedule
   */
  private async cancelRunningExecutions(scheduleId: string): Promise<void> {
    await this.executionRepository.update(
      {
        scheduleId,
        status: In([
          ScheduleExecutionStatus.RUNNING,
          ScheduleExecutionStatus.PENDING,
        ]),
      },
      {
        status: ScheduleExecutionStatus.CANCELLED,
        runCompletedAt: new Date(),
      } as any,
    );
  }

  /**
   * Calculate number of missed executions
   */
  private async calculateMissedExecutions(
    schedule: Schedule,
    now: Date,
  ): Promise<number> {
    if (!schedule.lastRunAt) return 0;

    const cronParser = new CronParser(
      schedule.cronExpression || '* * * * *',
      schedule.timezone,
    );

    let missed = 0;
    let nextRun = cronParser.getNextRunAfter(schedule.lastRunAt);

    while (nextRun && nextRun < now && missed < 100) {
      missed++;
      nextRun = cronParser.getNextRunAfter(nextRun);
    }

    return missed;
  }

  /**
   * Handle catchup for missed executions
   */
  private async handleCatchup(
    schedule: Schedule,
    missedCount: number,
    now: Date,
  ): Promise<void> {
    switch (schedule.catchupPolicy) {
      case ScheduleCatchupPolicy.NONE:
        // Skip all missed executions
        this.logger.debug(
          `Schedule ${schedule.id} missed ${missedCount} executions, skipping (NONE policy)`,
        );
        break;

      case ScheduleCatchupPolicy.ONE:
        // Run one catch-up execution (the current one will handle it)
        this.logger.debug(
          `Schedule ${schedule.id} missed ${missedCount} executions, running one catch-up (ONE policy)`,
        );
        break;

      case ScheduleCatchupPolicy.ALL:
        // Run all missed executions
        this.logger.debug(
          `Schedule ${schedule.id} missed ${missedCount} executions, running all (ALL policy)`,
        );
        for (let i = 0; i < missedCount - 1; i++) {
          await this.schedulesService.processScheduleTrigger({
            scheduleId: schedule.id,
          } as any);
        }
        break;

      case ScheduleCatchupPolicy.LATEST:
        // Only run the most recent missed (current execution)
        this.logger.debug(
          `Schedule ${schedule.id} missed ${missedCount} executions, running latest only (LATEST policy)`,
        );
        break;
    }
  }

  /**
   * Trigger a schedule execution
   */
  private async triggerSchedule(schedule: Schedule, now: Date): Promise<void> {
    this.logger.log(
      `Triggering schedule ${schedule.id} (${schedule.name}) for bot ${schedule.botId}`,
    );

    try {
      // Call schedules service to process the trigger
      await this.schedulesService.processScheduleTrigger({
        scheduleId: schedule.id,
      } as any);

      // Update schedule timing
      await this.calculateAndUpdateNextRun(schedule, now);

      this.logger.log(`Successfully triggered schedule ${schedule.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to trigger schedule ${schedule.id}: ${error}`,
      );

      // Update consecutive failure count
      const newFailureCount = (schedule.consecutiveFailures || 0) + 1;

      const updates: Partial<Schedule> = {
        consecutiveFailures: newFailureCount,
        lastError: error instanceof Error ? error.message : String(error),
      };

      // Check auto-pause threshold
      if (
        schedule.autoPauseAfterFailures &&
        newFailureCount >= schedule.autoPauseAfterFailures
      ) {
        updates.status = ScheduleStatus.ERROR;
        this.logger.warn(
          `Schedule ${schedule.id} auto-paused after ${newFailureCount} consecutive failures`,
        );
      }

      await this.scheduleRepository.update(schedule.id, updates);

      // Still update next run to prevent infinite retries
      await this.calculateAndUpdateNextRun(schedule, now);

      throw error;
    }
  }

  /**
   * Calculate and update next run time
   */
  private async calculateAndUpdateNextRun(
    schedule: Schedule,
    currentTime: Date,
  ): Promise<void> {
    let nextRun: Date | null = null;

    switch (schedule.triggerType) {
      case ScheduleTriggerType.CRON:
        if (schedule.cronExpression) {
          const cronParser = new CronParser(
            schedule.cronExpression,
            schedule.timezone,
          );
          nextRun = cronParser.getNextRun();
        }
        break;

      case ScheduleTriggerType.INTERVAL:
        const intervalSeconds = (schedule as any).intervalSeconds || (schedule as any).intervalConfig?.seconds;
        if (intervalSeconds) {
          nextRun = new Date(
            currentTime.getTime() + intervalSeconds * 1000,
          );
        }
        break;

      case ScheduleTriggerType.CALENDAR:
        // Find next calendar date
        const calendarDates = schedule.calendarDates?.dates || [];
        if (calendarDates.length > 0) {
          const futureDates = calendarDates
            .filter((dateStr: string) => new Date(dateStr) > currentTime)
            .sort(
              (a: string, b: string) =>
                new Date(a).getTime() - new Date(b).getTime(),
            );

          if (futureDates.length > 0) {
            nextRun = new Date(futureDates[0]);
          }
        }
        break;
    }

    // Check effective dates
    if (nextRun && schedule.effectiveUntil && nextRun > schedule.effectiveUntil) {
      nextRun = null;
    }

    await this.scheduleRepository.update(schedule.id, {
      lastRunAt: currentTime,
      nextRunAt: nextRun,
    });
  }

  /**
   * Cleanup old execution records (scheduled job)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldExecutions(): Promise<void> {
    if (!this.isLeader) return;

    const retentionDays = this.configService.get<number>(
      'SCHEDULER_EXECUTION_RETENTION_DAYS',
      90,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const result = await this.executionRepository
        .createQueryBuilder()
        .delete()
        .where('completedAt < :cutoffDate', { cutoffDate })
        .andWhere('status IN (:...statuses)', {
          statuses: [
            ScheduleExecutionStatus.COMPLETED,
            ScheduleExecutionStatus.FAILED,
            ScheduleExecutionStatus.CANCELLED,
          ],
        })
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Cleaned up ${result.affected} old execution records`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup old executions: ${error}`);
    }
  }

  /**
   * Check and reset quota exceeded schedules (scheduled job)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async resetQuotaExceededSchedules(): Promise<void> {
    if (!this.isLeader) return;

    try {
      // Find schedules with QUOTA_EXCEEDED status
      const quotaExceededSchedules = await this.scheduleRepository.find({
        where: { status: ScheduleStatus.QUOTA_EXCEEDED },
      });

      for (const schedule of quotaExceededSchedules) {
        const quotaOk = await this.checkQuotas(schedule);
        if (quotaOk) {
          await this.scheduleRepository.update(schedule.id, {
            status: ScheduleStatus.ACTIVE,
          });
          this.logger.log(
            `Schedule ${schedule.id} quota reset, reactivated`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to reset quota exceeded schedules: ${error}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get scheduler health/status
   */
  getStatus(): {
    running: boolean;
    isLeader: boolean;
    instanceId: string;
    tickIntervalMs: number;
    startedAt: Date | null;
    lastTick: SchedulerTickResult | null;
    metrics: {
      totalTicks: number;
      totalTriggered: number;
      totalErrors: number;
    };
  } {
    return {
      running: this.isRunning,
      isLeader: this.isLeader,
      instanceId: this.instanceId,
      tickIntervalMs: this.tickIntervalMs,
      startedAt: this.startedAt,
      lastTick: this.lastTickResult,
      metrics: {
        totalTicks: this.totalTicksProcessed,
        totalTriggered: this.totalSchedulesTriggered,
        totalErrors: this.totalErrors,
      },
    };
  }

  /**
   * Force a scheduler tick (for testing/debugging)
   */
  async forceTick(): Promise<SchedulerTickResult | null> {
    if (!this.isLeader) {
      this.logger.warn('Cannot force tick on non-leader instance');
      return null;
    }

    await this.tick();
    return this.lastTickResult;
  }

  /**
   * Manually trigger a specific schedule (bypasses normal checks)
   */
  async triggerScheduleManually(scheduleId: string): Promise<void> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    await this.triggerSchedule(schedule, new Date());
  }
}
