import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { ClientContact } from './entities/client-contact.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { LookupsModule } from '../lookups/lookups.module';
import { ClientContactsService } from './client-contacts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientContact]), LookupsModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientContactsService],
  exports: [ClientsService, ClientContactsService],
})
export class ClientsModule {}
