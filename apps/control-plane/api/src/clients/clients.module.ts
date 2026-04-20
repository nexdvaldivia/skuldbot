import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { ClientContact } from './entities/client-contact.entity';
import { ClientAddress } from './entities/client-address.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { LookupsModule } from '../lookups/lookups.module';
import { ClientContactsService } from './client-contacts.service';
import { ClientAddressesService } from './client-addresses.service';
import { ClientContactsController } from './client-contacts.controller';
import { ClientAddressesController } from './client-addresses.controller';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { TenantSubscription } from '../billing/entities/subscription.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      ClientContact,
      ClientAddress,
      Tenant,
      User,
      TenantSubscription,
    ]),
    LookupsModule,
  ],
  controllers: [ClientsController, ClientContactsController, ClientAddressesController],
  providers: [ClientsService, ClientContactsService, ClientAddressesService],
  exports: [ClientsService, ClientContactsService, ClientAddressesService],
})
export class ClientsModule {}
