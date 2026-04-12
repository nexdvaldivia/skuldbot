import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchemasController } from './schemas.controller';
import { SchemasService } from './schemas.service';
import { DiscoveredSchema } from './entities/discovered-schema.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DiscoveredSchema])],
  controllers: [SchemasController],
  providers: [SchemasService],
  exports: [SchemasService],
})
export class SchemasModule {}
