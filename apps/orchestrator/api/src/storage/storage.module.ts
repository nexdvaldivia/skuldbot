import { Module, DynamicModule, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE } from './storage.interface';
import { S3StorageProvider } from './providers/s3.provider';
import { LocalStorageProvider } from './providers/local.provider';

@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    const storageProvider: Provider = {
      provide: STORAGE_SERVICE,
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('storage.provider');

        switch (provider) {
          case 's3':
            return new S3StorageProvider(configService);
          case 'local':
            return new LocalStorageProvider(configService);
          // TODO: Add Azure, GCS providers
          // case 'azure':
          //   return new AzureBlobStorageProvider(configService);
          // case 'gcs':
          //   return new GCSStorageProvider(configService);
          default:
            throw new Error(`Unknown storage provider: ${provider}`);
        }
      },
      inject: [ConfigService],
    };

    return {
      module: StorageModule,
      imports: [ConfigModule],
      providers: [storageProvider],
      exports: [STORAGE_SERVICE],
      global: true,
    };
  }
}
