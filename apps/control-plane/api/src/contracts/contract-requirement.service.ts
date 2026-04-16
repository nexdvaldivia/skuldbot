import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { normalizeCode, normalizeCodes } from './contracts-access.util';
import {
  ConfigureContractRequirementsDto,
  ContractRequirementResponseDto,
  ListContractRequirementsQueryDto,
} from './dto/requirements.dto';
import { ContractRequirementAction } from './entities/contract-domain.enums';
import { ContractRequirement } from './entities/contract-requirement.entity';

@Injectable()
export class ContractRequirementService {
  constructor(
    @InjectRepository(ContractRequirement)
    private readonly requirementRepository: Repository<ContractRequirement>,
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

    return Array.from(scored.entries())
      .filter(([, value]) => value.required)
      .map(([contractTypeCode]) => contractTypeCode)
      .sort();
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
