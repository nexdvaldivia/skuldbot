import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Runner } from '../runners/entities/runner.entity';
import { Run } from '../runs/entities/run.entity';
import { Bot, BotVersion } from '../bots/entities/bot.entity';
import { DispatchService } from './dispatch.service';
import { InfraPowerService } from './infra-power.service';
import { RunsProcessor } from './runs.processor';
import { RunnersModule } from '../runners/runners.module';
import { RunsModule } from '../runs/runs.module';
import { BotsModule } from '../bots/bots.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Runner, Run, Bot, BotVersion]),
    BullModule.registerQueue({
      name: 'runs',
    }),
    forwardRef(() => RunnersModule),
    forwardRef(() => RunsModule),
    forwardRef(() => BotsModule),
    WebsocketModule,
    CredentialsModule,
  ],
  providers: [DispatchService, InfraPowerService, RunsProcessor],
  exports: [DispatchService, InfraPowerService],
})
export class DispatchModule {}
