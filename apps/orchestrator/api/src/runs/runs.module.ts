import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RunsController, BotRunsController, HitlController } from './runs.controller';
import { RunsService } from './runs.service';
import { RunsProcessor } from './runs.processor';
import { Run, RunEvent, RunArtifact, RunLog, HitlRequest } from './entities/run.entity';
import { Bot, BotVersion } from '../bots/entities/bot.entity';
import { User } from '../users/entities/user.entity';
import { BotsModule } from '../bots/bots.module';
import { RUN_QUEUE } from './runs.constants';

/**
 * Runs Module.
 *
 * Provides comprehensive run/execution management with enterprise features:
 *
 * Core Features:
 * - Run creation with priority queue
 * - Run lifecycle management (pause, resume, cancel)
 * - Automatic retry with exponential backoff
 * - Real-time event streaming
 * - Artifact management
 * - Log aggregation
 *
 * Enterprise Features:
 * - HITL (Human In The Loop) support
 * - Priority-based execution
 * - Parent-child run relationships (sub-bots)
 * - Resource usage tracking
 * - Timeout and deadline management
 * - Notification configuration
 * - Billing and metering
 *
 * Statistics:
 * - Run counts by status
 * - Performance metrics (p50, p95, p99)
 * - Timeline analytics
 * - Success rate tracking
 *
 * Security:
 * - Tenant isolation
 * - Permission-based access
 * - Audit logging for all operations
 * - Data classification for events/artifacts
 *
 * Queue:
 * - BullMQ for reliable job processing
 * - Priority-based scheduling
 * - Automatic retries
 * - Dead letter queue for failed jobs
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Run,
      RunEvent,
      RunArtifact,
      RunLog,
      HitlRequest,
      Bot,
      BotVersion,
      User,
    ]),
    BullModule.registerQueue({
      name: RUN_QUEUE,
      defaultJobOptions: {
        attempts: 1, // Retries handled by service, not queue
        removeOnComplete: {
          count: 1000,
          age: 24 * 60 * 60, // 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 60 * 60, // 7 days
        },
      },
    }),
    BotsModule,
  ],
  controllers: [RunsController, BotRunsController, HitlController],
  providers: [RunsService, RunsProcessor],
  exports: [RunsService],
})
export class RunsModule {}
