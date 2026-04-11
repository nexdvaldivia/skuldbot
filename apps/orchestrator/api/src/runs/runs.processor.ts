import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Run, RunStatus, RunEventType } from './entities/run.entity';
import { BotVersion } from '../bots/entities/bot.entity';
import { RunsService } from './runs.service';
import { RUN_QUEUE, JOB_EXECUTE_RUN } from './runs.constants';

export interface ExecuteRunJobData {
  runId: string;
  tenantId: string;
  botVersionId: string;
  planHash: string | null;
}

/**
 * Job processor for run execution
 *
 * In production, this would dispatch to external runners.
 * For now, it simulates execution for testing purposes.
 */
@Processor(RUN_QUEUE)
export class RunsProcessor extends WorkerHost {
  private readonly logger = new Logger(RunsProcessor.name);

  constructor(
    private readonly runsService: RunsService,
    @InjectRepository(BotVersion)
    private readonly versionRepository: Repository<BotVersion>,
  ) {
    super();
  }

  async process(job: Job<ExecuteRunJobData>): Promise<any> {
    const { runId, tenantId, botVersionId, planHash } = job.data;

    this.logger.log(`Processing run ${runId} (job ${job.id})`);

    try {
      // Mark as running
      await this.runsService.startRun(runId);

      // Get the execution plan
      const version = await this.versionRepository.findOne({
        where: { id: botVersionId },
      });

      if (!version?.compiledPlan) {
        throw new Error('No compiled plan found');
      }

      const plan = version.compiledPlan as any;

      // In production, this would:
      // 1. Find an available runner with matching capabilities
      // 2. Send the ExecutionPlan to the runner
      // 3. Wait for runner to complete (or timeout)
      // 4. Collect results and artifacts

      // For now, simulate execution
      await this.simulateExecution(runId, plan);

      // Mark as completed
      await this.runsService.completeRun(runId, {
        success: true,
        outputs: {
          stepsExecuted: plan.steps?.length ?? 0,
          simulatedAt: new Date().toISOString(),
        },
      });

      this.logger.log(`Completed run ${runId} successfully`);

      return { success: true, runId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Run ${runId} failed: ${errorMessage}`);

      await this.runsService.completeRun(runId, {
        success: false,
        errorMessage,
      });

      throw error; // Re-throw to mark job as failed
    }
  }

  /**
   * Simulate execution of a plan
   * In production, this would be handled by the Runner
   */
  private async simulateExecution(runId: string, plan: any): Promise<void> {
    const steps = plan.steps ?? [];

    for (const step of steps) {
      // Add step start event
      await this.runsService.addEvent({
        runId,
        stepId: step.stepId,
        nodeId: step.nodeId,
        eventType: RunEventType.STEP_START,
        classification: step.classification,
        controlsApplied: step.controls,
      });

      // Simulate step execution (10-100ms)
      const duration = Math.floor(Math.random() * 90) + 10;
      await this.sleep(duration);

      // Add step end event
      await this.runsService.addEvent({
        runId,
        stepId: step.stepId,
        nodeId: step.nodeId,
        eventType: RunEventType.STEP_END,
        status: 'success',
        durationMs: duration,
        classification: step.classification,
        controlsApplied: step.controls,
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
