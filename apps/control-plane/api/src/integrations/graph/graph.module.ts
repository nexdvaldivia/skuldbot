import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProviderRegistry } from '../provider-registry.service';
import { ProviderRuntimeModule } from '../provider-runtime.module';
import { MicrosoftGraphProvider } from './graph.provider';

export const GRAPH_PROVIDER = 'GRAPH_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule, ProviderRuntimeModule],
  providers: [
    MicrosoftGraphProvider,
    {
      provide: GRAPH_PROVIDER,
      useExisting: MicrosoftGraphProvider,
    },
  ],
  exports: [GRAPH_PROVIDER],
})
export class GraphModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly microsoftGraphProvider: MicrosoftGraphProvider,
  ) {}

  onModuleInit() {
    this.providerRegistry.register(this.microsoftGraphProvider, true);
  }
}
