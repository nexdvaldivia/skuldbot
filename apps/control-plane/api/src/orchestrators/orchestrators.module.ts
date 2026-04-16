import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../contracts/contracts.module';
import { OrchestratorInstance } from './entities/orchestrator-instance.entity';
import { OrchestratorsController } from './orchestrators.controller';
import { OrchestratorsService } from './orchestrators.service';
import { OrchestratorFleetAuthGuard } from './guards/orchestrator-fleet-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([OrchestratorInstance]), ContractsModule],
  controllers: [OrchestratorsController],
  providers: [OrchestratorsService, OrchestratorFleetAuthGuard],
  exports: [OrchestratorsService],
})
export class OrchestratorsModule {}
