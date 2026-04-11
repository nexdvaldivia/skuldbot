import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { LookupsModule } from '../lookups/lookups.module';

@Module({
  imports: [TypeOrmModule.forFeature([Client]), LookupsModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
