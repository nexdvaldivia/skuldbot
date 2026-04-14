import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SendGridProvider } from './sendgrid.provider';
import { SmtpProvider } from './smtp.provider';
import { EmailProvider, IntegrationType } from '../../common/interfaces/integration.interface';

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    SendGridProvider,
    SmtpProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        configService: ConfigService,
        sendgrid: SendGridProvider,
        smtp: SmtpProvider,
      ): EmailProvider => {
        const logger = new Logger('EmailProviderFactory');
        const byName = new Map<string, EmailProvider>([
          [sendgrid.name, sendgrid],
          [smtp.name, smtp],
        ]);

        const configuredChain = resolveProviderChain(
          configService.get<string>('EMAIL_PROVIDER_CHAIN'),
          configService.get<string>('EMAIL_PROVIDER'),
          ['sendgrid', 'smtp'],
        )
          .map((name) => byName.get(name))
          .filter((provider): provider is EmailProvider => Boolean(provider));

        const fallbackChain = configuredChain.length > 0 ? configuredChain : [sendgrid];
        const chainLabel = fallbackChain.map((provider) => provider.name).join(' -> ');
        logger.log(`Email provider chain initialized: ${chainLabel}`);

        const executeWithFallback = async <T>(
          operation: string,
          executor: (provider: EmailProvider) => Promise<T>,
        ): Promise<T> => {
          const attempted: string[] = [];
          const errors: string[] = [];

          for (const provider of fallbackChain) {
            if (!provider.isConfigured()) {
              continue;
            }

            attempted.push(provider.name);
            try {
              return await executor(provider);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'unknown_error';
              errors.push(`${provider.name}: ${message}`);
              logger.warn(
                `Email provider "${provider.name}" failed for "${operation}", trying fallback...`,
              );
            }
          }

          throw new Error(
            `All email providers failed for "${operation}". Attempted: ${attempted.join(', ') || 'none'}. Errors: ${errors.join(' | ')}`,
          );
        };

        return {
          name: 'email-fallback',
          type: IntegrationType.EMAIL,
          isConfigured: () => fallbackChain.some((provider) => provider.isConfigured()),
          healthCheck: async () => {
            for (const provider of fallbackChain) {
              if (!provider.isConfigured()) {
                continue;
              }
              if (await provider.healthCheck()) {
                return true;
              }
            }
            return false;
          },
          send: async (data) =>
            executeWithFallback('send', async (provider) => provider.send(data)),
          sendTemplate: async (data) =>
            executeWithFallback('sendTemplate', async (provider) => provider.sendTemplate(data)),
        };
      },
      inject: [ConfigService, SendGridProvider, SmtpProvider],
    },
  ],
  exports: [EMAIL_PROVIDER, SendGridProvider, SmtpProvider],
})
export class EmailModule {}

function resolveProviderChain(
  chainFromEnv?: string,
  preferredProvider?: string,
  defaultChain: string[] = [],
): string[] {
  const chain = (chainFromEnv || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const ordered = [...(preferredProvider ? [preferredProvider] : []), ...chain, ...defaultChain];

  return [...new Set(ordered)];
}
