import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Provider } from './s3.provider';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    S3Provider,
    {
      provide: STORAGE_PROVIDER,
      useExisting: S3Provider,
    },
  ],
  exports: [STORAGE_PROVIDER, S3Provider],
})
export class StorageModule {}
