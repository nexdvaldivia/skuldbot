import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ContractGateService } from './contract-gate.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractEvent } from './entities/contract-event.entity';
import { ContractSigner } from './entities/contract-signer.entity';
import { Contract } from './entities/contract.entity';
import { PdfService } from './pdf.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, ContractSigner, ContractEvent, Client, Tenant])],
  controllers: [ContractsController],
  providers: [ContractsService, PdfService, ContractGateService],
  exports: [ContractsService, ContractGateService],
})
export class ContractsModule {}
