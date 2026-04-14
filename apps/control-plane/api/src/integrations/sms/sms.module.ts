import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProviderRegistry } from '../provider-registry.service';
import { ProviderRuntimeModule } from '../provider-runtime.module';
import { NoopSmsProvider } from './noop-sms.provider';

export const SMS_PROVIDER = 'SMS_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule, ProviderRuntimeModule],
  providers: [
    NoopSmsProvider,
    {
      provide: SMS_PROVIDER,
      useExisting: NoopSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly noopSmsProvider: NoopSmsProvider,
  ) {}

  onModuleInit() {
    this.providerRegistry.register(this.noopSmsProvider, true);
  }
}
