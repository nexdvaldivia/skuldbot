import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { LookupValue } from './entities/lookup-value.entity';
import { LookupDomain } from './entities/lookup-domain.entity';
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from '../common/utils/string.util';

type DomainCache = {
  expiresAt: number;
  values: LookupValue[];
};

@Injectable()
export class LookupsService {
  private readonly cache = new Map<string, DomainCache>();
  private readonly domainCache = new Map<string, LookupDomain>();
  private readonly cacheTtlMs = 60_000;

  constructor(
    @InjectRepository(LookupDomain)
    private readonly lookupDomainRepository: Repository<LookupDomain>,
    @InjectRepository(LookupValue)
    private readonly lookupRepository: Repository<LookupValue>,
  ) {}

  async assertActiveCode(domain: string, code: string, errorMessage?: string): Promise<void> {
    const normalizedCode = normalizeOptionalLowercaseString(code);
    if (!normalizedCode) {
      throw new BadRequestException(
        errorMessage ?? `Invalid value "${code}" for lookup domain "${domain}"`,
      );
    }
    const values = await this.getActiveValues(domain);
    if (values.some((value) => value.code.toLowerCase() === normalizedCode)) {
      return;
    }

    throw new BadRequestException(
      errorMessage ?? `Invalid value "${code}" for lookup domain "${domain}"`,
    );
  }

  async getDefaultCode(domain: string, fallback?: string): Promise<string> {
    const values = await this.getActiveValues(domain);
    if (values.length === 0) {
      if (fallback) {
        return fallback;
      }
      throw new NotFoundException(`No active lookup values for domain "${domain}"`);
    }

    const markedDefault = values.find((value) => value.metadata?.['isDefault'] === true);
    if (markedDefault) {
      return markedDefault.code;
    }

    return values[0].code;
  }

  async getMetadata(domain: string, code: string): Promise<Record<string, unknown> | null> {
    const normalizedCode = normalizeOptionalLowercaseString(code);
    if (!normalizedCode) {
      return null;
    }
    const values = await this.getActiveValues(domain);
    const found = values.find((value) => value.code.toLowerCase() === normalizedCode);
    return found?.metadata ?? null;
  }

  async getAllCodes(domain: string): Promise<string[]> {
    const values = await this.getActiveValues(domain);
    return values.map((value) => value.code);
  }

  async listDomains(managedByPortal?: string): Promise<LookupDomain[]> {
    const where: FindOptionsWhere<LookupDomain> = { isActive: true };
    if (managedByPortal) {
      where.managedByPortal = managedByPortal as LookupDomain['managedByPortal'];
    }

    return this.lookupDomainRepository.find({
      where,
      order: { code: 'ASC' },
    });
  }

  async listValuesByDomainCode(domainCode: string): Promise<LookupValue[]> {
    const domain = await this.getDomainOrThrow(domainCode);
    return this.lookupRepository.find({
      where: { domainId: domain.id },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  async upsertDomainValue(params: {
    domainCode: string;
    code: string;
    label: string;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
    metadata?: Record<string, unknown>;
    managedByPortal: 'control_plane' | 'orchestrator';
  }): Promise<LookupValue> {
    const domain = await this.getDomainOrThrow(params.domainCode);
    if (domain.managedByPortal !== params.managedByPortal) {
      throw new BadRequestException(
        `Domain "${domain.code}" is managed by ${domain.managedByPortal}`,
      );
    }
    if (!domain.isEditable) {
      throw new BadRequestException(`Domain "${domain.code}" is read-only`);
    }

    const normalizedCode = normalizeOptionalLowercaseString(params.code);
    const normalizedLabel = normalizeOptionalString(params.label);
    if (!normalizedCode || !normalizedLabel) {
      throw new BadRequestException('Lookup code and label are required');
    }
    const existing = await this.lookupRepository.findOne({
      where: { domainId: domain.id, code: normalizedCode },
    });
    const value = existing ?? this.lookupRepository.create();

    value.domainId = domain.id;
    value.code = normalizedCode;
    value.label = normalizedLabel;
    value.description = normalizeOptionalString(params.description);
    value.sortOrder = params.sortOrder ?? value.sortOrder ?? 100;
    value.isActive = params.isActive ?? value.isActive ?? true;
    value.metadata = {
      ...(value.metadata ?? {}),
      ...(params.metadata ?? {}),
    };

    const saved = await this.lookupRepository.save(value);
    this.cache.delete(domain.code);
    return saved;
  }

  private async getActiveValues(domain: string): Promise<LookupValue[]> {
    const normalizedDomain = normalizeOptionalLowercaseString(domain);
    if (!normalizedDomain) {
      throw new NotFoundException('Lookup domain is required');
    }
    const now = Date.now();
    const cached = this.cache.get(normalizedDomain);
    if (cached && cached.expiresAt > now) {
      return cached.values;
    }

    const domainRecord = await this.getDomainOrThrow(normalizedDomain);
    const values = await this.lookupRepository.find({
      where: { domainId: domainRecord.id, isActive: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });

    this.cache.set(normalizedDomain, {
      values,
      expiresAt: now + this.cacheTtlMs,
    });

    return values;
  }

  private async getDomainOrThrow(domainCode: string): Promise<LookupDomain> {
    const normalized = normalizeOptionalLowercaseString(domainCode);
    if (!normalized) {
      throw new NotFoundException('Lookup domain is required');
    }
    const cached = this.domainCache.get(normalized);
    if (cached) {
      return cached;
    }

    const domain = await this.lookupDomainRepository.findOne({
      where: { code: normalized, isActive: true },
    });
    if (!domain) {
      throw new NotFoundException(`Lookup domain "${normalized}" not found`);
    }

    this.domainCache.set(normalized, domain);
    return domain;
  }
}
