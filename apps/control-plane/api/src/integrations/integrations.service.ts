import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ProviderConfig, SanitizedProviderConfig } from './entities/provider-config.entity';
import { ProviderRegistry } from './provider-registry.service';
import {
  CreateOrUpdateProviderConfigDto,
  ListProviderConfigsQueryDto,
  UpdateProviderConfigDto,
} from './dto/provider-config.dto';
import { IntegrationType } from '../common/interfaces/integration.interface';

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(ProviderConfig)
    private readonly providerConfigRepository: Repository<ProviderConfig>,
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  async listConfigs(query: ListProviderConfigsQueryDto): Promise<SanitizedProviderConfig[]> {
    const where: FindOptionsWhere<ProviderConfig> = {};
    if (query.type) {
      where.type = query.type;
    }

    if (query.tenantId) {
      where.tenantId = query.tenantId;
    } else {
      where.tenantId = IsNull();
    }

    const configs = await this.providerConfigRepository.find({
      where,
      order: { type: 'ASC', name: 'ASC', updatedAt: 'DESC' },
    });

    return configs.map((config) => this.toSanitized(config));
  }

  async getConfig(id: string): Promise<SanitizedProviderConfig> {
    const config = await this.providerConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`Provider config ${id} not found`);
    }

    return this.toSanitized(config);
  }

  async createOrUpdate(
    dto: CreateOrUpdateProviderConfigDto,
    currentUser: User,
  ): Promise<SanitizedProviderConfig> {
    const existing = await this.findByScope(dto.type, dto.name, dto.tenantId ?? null);

    const isCreate = !existing;
    const entity = existing ?? this.providerConfigRepository.create();

    entity.type = dto.type;
    entity.name = dto.name;
    entity.tenantId = dto.tenantId ?? null;
    entity.settings = dto.settings ?? entity.settings ?? {};
    entity.description = dto.description ?? entity.description ?? null;
    entity.isActive = dto.isActive ?? entity.isActive ?? true;
    entity.isPrimary = dto.isPrimary ?? entity.isPrimary ?? false;
    entity.updatedBy = currentUser.id;
    if (isCreate) {
      entity.createdBy = currentUser.id;
    }

    if (dto.credentials && Object.keys(dto.credentials).length > 0) {
      entity.setCredentials(this.normalizeCredentials(dto.credentials));
    }

    if (entity.isPrimary) {
      await this.clearPrimaryInScope(entity.type, entity.tenantId, entity.id);
    } else if (isCreate) {
      const hasPrimary = await this.hasPrimaryInScope(entity.type, entity.tenantId);
      if (!hasPrimary) {
        entity.isPrimary = true;
      }
    }

    const saved = await this.providerConfigRepository.save(entity);
    return this.toSanitized(saved);
  }

  async update(
    id: string,
    dto: UpdateProviderConfigDto,
    currentUser: User,
  ): Promise<SanitizedProviderConfig> {
    const entity = await this.providerConfigRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Provider config ${id} not found`);
    }

    if (dto.settings !== undefined) {
      entity.settings = dto.settings;
    }
    if (dto.description !== undefined) {
      entity.description = dto.description;
    }
    if (dto.isActive !== undefined) {
      entity.isActive = dto.isActive;
    }
    if (dto.isPrimary !== undefined) {
      entity.isPrimary = dto.isPrimary;
    }
    if (dto.credentials && Object.keys(dto.credentials).length > 0) {
      entity.setCredentials(this.normalizeCredentials(dto.credentials));
    }

    entity.updatedBy = currentUser.id;

    if (entity.isPrimary) {
      await this.clearPrimaryInScope(entity.type, entity.tenantId, entity.id);
    }

    const saved = await this.providerConfigRepository.save(entity);
    return this.toSanitized(saved);
  }

  async delete(id: string): Promise<void> {
    const config = await this.providerConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`Provider config ${id} not found`);
    }

    await this.providerConfigRepository.delete({ id });
  }

  async testConfig(id: string): Promise<{
    success: boolean;
    message: string;
    checkedAt: string;
    details?: Record<string, unknown>;
  }> {
    const config = await this.providerConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`Provider config ${id} not found`);
    }

    const provider = this.providerRegistry.get(config.type as IntegrationType, config.name);
    const checkedAt = new Date().toISOString();

    if (!provider) {
      return {
        success: false,
        message: `Provider runtime "${config.type}:${config.name}" is not registered in this deployment.`,
        checkedAt,
        details: { type: config.type, name: config.name, registered: false },
      };
    }

    if (!provider.isConfigured()) {
      return {
        success: false,
        message: `Provider "${config.name}" is not configured at runtime.`,
        checkedAt,
        details: { type: config.type, name: config.name, registered: true, configured: false },
      };
    }

    try {
      const healthy = await provider.healthCheck();
      return {
        success: healthy,
        message: healthy
          ? `Provider "${config.name}" connectivity check passed.`
          : `Provider "${config.name}" connectivity check failed.`,
        checkedAt,
        details: {
          type: config.type,
          name: config.name,
          registered: true,
          configured: true,
          healthy,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Provider health check failed.',
        checkedAt,
        details: {
          type: config.type,
          name: config.name,
          registered: true,
          configured: true,
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      };
    }
  }

  private async findByScope(
    type: IntegrationType,
    name: string,
    tenantId: string | null,
  ): Promise<ProviderConfig | null> {
    return this.providerConfigRepository.findOne({
      where: {
        type,
        name,
        tenantId: tenantId ?? IsNull(),
      },
    });
  }

  private async hasPrimaryInScope(
    type: IntegrationType,
    tenantId: string | null,
  ): Promise<boolean> {
    const existing = await this.providerConfigRepository.findOne({
      where: {
        type,
        tenantId: tenantId ?? IsNull(),
        isPrimary: true,
      },
    });
    return Boolean(existing);
  }

  private async clearPrimaryInScope(
    type: IntegrationType,
    tenantId: string | null,
    keepId?: string,
  ): Promise<void> {
    const scope = {
      type,
      tenantId: tenantId ?? IsNull(),
      isPrimary: true,
    };

    const existingPrimaries = await this.providerConfigRepository.find({ where: scope });
    const updates = existingPrimaries
      .filter((item) => !keepId || item.id !== keepId)
      .map((item) => {
        item.isPrimary = false;
        return item;
      });

    if (updates.length > 0) {
      await this.providerConfigRepository.save(updates);
    }
  }

  private normalizeCredentials(credentials: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      normalized[key] = trimmed;
    }

    return normalized;
  }

  private toSanitized(config: ProviderConfig): SanitizedProviderConfig {
    try {
      return config.toSanitized();
    } catch {
      const encryptedCredentials = (config as unknown as { encryptedCredentials?: string | null })
        .encryptedCredentials;

      return {
        id: config.id,
        type: config.type,
        name: config.name,
        tenantId: config.tenantId,
        isActive: config.isActive,
        isPrimary: config.isPrimary,
        settings: config.settings,
        description: config.description,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        createdBy: config.createdBy,
        updatedBy: config.updatedBy,
        hasCredentials: Boolean(encryptedCredentials),
        credentialKeys: [],
      };
    }
  }
}
