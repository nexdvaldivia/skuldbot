import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClientContact } from '../clients/entities/client-contact.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { normalizeCode, normalizeCodes } from './contracts-access.util';
import {
  ContractRequirementTemplateSummaryDto,
  ContractValidationResponseDto,
  ConfigureContractRequirementsDto,
  ContractRequirementResponseDto,
  GetRequiredContractsForVerticalQueryDto,
  GetRequiredContractsQueryDto,
  ListContractRequirementsQueryDto,
  RenderContractForClientResponseDto,
  ValidateAddonContractsDto,
  ValidateSubscriptionContractsDto,
  ValidateVerticalContractsDto,
} from './dto/requirements.dto';
import {
  ContractRequirementAction,
  ContractTemplateStatus,
} from './entities/contract-domain.enums';
import { ContractTypeLookup } from './entities/contract-type-lookup.entity';
import { ContractRequirement } from './entities/contract-requirement.entity';
import { ContractTemplate } from './entities/contract-template.entity';
import { Contract, ContractStatus } from './entities/contract.entity';
import { ContractTemplateService } from './contract-template.service';
import {
  ContractTemplateResponseDto,
  ContractTemplateVersionResponseDto,
} from './dto/template.dto';

const DEFAULT_PROVIDER_LEGAL_NAME = 'Skuld, LLC';

@Injectable()
export class ContractRequirementService {
  constructor(
    @InjectRepository(ContractRequirement)
    private readonly requirementRepository: Repository<ContractRequirement>,
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(ContractTemplate)
    private readonly templateRepository: Repository<ContractTemplate>,
    @InjectRepository(ContractTypeLookup)
    private readonly contractTypeLookupRepository: Repository<ContractTypeLookup>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(ClientContact)
    private readonly clientContactRepository: Repository<ClientContact>,
    private readonly contractTemplateService: ContractTemplateService,
  ) {}

  async listRequirements(
    query: ListContractRequirementsQueryDto,
  ): Promise<ContractRequirementResponseDto[]> {
    const qb = this.requirementRepository.createQueryBuilder('requirement');

    if (query.planCode) {
      qb.andWhere('requirement.planCode = :planCode', {
        planCode: normalizeCode(query.planCode),
      });
    }

    if (query.addonCode) {
      qb.andWhere('requirement.addonCode = :addonCode', {
        addonCode: normalizeCode(query.addonCode),
      });
    }

    if (query.action) {
      qb.andWhere('requirement.action = :action', { action: query.action });
    }

    const requirements = await qb
      .orderBy('requirement.action', 'ASC')
      .addOrderBy('requirement.planCode', 'ASC')
      .addOrderBy('requirement.addonCode', 'ASC')
      .addOrderBy('requirement.contractTypeCode', 'ASC')
      .getMany();

    return requirements.map((requirement) => this.toResponse(requirement));
  }

  async configureRequirements(
    dto: ConfigureContractRequirementsDto,
    currentUser: User,
  ): Promise<ContractRequirementResponseDto[]> {
    const normalizedInput = dto.requirements.map((item) => ({
      planCode: normalizeCode(item.planCode),
      addonCode: normalizeCode(item.addonCode),
      action: item.action,
      contractTypeCode: item.contractTypeCode.trim().toLowerCase(),
      isRequired: item.isRequired ?? true,
      metadata: item.metadata ?? {},
    }));

    const existing = await this.requirementRepository.find();
    const existingByKey = new Map(existing.map((item) => [this.buildRequirementKey(item), item]));

    const incomingKeys = new Set<string>();
    const toSave: ContractRequirement[] = [];

    for (const input of normalizedInput) {
      const key = this.buildRequirementKey(input);
      incomingKeys.add(key);

      const found = existingByKey.get(key);
      if (found) {
        found.isRequired = input.isRequired;
        found.updatedByUserId = currentUser.id;
        found.metadata = {
          ...(found.metadata ?? {}),
          ...input.metadata,
        };
        toSave.push(found);
        continue;
      }

      toSave.push(
        this.requirementRepository.create({
          ...input,
          createdByUserId: currentUser.id,
          updatedByUserId: currentUser.id,
        }),
      );
    }

    const toDelete = existing.filter((item) => !incomingKeys.has(this.buildRequirementKey(item)));
    if (toDelete.length > 0) {
      await this.requirementRepository.delete({ id: In(toDelete.map((item) => item.id)) });
    }

    if (toSave.length > 0) {
      await this.requirementRepository.save(toSave);
    }

    const refreshed = await this.requirementRepository.find({
      order: {
        action: 'ASC',
        planCode: 'ASC',
        addonCode: 'ASC',
        contractTypeCode: 'ASC',
      },
    });

    return refreshed.map((item) => this.toResponse(item));
  }

  async resolveRequiredContractTypes(params: {
    action: ContractRequirementAction;
    planCode?: string | null;
    addonCodes?: string[];
  }): Promise<string[]> {
    const normalizedPlan = normalizeCode(params.planCode);
    const normalizedAddons = normalizeCodes(params.addonCodes);

    const qb = this.requirementRepository
      .createQueryBuilder('requirement')
      .where('requirement.action = :action', { action: params.action });

    if (normalizedPlan) {
      qb.andWhere('(requirement.planCode IS NULL OR requirement.planCode = :planCode)', {
        planCode: normalizedPlan,
      });
    } else {
      qb.andWhere('requirement.planCode IS NULL');
    }

    if (normalizedAddons.length > 0) {
      qb.andWhere('(requirement.addonCode IS NULL OR requirement.addonCode IN (:...addonCodes))', {
        addonCodes: normalizedAddons,
      });
    } else {
      qb.andWhere('requirement.addonCode IS NULL');
    }

    const matches = await qb.getMany();
    if (matches.length === 0) {
      return [];
    }

    const scored = new Map<string, { required: boolean; score: number }>();

    for (const item of matches) {
      const score = this.calculateScopeScore(item.planCode, item.addonCode, normalizedPlan);
      const current = scored.get(item.contractTypeCode);
      if (!current || score >= current.score) {
        scored.set(item.contractTypeCode, {
          required: item.isRequired,
          score,
        });
      }
    }

    const required = Array.from(scored.entries())
      .filter(([, value]) => value.required)
      .map(([contractTypeCode]) => contractTypeCode)
      .sort();

    return required.map((code) => code.toUpperCase());
  }

  async validateSubscriptionContracts(
    dto: ValidateSubscriptionContractsDto,
    clientId: string,
  ): Promise<ContractValidationResponseDto> {
    const action = dto.action ?? ContractRequirementAction.LICENSE_CREATE;
    const client = await this.requireClient(clientId);
    const planTier = this.resolvePlanTier(dto.planTier, client.plan);
    const requiredContractTypes = await this.resolveRequiredContractTypes({
      action,
      planCode: planTier,
      addonCodes: dto.addonCodes,
    });

    return this.evaluateValidation(client.id, action, requiredContractTypes);
  }

  async getRequiredContractsForSubscription(
    query: GetRequiredContractsQueryDto,
  ): Promise<ContractRequirementTemplateSummaryDto[]> {
    const action = query.action ?? ContractRequirementAction.LICENSE_CREATE;
    const requiredContractTypes = await this.resolveRequiredContractTypes({
      action,
      planCode: query.planTier,
      addonCodes: query.addonCodes,
    });

    return this.mapRequiredTemplates(requiredContractTypes);
  }

  async validateVerticalContracts(
    dto: ValidateVerticalContractsDto,
    clientId: string,
  ): Promise<ContractValidationResponseDto> {
    const action = dto.action ?? ContractRequirementAction.DEPLOY_ORCHESTRATOR;
    const client = await this.requireClient(clientId);
    const requiredContractTypes = await this.resolveRequiredContractTypes({
      action,
      planCode: this.resolvePlanTier(dto.planTier, client.plan),
      addonCodes: [dto.verticalSlug],
    });

    return this.evaluateValidation(client.id, action, requiredContractTypes);
  }

  async getRequiredContractsForVertical(
    verticalSlug: string,
    query: GetRequiredContractsForVerticalQueryDto,
  ): Promise<ContractRequirementTemplateSummaryDto[]> {
    const action = query.action ?? ContractRequirementAction.DEPLOY_ORCHESTRATOR;
    const requiredContractTypes = await this.resolveRequiredContractTypes({
      action,
      planCode: query.planTier,
      addonCodes: [verticalSlug],
    });

    return this.mapRequiredTemplates(requiredContractTypes);
  }

  async validateAddonContracts(
    dto: ValidateAddonContractsDto,
    clientId: string,
  ): Promise<ContractValidationResponseDto> {
    const action = dto.action ?? ContractRequirementAction.LICENSE_CREATE;
    const client = await this.requireClient(clientId);
    const requiredContractTypes = await this.resolveRequiredContractTypes({
      action,
      planCode: this.resolvePlanTier(dto.planTier, client.plan),
      addonCodes: [dto.addonCode],
    });

    return this.evaluateValidation(client.id, action, requiredContractTypes);
  }

  async renderTemplateForClient(
    templateId: string,
    clientId: string,
  ): Promise<RenderContractForClientResponseDto> {
    const [template, client] = await Promise.all([
      this.contractTemplateService.getTemplateById(templateId),
      this.requireClient(clientId),
    ]);
    const version = this.resolveTemplateVersion(template);
    const primaryContact = await this.clientContactRepository.findOne({
      where: { clientId: client.id, isActive: true },
      order: { isPrimary: 'DESC', firstName: 'ASC', lastName: 'ASC' },
    });
    const legacyFullName =
      typeof (primaryContact as { fullName?: unknown } | null)?.fullName === 'string'
        ? (((primaryContact as unknown as { fullName?: string }).fullName ?? '') || '').trim()
        : '';
    const signerFullName = [primaryContact?.firstName, primaryContact?.lastName]
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .join(' ')
      .trim();

    const context = {
      client_name: client.name,
      client_email: primaryContact?.email ?? client.billingEmail,
      tenant_name: client.slug,
      signer_full_name: signerFullName || legacyFullName || client.name,
      signer_email: primaryContact?.email ?? client.billingEmail,
      provider_legal_name: DEFAULT_PROVIDER_LEGAL_NAME,
      current_date: new Date().toISOString().slice(0, 10),
      contract_title: template.title,
      contract_version: version.versionNumber,
      client_plan: client.plan,
    };

    const resolvedVariables = await this.contractTemplateService.resolveTemplateVariables(
      templateId,
      {
        context,
      },
    );

    return {
      templateId: template.id,
      templateKey: template.templateKey,
      versionId: version.id,
      versionNumber: version.versionNumber,
      clientId: client.id,
      clientName: client.name,
      renderedHtml: this.applyTemplateTokens(
        version.renderedHtml ?? '',
        resolvedVariables.resolved,
      ),
      variables: resolvedVariables.resolved,
      missingRequired: resolvedVariables.missingRequired,
      unresolved: resolvedVariables.unresolved,
      renderedAt: new Date().toISOString(),
    };
  }

  private calculateScopeScore(
    planCode: string | null,
    addonCode: string | null,
    normalizedPlan: string | null,
  ): number {
    let score = 0;
    if (planCode && normalizedPlan && planCode === normalizedPlan) {
      score += 2;
    }
    if (addonCode) {
      score += 1;
    }
    return score;
  }

  private async evaluateValidation(
    clientId: string,
    action: ContractRequirementAction,
    requiredContractTypes: string[],
  ): Promise<ContractValidationResponseDto> {
    const presentContractTypes = await this.listSignedContractTypes(clientId);
    const presentSet = new Set(presentContractTypes);
    const missingContractTypes = requiredContractTypes.filter((code) => !presentSet.has(code));
    const requiredContracts = await this.mapRequiredTemplates(requiredContractTypes);
    const missingSet = new Set(missingContractTypes);
    const missingContracts = requiredContracts.filter(
      (contract) => contract.contractTypeCode && missingSet.has(contract.contractTypeCode),
    );

    return {
      valid: missingContractTypes.length === 0,
      clientId,
      action,
      requiredContractTypes,
      presentContractTypes,
      missingContractTypes,
      requiredContracts,
      missingContracts,
    };
  }

  private async mapRequiredTemplates(
    requiredContractTypes: string[],
  ): Promise<ContractRequirementTemplateSummaryDto[]> {
    if (requiredContractTypes.length === 0) {
      return [];
    }

    const requiredSet = new Set(requiredContractTypes);
    const knownTypeCodes = await this.loadKnownContractTypeCodes();
    const templates = await this.templateRepository.find({
      relations: ['versions'],
      order: {
        updatedAt: 'DESC',
      },
    });

    const selectedByType = new Map<string, ContractTemplate>();
    for (const template of templates) {
      if (template.status === ContractTemplateStatus.ARCHIVED) {
        continue;
      }
      const templateTypeCodes = this.resolveTemplateTypeCodes(template, knownTypeCodes);
      for (const typeCode of templateTypeCodes) {
        if (!requiredSet.has(typeCode)) {
          continue;
        }
        const existing = selectedByType.get(typeCode);
        if (!existing || this.isTemplatePreferred(template, existing)) {
          selectedByType.set(typeCode, template);
        }
      }
    }

    return requiredContractTypes
      .map((typeCode) => {
        const template = selectedByType.get(typeCode);
        if (!template) {
          return null;
        }
        return this.toTemplateSummary(template, typeCode);
      })
      .filter((item): item is ContractRequirementTemplateSummaryDto => item !== null);
  }

  private isTemplatePreferred(candidate: ContractTemplate, current: ContractTemplate): boolean {
    const statusRank = (status: ContractTemplateStatus): number => {
      if (status === ContractTemplateStatus.PUBLISHED) {
        return 3;
      }
      if (status === ContractTemplateStatus.DRAFT) {
        return 2;
      }
      if (status === ContractTemplateStatus.DEPRECATED) {
        return 1;
      }
      return 0;
    };

    const candidateRank = statusRank(candidate.status);
    const currentRank = statusRank(current.status);
    if (candidateRank !== currentRank) {
      return candidateRank > currentRank;
    }

    return candidate.updatedAt.getTime() > current.updatedAt.getTime();
  }

  private toTemplateSummary(
    template: ContractTemplate,
    contractTypeCode: string,
  ): ContractRequirementTemplateSummaryDto {
    const activeVersion =
      template.versions.find((version) => version.id === template.activeVersionId) ?? null;
    return {
      templateId: template.id,
      templateKey: template.templateKey,
      title: template.title,
      status: template.status,
      contractTypeCode,
      activeVersionId: template.activeVersionId,
      activeVersionNumber: activeVersion?.versionNumber ?? null,
    };
  }

  private async listSignedContractTypes(clientId: string): Promise<string[]> {
    const knownTypeCodes = await this.loadKnownContractTypeCodes();
    const signedContracts = await this.contractRepository.find({
      where: {
        clientId,
        status: ContractStatus.SIGNED,
      },
      order: {
        signedAt: 'DESC',
      },
    });

    const present = new Set<string>();
    for (const contract of signedContracts) {
      for (const typeCode of this.resolveSignedContractTypeCodes(contract, knownTypeCodes)) {
        present.add(typeCode);
      }
    }

    return Array.from(present.values()).sort((a, b) => a.localeCompare(b));
  }

  private resolveSignedContractTypeCodes(contract: Contract, knownTypeCodes: string[]): string[] {
    return this.resolveContractTypeCodes(
      (contract.metadata ?? {}) as Record<string, unknown>,
      `${contract.templateKey} ${contract.title}`,
      knownTypeCodes,
    );
  }

  private resolveTemplateTypeCodes(template: ContractTemplate, knownTypeCodes: string[]): string[] {
    return this.resolveContractTypeCodes(
      (template.metadata ?? {}) as Record<string, unknown>,
      `${template.templateKey} ${template.title}`,
      knownTypeCodes,
    );
  }

  private resolveContractTypeCodes(
    metadata: Record<string, unknown>,
    sourceText: string,
    knownTypeCodes: string[],
  ): string[] {
    const candidates = new Set<string>();
    for (const key of ['contractTypeCode', 'contractType', 'type', 'agreementType']) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        candidates.add(value.trim().toUpperCase());
      }
    }

    const source = sourceText.toLowerCase();
    for (const knownTypeCode of knownTypeCodes) {
      if (source.includes(knownTypeCode.toLowerCase())) {
        candidates.add(knownTypeCode);
      }
    }

    if (source.includes('master service agreement') || source.includes(' msa ')) {
      candidates.add('MSA');
    }
    if (source.includes('business associate agreement') || source.includes(' baa ')) {
      candidates.add('BAA');
    }
    if (source.includes('data processing agreement') || source.includes(' dpa ')) {
      candidates.add('DPA');
    }

    return Array.from(candidates.values()).sort((a, b) => a.localeCompare(b));
  }

  private async loadKnownContractTypeCodes(): Promise<string[]> {
    const lookups = await this.contractTypeLookupRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
    return lookups.map((item) => item.code.trim().toUpperCase()).filter((item) => item.length > 0);
  }

  private resolvePlanTier(inputPlan: string | undefined, clientPlan: string | null): string {
    const selected = inputPlan?.trim() || clientPlan?.trim();
    if (!selected) {
      throw new BadRequestException({
        code: 'CONTRACT_PLAN_TIER_REQUIRED',
        message: 'Plan tier is required to resolve contract requirements.',
      });
    }
    return selected;
  }

  private async requireClient(clientId: string): Promise<Client> {
    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: `Client ${clientId} was not found.`,
      });
    }
    return client;
  }

  private resolveTemplateVersion(
    template: ContractTemplateResponseDto,
  ): ContractTemplateVersionResponseDto {
    if (template.versions.length === 0) {
      throw new BadRequestException({
        code: 'CONTRACT_TEMPLATE_VERSION_MISSING',
        message: `Template ${template.id} has no versions available for rendering.`,
      });
    }

    const activeVersion =
      template.activeVersionId !== null
        ? template.versions.find((version) => version.id === template.activeVersionId)
        : undefined;
    if (activeVersion) {
      return activeVersion;
    }

    return [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  private applyTemplateTokens(html: string, resolved: Record<string, unknown>): string {
    return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_fullMatch, key: string) => {
      const value = resolved[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  private buildRequirementKey(value: {
    planCode: string | null;
    addonCode: string | null;
    action: ContractRequirementAction;
    contractTypeCode: string;
  }): string {
    return `${value.planCode ?? '*'}::${value.addonCode ?? '*'}::${value.action}::${value.contractTypeCode}`;
  }

  private toResponse(requirement: ContractRequirement): ContractRequirementResponseDto {
    return {
      id: requirement.id,
      planCode: requirement.planCode,
      addonCode: requirement.addonCode,
      action: requirement.action,
      contractTypeCode: requirement.contractTypeCode,
      isRequired: requirement.isRequired,
      metadata: requirement.metadata ?? {},
      createdAt: requirement.createdAt,
      updatedAt: requirement.updatedAt,
    };
  }
}
