import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { ClientApiKeyAudit } from './entities/client-api-key-audit.entity';
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
import { InvoiceEntity } from '../integrations/payment/entities/invoice.entity';
import { UsageRecord } from '../billing/entities/usage-record.entity';
import { Ticket } from '../tickets/entities/ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      ClientContact,
      ClientAddress,
      ClientApiKeyAudit,
      Tenant,
      User,
      TenantSubscription,
      InvoiceEntity,
      UsageRecord,
      Ticket,
    ]),
    LookupsModule,
  ],
  controllers: [ClientsController, ClientContactsController, ClientAddressesController],
  providers: [ClientsService, ClientContactsService, ClientAddressesService],
  exports: [ClientsService, ClientContactsService, ClientAddressesService],
})
export class ClientsModule {}
