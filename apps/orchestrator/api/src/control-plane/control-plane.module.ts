import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ControlPlaneSyncService } from './control-plane-sync.service';
import { UsageReporterService } from './usage-reporter.service';
import { UsageBatchProcessor } from './usage-batch.processor';
import { HealthReporterService } from './health-reporter.service';
import { LicenseModule } from '../license/license.module';

/**
 * Control-Plane Module - Orchestrator ↔ Control-Plane Communication
 *
 * This module handles all communication between the Orchestrator and the
 * central Control-Plane, including:
 *
 * 1. **Usage Reporting** (Batch)
 *    - Collects billing events from bot executions
 *    - Batches events every 5 minutes (configurable)
 *    - Sends to Control-Plane for Stripe metered billing
 *    - Handles retry logic for failed submissions
 *
 * 2. **Health Reporting**
 *    - Reports Orchestrator health status periodically
 *    - Includes metrics: active runs, queue depth, runner status
 *    - Used for SLA monitoring and alerting
 *
 * 3. **Bot Package Sync** (Future)
 *    - Sync marketplace bot packages from Control-Plane
 *    - Download and cache bot packages locally
 *    - Verify signatures and hashes
 *
 * 4. **License Validation**
 *    - Periodic license validation (handled by LicenseModule)
 *    - Feature flag updates
 *
 * Communication:
 * - Uses HTTPS with API key authentication
 * - Supports offline mode with local caching
 * - Graceful degradation on connection failures
 *
 * Security:
 * - API keys stored in config/env
 * - All data encrypted in transit (TLS)
 * - No sensitive data sent to Control-Plane (only aggregates)
 */
@Module({
  imports: [
    ConfigModule,
    LicenseModule,
    BullModule.registerQueue({
      name: 'control-plane',
    }),
  ],
  providers: [ControlPlaneSyncService, UsageReporterService, UsageBatchProcessor, HealthReporterService],
  exports: [ControlPlaneSyncService, UsageReporterService, HealthReporterService],
})
export class ControlPlaneModule {}
