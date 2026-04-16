import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { LookupsModule } from '../lookups/lookups.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ContractGateService } from './contract-gate.service';
import { ContractLegalService } from './contract-legal.service';
import { ContractLookupsService } from './contract-lookups.service';
import { ContractRequirementService } from './contract-requirement.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractTemplateService } from './contract-template.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractAcceptance } from './entities/contract-acceptance.entity';
import { ContractEnvelopeEvent } from './entities/contract-envelope-event.entity';
import { ContractEnvelopeRecipient } from './entities/contract-envelope-recipient.entity';
import { ContractEnvelope } from './entities/contract-envelope.entity';
import { ContractLegalInfo } from './entities/contract-legal-info.entity';
import { ContractRequirement } from './entities/contract-requirement.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';
import { ContractEvent } from './entities/contract-event.entity';
import { ContractSigner } from './entities/contract-signer.entity';
import { ContractTemplateVersion } from './entities/contract-template-version.entity';
import { ContractTemplate } from './entities/contract-template.entity';
import { Contract } from './entities/contract.entity';
import { PdfService } from './pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contract,
      ContractSigner,
      ContractEvent,
      ContractTemplate,
      ContractTemplateVersion,
      ContractEnvelope,
      ContractEnvelopeRecipient,
      ContractEnvelopeEvent,
      ContractAcceptance,
      ContractRequirement,
      ContractSignatory,
      ContractLegalInfo,
      Client,
      Tenant,
    ]),
    LookupsModule,
  ],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    PdfService,
    ContractTemplateService,
    ContractSigningService,
    ContractLookupsService,
    ContractRequirementService,
    ContractLegalService,
    ContractGateService,
  ],
  exports: [ContractsService, ContractGateService, ContractRequirementService],
})
export class ContractsModule {}
