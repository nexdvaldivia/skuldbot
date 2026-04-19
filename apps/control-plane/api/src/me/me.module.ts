import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantSubscription } from '../billing/entities/subscription.entity';
import { ClientsModule } from '../clients/clients.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [ClientsModule, TypeOrmModule.forFeature([Tenant, TenantSubscription])],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
