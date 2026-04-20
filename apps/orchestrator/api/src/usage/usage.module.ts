import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageEvent } from './entities/usage-event.entity';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

/**
 * Usage Module
 *
 * Handles tracking and reporting of billable usage events.
 *
 * Features:
 * - Persist usage events locally
 * - Forward events to Control-Plane for billing
 * - Query usage summaries and reports
 * - Support for marketplace bot installations
 *
 * Integration:
 * - Runners call /usage/track to report events
 * - ControlPlaneModule batches and sends to Control-Plane
 * - Control-Plane forwards to Stripe for metered billing
 */
@Module({
  imports: [TypeOrmModule.forFeature([UsageEvent]), ControlPlaneModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
