import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntegrationType, StorageProvider } from '../../common/interfaces/integration.interface';
import { ProviderFactoryService } from '../provider-factory.service';
import { resolveProviderChain } from '../provider-chain.util';
import { ProviderRegistry } from '../provider-registry.service';
import { ProviderRuntimeModule } from '../provider-runtime.module';
import { AzureBlobProvider } from './azure-blob.provider';
import { S3Provider } from './s3.provider';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule, ProviderRuntimeModule],
  providers: [
    S3Provider,
    AzureBlobProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (
        configService: ConfigService,
        providerFactory: ProviderFactoryService,
        s3Provider: S3Provider,
        azureBlobProvider: AzureBlobProvider,
      ): StorageProvider => {
        const providerChain = resolveProviderChain(
          configService.get<string>('STORAGE_PROVIDER_CHAIN'),
          configService.get<string>('STORAGE_PROVIDER'),
          ['s3', 'azure-blob'],
        );

        const localProviders = [s3Provider, azureBlobProvider];

        return {
          name: 'storage-fallback',
          type: IntegrationType.STORAGE,
          isConfigured: () => localProviders.some((provider) => provider.isConfigured()),
          healthCheck: async () => {
            const chain = await providerFactory.resolveChain<StorageProvider>(
              IntegrationType.STORAGE,
              {
                providerChain,
              },
            );
            for (const provider of chain) {
              if (await provider.healthCheck()) {
                return true;
              }
            }
            return false;
          },
          upload: async (data) => {
            const { result } = await providerFactory.executeWithFallback(
              IntegrationType.STORAGE,
              'upload',
              async (provider: StorageProvider) => provider.upload(data),
              {
                tenantId: data.tenantId,
                preferredProvider: data.preferredProvider,
                providerChain,
              },
            );
            return result;
          },
          download: async (key) => {
            const { result } = await providerFactory.executeWithFallback(
              IntegrationType.STORAGE,
              'download',
              async (provider: StorageProvider) => provider.download(key),
              { providerChain },
            );
            return result;
          },
          delete: async (key) => {
            const { result } = await providerFactory.executeWithFallback(
              IntegrationType.STORAGE,
              'delete',
              async (provider: StorageProvider) => provider.delete(key),
              { providerChain },
            );
            return result;
          },
          getSignedUrl: async (key, expiresIn) => {
            const { result } = await providerFactory.executeWithFallback(
              IntegrationType.STORAGE,
              'getSignedUrl',
              async (provider: StorageProvider) => provider.getSignedUrl(key, expiresIn),
              { providerChain },
            );
            return result;
          },
          list: async (prefix) => {
            const { result } = await providerFactory.executeWithFallback(
              IntegrationType.STORAGE,
              'list',
              async (provider: StorageProvider) => provider.list(prefix),
              { providerChain },
            );
            return result;
          },
        };
      },
      inject: [ConfigService, ProviderFactoryService, S3Provider, AzureBlobProvider],
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly s3Provider: S3Provider,
    private readonly azureBlobProvider: AzureBlobProvider,
  ) {}

  onModuleInit() {
    this.providerRegistry.register(this.s3Provider, true);
    this.providerRegistry.register(this.azureBlobProvider);
  }
}
