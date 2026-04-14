import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntegrationType, StorageProvider } from '../../common/interfaces/integration.interface';
import { AzureBlobProvider } from './azure-blob.provider';
import { S3Provider } from './s3.provider';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    S3Provider,
    AzureBlobProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (
        configService: ConfigService,
        s3Provider: S3Provider,
        azureBlobProvider: AzureBlobProvider,
      ): StorageProvider => {
        const logger = new Logger('StorageProviderFactory');
        const byName = new Map<string, StorageProvider>([
          [s3Provider.name, s3Provider],
          [azureBlobProvider.name, azureBlobProvider],
        ]);

        const configuredChain = resolveProviderChain(
          configService.get<string>('STORAGE_PROVIDER_CHAIN'),
          configService.get<string>('STORAGE_PROVIDER'),
          ['s3', 'azure-blob'],
        )
          .map((name) => byName.get(name))
          .filter((provider): provider is StorageProvider => Boolean(provider));

        const fallbackChain = configuredChain.length > 0 ? configuredChain : [s3Provider];
        const chainLabel = fallbackChain.map((provider) => provider.name).join(' -> ');
        logger.log(`Storage provider chain initialized: ${chainLabel}`);

        const executeWithFallback = async <T>(
          operation: string,
          executor: (provider: StorageProvider) => Promise<T>,
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
                `Storage provider "${provider.name}" failed for "${operation}", trying fallback...`,
              );
            }
          }

          throw new Error(
            `All storage providers failed for "${operation}". Attempted: ${attempted.join(', ') || 'none'}. Errors: ${errors.join(' | ')}`,
          );
        };

        return {
          name: 'storage-fallback',
          type: IntegrationType.STORAGE,
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
          upload: async (data) =>
            executeWithFallback('upload', async (provider) => provider.upload(data)),
          download: async (key) =>
            executeWithFallback('download', async (provider) => provider.download(key)),
          delete: async (key) =>
            executeWithFallback('delete', async (provider) => provider.delete(key)),
          getSignedUrl: async (key, expiresIn) =>
            executeWithFallback('getSignedUrl', async (provider) =>
              provider.getSignedUrl(key, expiresIn),
            ),
          list: async (prefix) =>
            executeWithFallback('list', async (provider) => provider.list(prefix)),
        };
      },
      inject: [ConfigService, S3Provider, AzureBlobProvider],
    },
  ],
  exports: [STORAGE_PROVIDER, S3Provider, AzureBlobProvider],
})
export class StorageModule {}

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
