import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LicenseService } from '../license/license.service';
import { TenantSettings } from './entities/tenant-settings.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export interface TenantSettingsResponse {
  id: string | null;
  tenantId: string;
  organizationName: string;
  organizationSlug: string;
  logoUrl: string | null;
  preferences: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(TenantSettings)
    private readonly settingsRepository: Repository<TenantSettings>,
    private readonly licenseService: LicenseService,
  ) {}

  async getSettings(tenantId: string): Promise<TenantSettingsResponse> {
    const settings = await this.settingsRepository.findOne({
      where: { tenantId },
    });

    const defaultSlug =
      this.licenseService.getTenantSlug() ||
      this.licenseService.getTenantId() ||
      tenantId;

    const defaultName =
      this.toDisplayName(defaultSlug) || this.toDisplayName(tenantId);

    return {
      id: settings?.id || null,
      tenantId,
      organizationName: settings?.organizationName || defaultName,
      organizationSlug: settings?.organizationSlug || defaultSlug,
      logoUrl: settings?.logoUrl || null,
      preferences: settings?.preferences || {},
      createdAt: settings?.createdAt?.toISOString() || null,
      updatedAt: settings?.updatedAt?.toISOString() || null,
    };
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateSettingsDto,
  ): Promise<TenantSettingsResponse> {
    const existing = await this.settingsRepository.findOne({
      where: { tenantId },
    });

    const entity = existing || this.settingsRepository.create({ tenantId });

    if (dto.organizationName !== undefined) {
      entity.organizationName = dto.organizationName.trim() || null;
    }

    if (dto.organizationSlug !== undefined) {
      entity.organizationSlug = this.normalizeSlug(dto.organizationSlug);
    }

    if (dto.logoUrl !== undefined) {
      entity.logoUrl = dto.logoUrl.trim() || null;
    }

    if (dto.preferences !== undefined) {
      entity.preferences = {
        ...(entity.preferences || {}),
        ...dto.preferences,
      };
    }

    const saved = await this.settingsRepository.save(entity);
    return this.getSettings(saved.tenantId);
  }

  private normalizeSlug(value: string): string | null {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    return normalized || null;
  }

  private toDisplayName(value: string): string {
    return value
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
