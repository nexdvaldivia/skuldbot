import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailProvider, IntegrationType } from '../../common/interfaces/integration.interface';
import { resolveProviderChain } from '../provider-chain.util';
import { ProviderFactoryService } from '../provider-factory.service';
import { ProviderRegistry } from '../provider-registry.service';
import { ProviderRuntimeModule } from '../provider-runtime.module';
import { SendGridProvider } from './sendgrid.provider';
import { SmtpProvider } from './smtp.provider';

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule, ProviderRuntimeModule],
  providers: [
    SendGridProvider,
    SmtpProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        configService: ConfigService,
        providerFactory: ProviderFactoryService,
        sendgrid: SendGridProvider,
        smtp: SmtpProvider,
      ): EmailProvider => {
        const providerChain = resolveProviderChain(
          configService.get<string>('EMAIL_PROVIDER_CHAIN'),
          configService.get<string>('EMAIL_PROVIDER'),
          ['sendgrid', 'smtp'],
        );

        const localProviders = [sendgrid, smtp];

        return {
          name: 'email-fallback',
          type: IntegrationType.EMAIL,
          isConfigured: () => localProviders.some((provider) => provider.isConfigured()),
          healthCheck: async () => {
            const chain = await providerFactory.resolveChain<EmailProvider>(IntegrationType.EMAIL, {
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
              IntegrationType.EMAIL,
              'send',
              async (provider: EmailProvider) => provider.send(data),
              {
                tenantId: data.tenantId,
                preferredProvider: data.preferredProvider,
                providerChain,
              },
            );
            return result;
          },
          sendTemplate: async (data) => {
            const { result } = await providerFactory.executeWithFallback(
              IntegrationType.EMAIL,
              'sendTemplate',
              async (provider: EmailProvider) => provider.sendTemplate(data),
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
      inject: [ConfigService, ProviderFactoryService, SendGridProvider, SmtpProvider],
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly sendGridProvider: SendGridProvider,
    private readonly smtpProvider: SmtpProvider,
  ) {}

  onModuleInit() {
    this.providerRegistry.register(this.sendGridProvider, true);
    this.providerRegistry.register(this.smtpProvider);
  }
}
