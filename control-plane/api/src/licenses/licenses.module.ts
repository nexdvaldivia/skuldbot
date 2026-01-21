import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { License } from './entities/license.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([License, Tenant])],
  controllers: [LicensesController],
  providers: [LicensesService],
  exports: [LicensesService],
})
export class LicensesModule {}
