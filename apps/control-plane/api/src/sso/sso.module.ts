import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { License } from '../licenses/entities/license.entity';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, License])],
  controllers: [SsoController],
  providers: [SsoService],
  exports: [SsoService],
})
export class SsoModule {}
