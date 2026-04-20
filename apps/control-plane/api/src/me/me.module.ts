import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentConfig } from '../billing/entities/payment-config.entity';
import { TenantSubscription } from '../billing/entities/subscription.entity';
import { BillingModule } from '../billing/billing.module';
import { Client } from '../clients/entities/client.entity';
import { ClientsModule } from '../clients/clients.module';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [
    ClientsModule,
    UsersModule,
    BillingModule,
    TypeOrmModule.forFeature([
      Client,
      User,
      Tenant,
      TenantSubscription,
      PaymentConfig,
      SecurityAuditEvent,
    ]),
  ],
  controllers: [MeController, ProfileController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
