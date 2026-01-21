import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunnersController, RunnerAgentController } from './runners.controller';
import { RunnersService } from './runners.service';
import { RunnerAuthGuard } from './guards/runner-auth.guard';
import { Runner, RunnerPool } from './entities/runner.entity';
import { Run } from '../runs/entities/run.entity';
import { BotVersion } from '../bots/entities/bot.entity';
import { RunsModule } from '../runs/runs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Runner, RunnerPool, Run, BotVersion]),
    forwardRef(() => RunsModule),
  ],
  controllers: [RunnersController, RunnerAgentController],
  providers: [RunnersService, RunnerAuthGuard],
  exports: [RunnersService],
})
export class RunnersModule {}
