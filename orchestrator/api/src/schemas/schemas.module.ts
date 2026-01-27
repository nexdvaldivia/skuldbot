import { Module } from '@nestjs/common';
import { SchemasController } from './schemas.controller';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [ControlPlaneModule],
  controllers: [SchemasController],
})
export class SchemasModule {}


