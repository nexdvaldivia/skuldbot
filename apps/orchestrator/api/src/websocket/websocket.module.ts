import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeGateway } from './websocket.gateway';
import { RunnerGateway } from './runner.gateway';
import { RunnersModule } from '../runners/runners.module';

@Global()
@Module({
  imports: [ConfigModule, RunnersModule],
  providers: [RealtimeGateway, RunnerGateway],
  exports: [RealtimeGateway, RunnerGateway],
})
export class WebsocketModule {}
