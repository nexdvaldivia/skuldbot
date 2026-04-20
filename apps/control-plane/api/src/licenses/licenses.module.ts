import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { License } from './entities/license.entity';
import { LicenseAudit } from './entities/license-audit.entity';
import { LicenseTypeFeature } from './entities/license-type-feature.entity';
import { QuotaPolicy, UsageCounter } from './entities/quota.entity';
import { LicenseRuntimeDecision } from './entities/license-runtime-decision.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { LicensingRuntimeController } from './licensing-runtime.controller';
import { OrchestratorFleetAuthGuard } from '../orchestrators/guards/orchestrator-fleet-auth.guard';
import { LookupsModule } from '../lookups/lookups.module';
import { ContractsModule } from '../contracts/contracts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      License,
      LicenseAudit,
      LicenseTypeFeature,
      Tenant,
      QuotaPolicy,
      UsageCounter,
      LicenseRuntimeDecision,
    ]),
    LookupsModule,
    ContractsModule,
  ],
  controllers: [LicensesController, LicensingRuntimeController],
  providers: [LicensesService, OrchestratorFleetAuthGuard],
  exports: [LicensesService],
})
export class LicensesModule {}
