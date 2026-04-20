import { Injectable, ConflictException, Logger, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant, TenantStatus, TenantDeploymentType } from './entities/tenant.entity';
import { Client } from '../clients/entities/client.entity';
import { License } from '../licenses/entities/license.entity';
import { requireEntity } from '../common/utils/entity.util';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantResponseDto,
  TenantDetailResponseDto,
} from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(License)
    private readonly licenseRepository: Repository<License>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(clientId?: string): Promise<TenantResponseDto[]> {
    const query = this.tenantRepository.createQueryBuilder('tenant');

    if (clientId) {
      query.where('tenant.client_id = :clientId', { clientId });
    }

    const tenants = await query.orderBy('tenant.created_at', 'DESC').getMany();
    return tenants.map((tenant) => this.toResponseDto(tenant));
  }

  async findOne(id: string): Promise<TenantDetailResponseDto> {
    const tenant = await requireEntity(this.tenantRepository, { id }, 'Tenant', {
      relations: ['licenses'],
    });

    return this.toDetailDto(tenant);
  }

  async findBySlug(slug: string): Promise<TenantDetailResponseDto> {
    const tenant = await requireEntity(this.tenantRepository, { slug }, 'Tenant', {
      relations: ['licenses'],
    });

    return this.toDetailDto(tenant);
  }

  async create(dto: CreateTenantDto): Promise<TenantDetailResponseDto> {
    // Verify client exists
    const client = await requireEntity(this.clientRepository, { id: dto.clientId }, 'Client');

    // Check slug uniqueness
    const existing = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException('Tenant with this slug already exists');
    }

    // Create tenant
    const tenant = this.tenantRepository.create({
      ...dto,
      status: TenantStatus.PROVISIONING,
    });

    // For SaaS, provision database
    if (tenant.deploymentType === TenantDeploymentType.SAAS) {
      await this.provisionSaasDatabase(tenant);
    }

    const saved = await this.tenantRepository.save(tenant);

    // Mark as active after provisioning
    saved.status = TenantStatus.ACTIVE;
    await this.tenantRepository.save(saved);

    this.logger.log(`Created tenant ${saved.slug} for client ${client.slug}`);

    return this.toDetailDto(saved);
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantDetailResponseDto> {
    const tenant = await requireEntity(this.tenantRepository, { id }, 'Tenant', {
      relations: ['licenses'],
    });

    Object.assign(tenant, dto);
    const saved = await this.tenantRepository.save(tenant);
    return this.toDetailDto(saved);
  }

  async delete(id: string): Promise<void> {
    const tenant = await requireEntity(this.tenantRepository, { id }, 'Tenant');

    if (tenant.deploymentType === TenantDeploymentType.SAAS && tenant.dbName) {
      throw new NotImplementedException(
        `Tenant DB cleanup for ${tenant.dbName} is not implemented`,
      );
    }

    await this.tenantRepository.remove(tenant);
  }

  async activate(id: string): Promise<TenantDetailResponseDto> {
    const tenant = await requireEntity(this.tenantRepository, { id }, 'Tenant', {
      relations: ['licenses'],
    });

    tenant.status = TenantStatus.ACTIVE;
    const saved = await this.tenantRepository.save(tenant);
    return this.toDetailDto(saved);
  }

  async suspend(id: string): Promise<TenantDetailResponseDto> {
    const tenant = await requireEntity(this.tenantRepository, { id }, 'Tenant', {
      relations: ['licenses'],
    });

    tenant.status = TenantStatus.SUSPENDED;
    const saved = await this.tenantRepository.save(tenant);
    return this.toDetailDto(saved);
  }

  private async provisionSaasDatabase(tenant: Tenant): Promise<void> {
    const dbHost = this.configService.get<string>('TENANT_DB_HOST', 'localhost');
    const dbPort = this.configService.get<number>('TENANT_DB_PORT', 5432);
    const dbPrefix = this.configService.get<string>('TENANT_DB_PREFIX', 'skuld_tenant_');

    tenant.dbHost = dbHost;
    tenant.dbPort = dbPort;
    tenant.dbName = `${dbPrefix}${tenant.slug.replace(/-/g, '_')}`;
    tenant.dbUser = `skuld_${tenant.slug.replace(/-/g, '_')}`;
    tenant.dbPassword = this.generatePassword();

    throw new NotImplementedException(
      `Tenant DB provisioning for ${tenant.dbName} is not implemented`,
    );
  }

  private generatePassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private toResponseDto(tenant: Tenant): TenantResponseDto {
    return {
      id: tenant.id,
      clientId: tenant.clientId,
      name: tenant.name,
      slug: tenant.slug,
      environment: tenant.environment,
      deploymentType: tenant.deploymentType,
      status: tenant.status,
      region: tenant.region,
      apiUrl: tenant.apiUrl,
      uiUrl: tenant.uiUrl,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  private toDetailDto(tenant: Tenant): TenantDetailResponseDto {
    const activeLicense = tenant.licenses?.find((l) => l.status === 'active' && l.isValid());

    return {
      ...this.toResponseDto(tenant),
      dbHost: tenant.dbHost,
      dbPort: tenant.dbPort,
      dbName: tenant.dbName,
      settings: tenant.settings,
      metadata: tenant.metadata,
      activeLicenseId: activeLicense?.id || null,
    };
  }
}
