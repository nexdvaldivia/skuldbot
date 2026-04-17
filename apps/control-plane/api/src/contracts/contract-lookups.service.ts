import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  ContractLookupItemDto,
  ContractLookupsResponseDto,
  CreateContractLookupDto,
  UpdateContractLookupDto,
} from './dto/legal.dto';
import { ContractComplianceFrameworkLookup } from './entities/contract-compliance-framework-lookup.entity';
import { ContractJurisdictionLookup } from './entities/contract-jurisdiction-lookup.entity';
import { ContractTypeLookup } from './entities/contract-type-lookup.entity';

type ContractLookupEntity =
  | ContractTypeLookup
  | ContractJurisdictionLookup
  | ContractComplianceFrameworkLookup;

interface LookupRepositoryConfig {
  repository: Repository<any>;
  kindLabel: string;
}

@Injectable()
export class ContractLookupsService {
  constructor(
    @InjectRepository(ContractTypeLookup)
    private readonly contractTypeLookupRepository: Repository<ContractTypeLookup>,
    @InjectRepository(ContractJurisdictionLookup)
    private readonly jurisdictionLookupRepository: Repository<ContractJurisdictionLookup>,
    @InjectRepository(ContractComplianceFrameworkLookup)
    private readonly complianceFrameworkLookupRepository: Repository<ContractComplianceFrameworkLookup>,
  ) {}

  async getContractLookups(): Promise<ContractLookupsResponseDto> {
    const [contractTypes, jurisdictions, complianceFrameworks] = await Promise.all([
      this.listContractTypes(false),
      this.listJurisdictions(false),
      this.listComplianceFrameworks(false),
    ]);

    return { contractTypes, jurisdictions, complianceFrameworks };
  }

  async listContractTypes(includeInactive = false): Promise<ContractLookupItemDto[]> {
    return this.listLookups(
      {
        repository: this.contractTypeLookupRepository,
        kindLabel: 'Contract type',
      },
      includeInactive,
    );
  }

  async createContractType(
    dto: CreateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.createLookup(
      {
        repository: this.contractTypeLookupRepository,
        kindLabel: 'Contract type',
      },
      dto,
      currentUser,
    );
  }

  async updateContractType(
    lookupId: string,
    dto: UpdateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.updateLookup(
      {
        repository: this.contractTypeLookupRepository,
        kindLabel: 'Contract type',
      },
      lookupId,
      dto,
      currentUser,
    );
  }

  async listJurisdictions(includeInactive = false): Promise<ContractLookupItemDto[]> {
    return this.listLookups(
      {
        repository: this.jurisdictionLookupRepository,
        kindLabel: 'Contract jurisdiction',
      },
      includeInactive,
    );
  }

  async createJurisdiction(
    dto: CreateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.createLookup(
      {
        repository: this.jurisdictionLookupRepository,
        kindLabel: 'Contract jurisdiction',
      },
      dto,
      currentUser,
    );
  }

  async updateJurisdiction(
    lookupId: string,
    dto: UpdateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.updateLookup(
      {
        repository: this.jurisdictionLookupRepository,
        kindLabel: 'Contract jurisdiction',
      },
      lookupId,
      dto,
      currentUser,
    );
  }

  async listComplianceFrameworks(includeInactive = false): Promise<ContractLookupItemDto[]> {
    return this.listLookups(
      {
        repository: this.complianceFrameworkLookupRepository,
        kindLabel: 'Compliance framework',
      },
      includeInactive,
    );
  }

  async createComplianceFramework(
    dto: CreateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.createLookup(
      {
        repository: this.complianceFrameworkLookupRepository,
        kindLabel: 'Compliance framework',
      },
      dto,
      currentUser,
    );
  }

  async updateComplianceFramework(
    lookupId: string,
    dto: UpdateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    return this.updateLookup(
      {
        repository: this.complianceFrameworkLookupRepository,
        kindLabel: 'Compliance framework',
      },
      lookupId,
      dto,
      currentUser,
    );
  }

  private async listLookups(
    config: LookupRepositoryConfig,
    includeInactive: boolean,
  ): Promise<ContractLookupItemDto[]> {
    const where = includeInactive ? {} : { isActive: true };
    const records = await config.repository.find({
      where: where as any,
      order: {
        sortOrder: 'ASC',
        name: 'ASC',
      } as any,
    });
    return records.map((record: ContractLookupEntity) => this.toLookupItem(record));
  }

  private async createLookup(
    config: LookupRepositoryConfig,
    dto: CreateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    const record = config.repository.create({
      code: dto.code.trim().toLowerCase(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      metadata: dto.metadata ?? {},
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id,
      contractLevel: dto.contractLevel?.trim() || undefined,
      contractScope: dto.contractScope?.trim() || undefined,
      productScopes: dto.productScopes ?? undefined,
    });

    try {
      const saved = (await config.repository.save(record)) as ContractLookupEntity;
      return this.toLookupItem(saved);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `${config.kindLabel} with code "${record.code}" already exists.`,
        );
      }
      throw error;
    }
  }

  private async updateLookup(
    config: LookupRepositoryConfig,
    lookupId: string,
    dto: UpdateContractLookupDto,
    currentUser: User,
  ): Promise<ContractLookupItemDto> {
    const existing = (await config.repository.findOne({
      where: { id: lookupId },
    })) as ContractLookupEntity | null;
    if (!existing) {
      throw new NotFoundException(`${config.kindLabel} ${lookupId} was not found.`);
    }

    if (dto.code !== undefined) {
      existing.code = dto.code.trim().toLowerCase();
    }
    if (dto.name !== undefined) {
      existing.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      existing.description = dto.description.trim() || null;
    }
    if (dto.sortOrder !== undefined) {
      existing.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      existing.isActive = dto.isActive;
    }
    if (dto.metadata !== undefined) {
      existing.metadata = {
        ...(existing.metadata ?? {}),
        ...dto.metadata,
      };
    }
    if ('contractLevel' in existing && dto.contractLevel !== undefined) {
      existing.contractLevel = dto.contractLevel.trim();
    }
    if ('contractScope' in existing && dto.contractScope !== undefined) {
      existing.contractScope = dto.contractScope.trim();
    }
    if ('productScopes' in existing && dto.productScopes !== undefined) {
      existing.productScopes = dto.productScopes;
    }

    existing.updatedByUserId = currentUser.id;

    try {
      const saved = (await config.repository.save(existing)) as ContractLookupEntity;
      return this.toLookupItem(saved);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `${config.kindLabel} with code "${existing.code}" already exists.`,
        );
      }
      throw error;
    }
  }

  private toLookupItem(value: ContractLookupEntity): ContractLookupItemDto {
    return {
      id: value.id,
      code: value.code,
      name: value.name,
      description: value.description,
      sortOrder: value.sortOrder,
      isActive: value.isActive,
      contractLevel: 'contractLevel' in value ? value.contractLevel : undefined,
      contractScope: 'contractScope' in value ? value.contractScope : undefined,
      productScopes: 'productScopes' in value ? value.productScopes : undefined,
      metadata: value.metadata ?? {},
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { code?: string }).code === '23505'
    );
  }
}
