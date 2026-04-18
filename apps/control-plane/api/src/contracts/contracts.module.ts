import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientContact } from '../clients/entities/client-contact.entity';
import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ContractGateService } from './contract-gate.service';
import { ContractLegalService } from './contract-legal.service';
import { ContractLookupsService } from './contract-lookups.service';
import { ContractRequirementService } from './contract-requirement.service';
import { ContractSignatoryPolicyService } from './contract-signatory-policy.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractTemplateService } from './contract-template.service';
import { ContractsController } from './contracts.controller';
import { PublicSigningController } from './public-signing.controller';
import { PublicSigningService } from './public-signing.service';
import { ContractsService } from './contracts.service';
import { ContractAcceptance } from './entities/contract-acceptance.entity';
import { ContractComplianceFrameworkLookup } from './entities/contract-compliance-framework-lookup.entity';
import { ContractEnvelopeEvent } from './entities/contract-envelope-event.entity';
import { ContractEnvelopeRecipient } from './entities/contract-envelope-recipient.entity';
import { ContractEnvelope } from './entities/contract-envelope.entity';
import { ContractJurisdictionLookup } from './entities/contract-jurisdiction-lookup.entity';
import { ContractLegalInfo } from './entities/contract-legal-info.entity';
import { ContractRequirement } from './entities/contract-requirement.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';
import { ContractSignatoryPolicy } from './entities/contract-signatory-policy.entity';
import { ContractTypeLookup } from './entities/contract-type-lookup.entity';
import { ContractEvent } from './entities/contract-event.entity';
import { ContractSigner } from './entities/contract-signer.entity';
import { SigningDocument } from './entities/signing-document.entity';
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
      SigningDocument,
      ContractAcceptance,
      ContractRequirement,
      ContractSignatory,
      ContractSignatoryPolicy,
      ContractLegalInfo,
      ContractTypeLookup,
      ContractJurisdictionLookup,
      ContractComplianceFrameworkLookup,
      Client,
      ClientContact,
      Tenant,
    ]),
  ],
  controllers: [ContractsController, PublicSigningController],
  providers: [
    ContractsService,
    PdfService,
    ContractTemplateService,
    ContractSigningService,
    ContractLookupsService,
    ContractRequirementService,
    ContractLegalService,
    ContractSignatoryPolicyService,
    ContractGateService,
    PublicSigningService,
  ],
  exports: [ContractsService, ContractGateService, ContractRequirementService],
})
export class ContractsModule {}
