import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderConfig } from './entities/provider-config.entity';
import { ProviderFactoryService } from './provider-factory.service';
import { ProviderRegistry } from './provider-registry.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ProviderConfig])],
  providers: [ProviderRegistry, ProviderFactoryService],
  exports: [ProviderRegistry, ProviderFactoryService, TypeOrmModule],
})
export class ProviderRuntimeModule {}
