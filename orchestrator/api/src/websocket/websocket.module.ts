import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeGateway } from './websocket.gateway';
import { RunnerGateway } from './runner.gateway';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RealtimeGateway, RunnerGateway],
  exports: [RealtimeGateway, RunnerGateway],
})
export class WebsocketModule {}
