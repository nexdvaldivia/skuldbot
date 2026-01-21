import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  License,
  LicenseType,
  LicenseStatus,
  LicenseFeatures,
} from './entities/license.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import {
  CreateLicenseDto,
  UpdateLicenseDto,
  LicenseResponseDto,
  LicenseDetailResponseDto,
  LicenseValidationResponseDto,
} from './dto/license.dto';

const DEFAULT_FEATURES: Record<LicenseType, LicenseFeatures> = {
  [LicenseType.TRIAL]: {
    maxBots: 3,
    maxRunners: 1,
    maxConcurrentRuns: 1,
    maxRunsPerMonth: 100,
    aiAssistant: false,
    customNodes: false,
    apiAccess: false,
    sso: false,
    auditLog: false,
    prioritySupport: false,
  },
  [LicenseType.STANDARD]: {
    maxBots: 10,
    maxRunners: 3,
    maxConcurrentRuns: 3,
    maxRunsPerMonth: 1000,
    aiAssistant: true,
    customNodes: false,
    apiAccess: true,
    sso: false,
    auditLog: true,
    prioritySupport: false,
  },
  [LicenseType.PROFESSIONAL]: {
    maxBots: 50,
    maxRunners: 10,
    maxConcurrentRuns: 10,
    maxRunsPerMonth: 10000,
    aiAssistant: true,
    customNodes: true,
    apiAccess: true,
    sso: true,
    auditLog: true,
    prioritySupport: false,
  },
  [LicenseType.ENTERPRISE]: {
    maxBots: -1, // unlimited
    maxRunners: -1,
    maxConcurrentRuns: -1,
    maxRunsPerMonth: -1,
    aiAssistant: true,
    customNodes: true,
    apiAccess: true,
    sso: true,
    auditLog: true,
    prioritySupport: true,
  },
};

@Injectable()
export class LicensesService {
  private readonly logger = new Logger(LicensesService.name);

  constructor(
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async findAll(tenantId?: string): Promise<LicenseResponseDto[]> {
    const query = this.licenseRepository.createQueryBuilder('license');

    if (tenantId) {
      query.where('license.tenant_id = :tenantId', { tenantId });
    }

    const licenses = await query.orderBy('license.created_at', 'DESC').getMany();
    return licenses.map((license) => this.toResponseDto(license));
  }

  async findOne(id: string): Promise<LicenseDetailResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    return this.toDetailDto(license);
  }

  async create(dto: CreateLicenseDto): Promise<LicenseDetailResponseDto> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${dto.tenantId} not found`);
    }

    // Generate license key
    const key = this.generateLicenseKey();

    // Merge default features with custom features
    const defaultFeatures = DEFAULT_FEATURES[dto.type];
    const features = { ...defaultFeatures, ...dto.features };

    const license = this.licenseRepository.create({
      tenantId: dto.tenantId,
      key,
      type: dto.type,
      status: LicenseStatus.ACTIVE,
      features,
      validFrom: new Date(dto.validFrom),
      validUntil: new Date(dto.validUntil),
    });

    const saved = await this.licenseRepository.save(license);
    this.logger.log(`Created license ${key} for tenant ${tenant.slug}`);

    return this.toDetailDto(saved);
  }

  async update(id: string, dto: UpdateLicenseDto): Promise<LicenseDetailResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    if (dto.status) {
      license.status = dto.status;
    }

    if (dto.validUntil) {
      license.validUntil = new Date(dto.validUntil);
    }

    if (dto.features) {
      license.features = { ...license.features, ...dto.features };
    }

    const saved = await this.licenseRepository.save(license);
    return this.toDetailDto(saved);
  }

  async revoke(id: string): Promise<LicenseDetailResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    license.status = LicenseStatus.REVOKED;
    const saved = await this.licenseRepository.save(license);

    this.logger.log(`Revoked license ${license.key}`);
    return this.toDetailDto(saved);
  }

  async validate(key: string): Promise<LicenseValidationResponseDto> {
    const license = await this.licenseRepository.findOne({
      where: { key },
      relations: ['tenant'],
    });

    if (!license) {
      return {
        valid: false,
        tenantId: null,
        tenantSlug: null,
        type: null,
        features: null,
        expiresAt: null,
        message: 'License key not found',
      };
    }

    // Update last validated
    license.lastValidatedAt = new Date();
    await this.licenseRepository.save(license);

    if (!license.isValid()) {
      let message = 'License is not valid';
      if (license.status !== LicenseStatus.ACTIVE) {
        message = `License is ${license.status}`;
      } else if (new Date() > license.validUntil) {
        message = 'License has expired';
      } else if (new Date() < license.validFrom) {
        message = 'License is not yet active';
      }

      return {
        valid: false,
        tenantId: license.tenantId,
        tenantSlug: license.tenant?.slug || null,
        type: license.type,
        features: null,
        expiresAt: license.validUntil,
        message,
      };
    }

    return {
      valid: true,
      tenantId: license.tenantId,
      tenantSlug: license.tenant?.slug || null,
      type: license.type,
      features: license.features,
      expiresAt: license.validUntil,
      message: 'License is valid',
    };
  }

  async generateForTenant(
    tenantId: string,
    type: LicenseType,
    durationDays: number = 365,
  ): Promise<LicenseDetailResponseDto> {
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + durationDays);

    return this.create({
      tenantId,
      type,
      validFrom: now.toISOString(),
      validUntil: validUntil.toISOString(),
    });
  }

  private generateLicenseKey(): string {
    // Format: SKULD-XXXX-XXXX-XXXX-XXXX
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments: string[] = [];

    for (let i = 0; i < 4; i++) {
      let segment = '';
      for (let j = 0; j < 4; j++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      segments.push(segment);
    }

    return `SKULD-${segments.join('-')}`;
  }

  private toResponseDto(license: License): LicenseResponseDto {
    return {
      id: license.id,
      tenantId: license.tenantId,
      key: license.key,
      type: license.type,
      status: license.status,
      validFrom: license.validFrom,
      validUntil: license.validUntil,
      isValid: license.isValid(),
      createdAt: license.createdAt,
      updatedAt: license.updatedAt,
    };
  }

  private toDetailDto(license: License): LicenseDetailResponseDto {
    return {
      ...this.toResponseDto(license),
      features: license.features,
      lastValidatedAt: license.lastValidatedAt,
      metadata: license.metadata,
    };
  }
}
