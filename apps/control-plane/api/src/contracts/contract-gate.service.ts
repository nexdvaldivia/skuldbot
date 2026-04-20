import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { CreateLicenseDto } from '../licenses/dto/license.dto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { normalizeCodes } from './contracts-access.util';
import { ContractRequirementService } from './contract-requirement.service';
import { ContractRequirementAction } from './entities/contract-domain.enums';
import { Contract, ContractStatus } from './entities/contract.entity';

export enum ContractGateAction {
  DEPLOY_ORCHESTRATOR = ContractRequirementAction.DEPLOY_ORCHESTRATOR,
  LICENSE_CREATE = ContractRequirementAction.LICENSE_CREATE,
  PROCESS_PHI = ContractRequirementAction.PROCESS_PHI,
  PROCESS_EU_PII = ContractRequirementAction.PROCESS_EU_PII,
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
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly requirementService: ContractRequirementService,
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

    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${clientId} was not found for contract gate validation.`,
      });
    }

    const tenant = tenantId
      ? await this.tenantRepository.findOne({
          where: { id: tenantId },
        })
      : null;

    const addonCodes = this.resolveAddonCodes(client, tenant);
    const required = await this.resolveRequiredContractTypes(action, client.plan, addonCodes);

    if (required.length === 0) {
      return { allowed: true, missing: [] };
    }

    const signedContracts = await this.contractRepository.find({
      where: {
        clientId,
        status: ContractStatus.SIGNED,
      },
    });

    const presentTypes = new Set<string>();
    for (const contract of signedContracts) {
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

    const client = await this.clientRepository.findOne({ where: { id: tenant.clientId } });
    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${tenant.clientId} was not found for contract gate validation.`,
      });
    }

    const actions = this.resolveLicenseActions(dto, tenant);
    const addonCodes = this.resolveAddonCodes(client, tenant);

    const requiredTypes = new Set<string>();
    for (const action of actions) {
      const requiredForAction = await this.resolveRequiredContractTypes(
        action,
        client.plan,
        addonCodes,
      );
      for (const requirement of requiredForAction) {
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

    const presentTypes = new Set<string>();
    for (const contract of signedContracts) {
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

  private async resolveRequiredContractTypes(
    action: ContractGateAction,
    planCode: string,
    addonCodes: string[],
  ): Promise<string[]> {
    const dynamic = await this.requirementService.resolveRequiredContractTypes({
      action: action as unknown as ContractRequirementAction,
      planCode,
      addonCodes,
    });

    if (dynamic.length > 0) {
      return dynamic.map((type) => type.toUpperCase());
    }

    return this.gateRequirements[action] ?? [];
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

  private resolveAddonCodes(client: Client, tenant: Tenant | null): string[] {
    const codes: string[] = [];

    const extract = (source: Record<string, unknown> | null | undefined): void => {
      if (!source) {
        return;
      }

      const addonKeys = ['addons', 'addOns', 'enabledAddons', 'features', 'products'];
      for (const key of addonKeys) {
        const value = source[key];
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (typeof entry === 'string') {
              codes.push(entry);
            }
          }
        }
      }
    };

    extract(client.settings as Record<string, unknown>);
    extract(client.metadata as Record<string, unknown>);
    if (tenant) {
      extract(tenant.settings as Record<string, unknown>);
      extract(tenant.metadata as Record<string, unknown>);
    }

    return normalizeCodes(codes);
  }

  private hasTruthyFlag(source: Record<string, unknown>, keys: string[]): boolean {
    return keys.some((key) => source[key] === true);
  }

  private inferContractTypes(contract: Contract): Set<string> {
    const hints = new Set<string>();
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
