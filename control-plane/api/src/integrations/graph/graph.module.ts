import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MicrosoftGraphProvider } from './graph.provider';

export const GRAPH_PROVIDER = 'GRAPH_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MicrosoftGraphProvider,
    {
      provide: GRAPH_PROVIDER,
      useExisting: MicrosoftGraphProvider,
    },
  ],
  exports: [GRAPH_PROVIDER, MicrosoftGraphProvider],
})
export class GraphModule {}
