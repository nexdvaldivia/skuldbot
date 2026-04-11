import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import {
  Schedule,
  ScheduleExecution,
  WebhookTrigger,
  EventTrigger,
  ScheduleCalendarEntry,
  ScheduleGroup,
} from './entities/schedule.entity';
import { Bot, BotVersion } from '../bots/entities/bot.entity';
import { Run } from '../runs/entities/run.entity';
import { SchedulesService } from './schedules.service';
import {
  SchedulesController,
  BotSchedulesController,
  SchedulerAdminController,
} from './schedules.controller';
import { SchedulerService } from './scheduler.service';
import { DispatchModule } from '../dispatch/dispatch.module';

/**
 * Schedules Module.
 *
 * Provides enterprise-grade scheduling capabilities:
 * - Multiple trigger types (cron, interval, calendar, event, webhook)
 * - Timezone-aware scheduling with DST handling
 * - Blackout windows for maintenance periods
 * - Execution quotas and rate limiting
 * - Overlap and catchup policies
 * - SLA tracking and alerting
 * - Webhook and event-based triggers
 * - Distributed locking for HA deployments
 * - Complete audit trail
 */
@Module({
  imports: [
    ConfigModule,
    NestScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      // Core entities
      Schedule,
      ScheduleExecution,
      WebhookTrigger,
      EventTrigger,
      ScheduleCalendarEntry,
      ScheduleGroup,
      // Related entities
      Bot,
      BotVersion,
      Run,
    ]),
    forwardRef(() => DispatchModule),
  ],
  controllers: [
    SchedulesController,
    BotSchedulesController,
    SchedulerAdminController,
  ],
  providers: [SchedulesService, SchedulerService],
  exports: [SchedulesService, SchedulerService],
})
export class SchedulesModule {}
