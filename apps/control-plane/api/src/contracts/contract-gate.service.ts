import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateLicenseDto } from '../licenses/dto/license.dto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Contract, ContractStatus } from './entities/contract.entity';

export enum ContractGateAction {
  DEPLOY_ORCHESTRATOR = 'deploy_orchestrator',
  LICENSE_CREATE = 'license_create',
  PROCESS_PHI = 'process_phi',
  PROCESS_EU_PII = 'process_eu_pii',
}

type ContractRequirementType = 'MSA' | 'BAA' | 'DPA';

export type ContractGateValidationResult = {
  allowed: boolean;
  missing: string[];
};

const DEFAULT_GATE_REQUIREMENTS: Record<ContractGateAction, ContractRequirementType[]> = {
  [ContractGateAction.DEPLOY_ORCHESTRATOR]: ['MSA'],
  [ContractGateAction.LICENSE_CREATE]: ['MSA'],
  [ContractGateAction.PROCESS_PHI]: ['BAA'],
  [ContractGateAction.PROCESS_EU_PII]: ['DPA'],
};

@Injectable()
export class ContractGateService {
  private readonly gateRequirements: Record<ContractGateAction, ContractRequirementType[]>;

  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly configService: ConfigService,
  ) {
    this.gateRequirements = this.loadGateRequirements();
  }

  async validateContractRequirements(
    clientId: string,
    action: ContractGateAction,
    tenantId?: string | null,
  ): Promise<ContractGateValidationResult> {
    if (!clientId) {
      throw new BadRequestException({
        code: 'CONTRACT_GATE_CLIENT_REQUIRED',
        message: 'Client scope is required for contract gate validation.',
      });
    }

    const required = this.gateRequirements[action] ?? [];
    if (required.length === 0) {
      return { allowed: true, missing: [] };
    }

    const signedContracts = await this.contractRepository.find({
      where: {
        clientId,
        status: ContractStatus.SIGNED,
      },
    });

    const presentTypes = new Set<ContractRequirementType>();
    for (const contract of signedContracts) {
      if (contract.status !== ContractStatus.SIGNED) {
        continue;
      }
      if (tenantId && contract.tenantId && contract.tenantId !== tenantId) {
        continue;
      }
      for (const type of this.inferContractTypes(contract)) {
        presentTypes.add(type);
      }
    }

    const missing = required.filter((type) => !presentTypes.has(type));
    return {
      allowed: missing.length === 0,
      missing,
    };
  }

  async validateForTenant(
    tenantId: string,
    action: ContractGateAction,
  ): Promise<ContractGateValidationResult> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${tenantId} was not found for contract gate validation.`,
      });
    }

    return this.validateContractRequirements(tenant.clientId, action, tenant.id);
  }

  async validateForLicenseCreate(dto: CreateLicenseDto): Promise<ContractGateValidationResult> {
    const tenant = await this.tenantRepository.findOne({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${dto.tenantId} was not found for contract gate validation.`,
      });
    }

    const actions = this.resolveLicenseActions(dto, tenant);
    const requiredTypes = new Set<ContractRequirementType>();
    for (const action of actions) {
      for (const requirement of this.gateRequirements[action] ?? []) {
        requiredTypes.add(requirement);
      }
    }

    if (requiredTypes.size === 0) {
      return { allowed: true, missing: [] };
    }

    const signedContracts = await this.contractRepository.find({
      where: {
        clientId: tenant.clientId,
        status: ContractStatus.SIGNED,
      },
    });

    const presentTypes = new Set<ContractRequirementType>();
    for (const contract of signedContracts) {
      if (contract.status !== ContractStatus.SIGNED) {
        continue;
      }
      if (contract.tenantId && contract.tenantId !== tenant.id) {
        continue;
      }
      for (const type of this.inferContractTypes(contract)) {
        presentTypes.add(type);
      }
    }

    const missing = Array.from(requiredTypes).filter((type) => !presentTypes.has(type));
    return {
      allowed: missing.length === 0,
      missing,
    };
  }

  private resolveLicenseActions(dto: CreateLicenseDto, tenant: Tenant): ContractGateAction[] {
    const actions = new Set<ContractGateAction>([ContractGateAction.LICENSE_CREATE]);
    const type = dto.type.trim().toLowerCase();
    const features = (dto.features ?? {}) as Record<string, unknown>;
    const tenantSignals = this.extractComplianceSignals(tenant);

    if (type.includes('hipaa') || type.includes('health')) {
      actions.add(ContractGateAction.PROCESS_PHI);
    }

    if (type.includes('gdpr') || type.includes('eu')) {
      actions.add(ContractGateAction.PROCESS_EU_PII);
    }

    if (
      this.hasTruthyFlag(features, ['processesPhi', 'processPhi', 'containsPhi', 'requiresBaa'])
    ) {
      actions.add(ContractGateAction.PROCESS_PHI);
    }

    if (
      this.hasTruthyFlag(features, [
        'processesEuPii',
        'processesPiiEu',
        'requiresDpa',
        'gdpr',
        'euDataResidency',
      ])
    ) {
      actions.add(ContractGateAction.PROCESS_EU_PII);
    }

    if (tenantSignals.has('hipaa') || tenantSignals.has('phi')) {
      actions.add(ContractGateAction.PROCESS_PHI);
    }

    if (tenantSignals.has('gdpr') || tenantSignals.has('eu_pii') || tenantSignals.has('dpa')) {
      actions.add(ContractGateAction.PROCESS_EU_PII);
    }

    return Array.from(actions);
  }

  private extractComplianceSignals(tenant: Tenant): Set<string> {
    const signals = new Set<string>();
    const buckets = [tenant.settings, tenant.metadata];

    for (const bucket of buckets) {
      if (!bucket || typeof bucket !== 'object') {
        continue;
      }

      const record = bucket as Record<string, unknown>;
      const compliance = record['compliance'];
      if (Array.isArray(compliance)) {
        for (const entry of compliance) {
          if (typeof entry === 'string') {
            signals.add(entry.trim().toLowerCase());
          }
        }
      } else if (typeof compliance === 'string') {
        signals.add(compliance.trim().toLowerCase());
      }

      for (const key of ['hipaa', 'phi', 'gdpr', 'eu_pii', 'dpa']) {
        if (record[key] === true) {
          signals.add(key);
        }
      }
    }

    return signals;
  }

  private hasTruthyFlag(source: Record<string, unknown>, keys: string[]): boolean {
    return keys.some((key) => source[key] === true);
  }

  private inferContractTypes(contract: Contract): Set<ContractRequirementType> {
    const hints = new Set<ContractRequirementType>();
    const metadata = (contract.metadata ?? {}) as Record<string, unknown>;
    const metadataType = this.readMetadataType(metadata);
    const source = `${contract.templateKey} ${contract.title} ${metadataType}`.toLowerCase();

    if (this.matchesContractType(source, ['msa', 'master service agreement'])) {
      hints.add('MSA');
    }
    if (this.matchesContractType(source, ['baa', 'business associate agreement'])) {
      hints.add('BAA');
    }
    if (this.matchesContractType(source, ['dpa', 'data processing agreement'])) {
      hints.add('DPA');
    }

    return hints;
  }

  private readMetadataType(metadata: Record<string, unknown>): string {
    const candidateKeys = ['contractType', 'type', 'agreementType'];
    for (const key of candidateKeys) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return '';
  }

  private matchesContractType(source: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (source.includes(pattern)) {
        return true;
      }
    }
    return false;
  }

  private loadGateRequirements(): Record<ContractGateAction, ContractRequirementType[]> {
    const raw = this.configService.get<string>('CONTRACT_GATE_REQUIREMENTS_JSON');
    if (!raw) {
      return DEFAULT_GATE_REQUIREMENTS;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<Record<ContractGateAction, string[]>>;
      const merged: Record<ContractGateAction, ContractRequirementType[]> = {
        ...DEFAULT_GATE_REQUIREMENTS,
      };

      for (const action of Object.values(ContractGateAction)) {
        const configured = parsed[action];
        if (!Array.isArray(configured)) {
          continue;
        }
        const normalized = configured
          .map((value) => value.toUpperCase())
          .filter((value): value is ContractRequirementType =>
            ['MSA', 'BAA', 'DPA'].includes(value),
          );
        if (normalized.length > 0) {
          merged[action] = normalized;
        }
      }

      return merged;
    } catch {
      return DEFAULT_GATE_REQUIREMENTS;
    }
  }
}
