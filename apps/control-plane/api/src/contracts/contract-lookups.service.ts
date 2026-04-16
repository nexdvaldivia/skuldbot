import { Injectable } from '@nestjs/common';
import { LookupValue } from '../lookups/entities/lookup-value.entity';
import { LookupsService } from '../lookups/lookups.service';
import {
  LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK,
  LOOKUP_DOMAIN_CONTRACT_JURISDICTION,
  LOOKUP_DOMAIN_CONTRACT_TYPE,
} from '../lookups/lookups.constants';
import { ContractLookupsResponseDto } from './dto/legal.dto';

@Injectable()
export class ContractLookupsService {
  constructor(private readonly lookupsService: LookupsService) {}

  async getContractLookups(): Promise<ContractLookupsResponseDto> {
    const [contractTypes, jurisdictions, complianceFrameworks] = await Promise.all([
      this.lookupsService.listValuesByDomainCode(LOOKUP_DOMAIN_CONTRACT_TYPE),
      this.lookupsService.listValuesByDomainCode(LOOKUP_DOMAIN_CONTRACT_JURISDICTION),
      this.lookupsService.listValuesByDomainCode(LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK),
    ]);

    return {
      contractTypes: contractTypes.map((value) => this.toLookupItem(value)),
      jurisdictions: jurisdictions.map((value) => this.toLookupItem(value)),
      complianceFrameworks: complianceFrameworks.map((value) => this.toLookupItem(value)),
    };
  }

  private toLookupItem(value: LookupValue): {
    code: string;
    label: string;
    description: string | null;
    sortOrder: number;
    metadata: Record<string, unknown>;
  } {
    return {
      code: value.code,
      label: value.label,
      description: value.description,
      sortOrder: value.sortOrder,
      metadata: value.metadata ?? {},
    };
  }
}
