import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntegrationType, SmsProvider } from '../../common/interfaces/integration.interface';
import { resolveProviderChain } from '../provider-chain.util';
import { ProviderFactoryService } from '../provider-factory.service';
import { ProviderRegistry } from '../provider-registry.service';
import { ProviderRuntimeModule } from '../provider-runtime.module';
import { NoopSmsProvider } from './noop-sms.provider';
import { TwilioSmsProvider } from './twilio-sms.provider';

export const SMS_PROVIDER = 'SMS_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule, ProviderRuntimeModule],
  providers: [
    TwilioSmsProvider,
    NoopSmsProvider,
    {
      provide: SMS_PROVIDER,
      useFactory: (
        configService: ConfigService,
        providerFactory: ProviderFactoryService,
        twilioProvider: TwilioSmsProvider,
        noopSmsProvider: NoopSmsProvider,
      ): SmsProvider => {
        const providerChain = resolveProviderChain(
          configService.get<string>('SMS_PROVIDER_CHAIN'),
          configService.get<string>('SMS_PROVIDER'),
          ['twilio', 'noop-sms'],
        );

        const localProviders = [twilioProvider, noopSmsProvider];

        return {
          name: 'sms-fallback',
          type: IntegrationType.SMS,
          isConfigured: () => localProviders.some((provider) => provider.isConfigured()),
          healthCheck: async () => {
            const chain = await providerFactory.resolveChain<SmsProvider>(IntegrationType.SMS, {
              providerChain,
            });
            for (const provider of chain) {
              if (await provider.healthCheck()) {
                return true;
              }
            }
            return false;
          },
          send: async (data) => {
            const { result } = await providerFactory.executeWithFallback(
              IntegrationType.SMS,
              'send',
              async (provider: SmsProvider) => provider.send(data),
              {
                tenantId: data.tenantId,
                preferredProvider: data.preferredProvider,
                providerChain,
              },
            );
            return result;
          },
        };
      },
      inject: [ConfigService, ProviderFactoryService, TwilioSmsProvider, NoopSmsProvider],
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly twilioSmsProvider: TwilioSmsProvider,
    private readonly noopSmsProvider: NoopSmsProvider,
  ) {}

  onModuleInit() {
    this.providerRegistry.register(this.twilioSmsProvider, true);
    this.providerRegistry.register(this.noopSmsProvider);
  }
}
