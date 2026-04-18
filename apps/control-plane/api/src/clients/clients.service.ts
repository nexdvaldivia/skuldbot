import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Client } from './entities/client.entity';
import {
  CreateClientDto,
  UpdateClientDto,
  ClientResponseDto,
  ClientDetailResponseDto,
  ListClientsQueryDto,
  ClientGatesResponseDto,
  ClientOverviewResponseDto,
  RegenerateClientApiKeyResponseDto,
} from './dto/client.dto';
import { PaymentProvider } from '../common/interfaces/integration.interface';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.module';
import { LookupsService } from '../lookups/lookups.service';
import {
  LOOKUP_DOMAIN_CLIENT_PLAN,
  LOOKUP_DOMAIN_CLIENT_STATUS,
} from '../lookups/lookups.constants';
import { Tenant, TenantStatus } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { SubscriptionStatus, TenantSubscription } from '../billing/entities/subscription.entity';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly lookupsService: LookupsService,
  ) {}

  async findAll(query: ListClientsQueryDto): Promise<ClientResponseDto[]> {
    const qb = this.clientRepository
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.tenants', 'tenant')
      .orderBy('client.created_at', 'DESC')
      .limit(query.limit ?? 100);

    if (query.status) {
      qb.andWhere('client.status = :status', { status: query.status.trim().toLowerCase() });
    }
    if (query.plan) {
      qb.andWhere('client.plan = :plan', { plan: query.plan.trim().toLowerCase() });
    }

    const clients = await qb.getMany();

    return clients.map((client) => this.toResponseDto(client));
  }

  async findOne(id: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    return this.toDetailDto(client);
  }

  async findBySlug(slug: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { slug },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with slug ${slug} not found`);
    }

    return this.toDetailDto(client);
  }

  async create(dto: CreateClientDto): Promise<ClientDetailResponseDto> {
    const existing = await this.clientRepository.findOne({
      where: [{ slug: dto.slug }, { name: dto.name }],
    });

    if (existing) {
      throw new ConflictException('Client with this name or slug already exists');
    }

    const plan = dto.plan
      ? dto.plan.trim().toLowerCase()
      : await this.lookupsService.getDefaultCode(LOOKUP_DOMAIN_CLIENT_PLAN, 'free');
    await this.lookupsService.assertActiveCode(
      LOOKUP_DOMAIN_CLIENT_PLAN,
      plan,
      `Invalid client plan "${dto.plan}"`,
    );

    const status = await this.lookupsService.getDefaultCode(LOOKUP_DOMAIN_CLIENT_STATUS, 'pending');

    const client = this.clientRepository.create({
      ...dto,
      plan,
      status,
      apiKey: this.generateApiKey(),
      apiKeyRotatedAt: new Date(),
    });

    // Create Stripe customer if payment provider is configured
    if (this.paymentProvider.isConfigured()) {
      try {
        const customer = await this.paymentProvider.createCustomer({
          email: dto.billingEmail,
          name: dto.name,
          metadata: { slug: dto.slug },
        });
        client.stripeCustomerId = customer.id;
        this.logger.log(`Created Stripe customer ${customer.id} for client ${dto.slug}`);
      } catch (error) {
        this.logger.error(`Failed to create Stripe customer for ${dto.slug}`, error);
      }
    }

    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async update(id: string, dto: UpdateClientDto): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    if (dto.plan) {
      const normalizedPlan = dto.plan.trim().toLowerCase();
      await this.lookupsService.assertActiveCode(
        LOOKUP_DOMAIN_CLIENT_PLAN,
        normalizedPlan,
        `Invalid client plan "${dto.plan}"`,
      );
      dto.plan = normalizedPlan;
    }

    if (dto.status) {
      const normalizedStatus = dto.status.trim().toLowerCase();
      await this.lookupsService.assertActiveCode(
        LOOKUP_DOMAIN_CLIENT_STATUS,
        normalizedStatus,
        `Invalid client status "${dto.status}"`,
      );
      dto.status = normalizedStatus;
    }

    // Update Stripe customer if email changed
    if (dto.billingEmail && dto.billingEmail !== client.billingEmail && client.stripeCustomerId) {
      if (this.paymentProvider.isConfigured()) {
        try {
          await this.paymentProvider.updateCustomer(client.stripeCustomerId, {
            email: dto.billingEmail,
            name: dto.name || client.name,
          });
        } catch (error) {
          this.logger.error(`Failed to update Stripe customer for ${client.slug}`, error);
        }
      }
    }

    Object.assign(client, dto);
    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async delete(id: string): Promise<void> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    if (client.tenants && client.tenants.length > 0) {
      throw new ConflictException('Cannot delete client with active tenants');
    }

    // Delete Stripe customer
    if (client.stripeCustomerId && this.paymentProvider.isConfigured()) {
      try {
        await this.paymentProvider.deleteCustomer(client.stripeCustomerId);
      } catch (error) {
        this.logger.error(`Failed to delete Stripe customer for ${client.slug}`, error);
      }
    }

    await this.clientRepository.remove(client);
  }

  async activate(id: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const activeStatus = await this.resolveRequiredStatus('active');
    client.status = activeStatus;
    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async suspend(id: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    if (client.status === 'suspended') {
      throw new BadRequestException('Client is already suspended');
    }
    if (client.status === 'cancelled') {
      throw new BadRequestException('Cannot suspend a cancelled client');
    }

    const suspendedStatus = await this.resolveRequiredStatus('suspended');
    client.status = suspendedStatus;
    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async reactivate(id: string): Promise<ClientDetailResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    if (client.status === 'cancelled') {
      throw new BadRequestException('Cannot reactivate a cancelled client');
    }
    if (client.status !== 'suspended') {
      throw new BadRequestException(`Client is not suspended (current status: ${client.status})`);
    }

    const activeStatus = await this.resolveRequiredStatus('active');
    client.status = activeStatus;
    const saved = await this.clientRepository.save(client);
    return this.toDetailDto(saved);
  }

  async regenerateApiKey(id: string): Promise<RegenerateClientApiKeyResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const oldKeyPrefix = this.getApiKeyPrefix(client.apiKey);
    client.apiKey = this.generateApiKey();
    client.apiKeyRotatedAt = new Date();
    await this.clientRepository.save(client);

    return {
      status: 'success',
      message: 'API key regenerated',
      oldKeyPrefix,
      newApiKey: client.apiKey,
    };
  }

  async getGates(id: string): Promise<ClientGatesResponseDto> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: ['tenants'],
    });
    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const hasActiveTenant = (client.tenants || []).some(
      (tenant) => tenant.status === TenantStatus.ACTIVE,
    );
    const gates = [
      {
        key: 'client_profile_complete',
        passed: Boolean(client.name?.trim() && client.slug?.trim() && client.billingEmail?.trim()),
        details: 'Client has required profile fields (name, slug, billingEmail).',
      },
      {
        key: 'has_active_tenant',
        passed: hasActiveTenant,
        details: 'Client has at least one active tenant.',
      },
      {
        key: 'billing_connected',
        passed: Boolean(client.stripeCustomerId),
        details: 'Client has an associated billing customer record.',
      },
      {
        key: 'client_status_allows_operations',
        passed: ['active', 'trial'].includes(client.status),
        details: 'Client status allows operations.',
      },
    ];

    return {
      clientId: client.id,
      overallPassed: gates.every((gate) => gate.passed),
      gates,
    };
  }

  async getOverview(id: string): Promise<ClientOverviewResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const tenants = await this.tenantRepository.find({
      where: { clientId: id },
      select: ['id', 'status'],
    });
    const tenantIds = tenants.map((tenant) => tenant.id);

    const usersTotal = await this.userRepository.count({
      where: { clientId: id },
    });

    const activeSubscriptions =
      tenantIds.length === 0
        ? 0
        : await this.subscriptionRepository.count({
            where: {
              tenantId: In(tenantIds),
              status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
            },
          });

    return {
      clientId: client.id,
      status: client.status,
      plan: client.plan,
      tenantsTotal: tenants.length,
      tenantsActive: tenants.filter((tenant) => tenant.status === TenantStatus.ACTIVE).length,
      usersTotal,
      activeSubscriptions,
      hasApiKey: Boolean(client.apiKey),
      hasStripeCustomer: Boolean(client.stripeCustomerId),
    };
  }

  private async resolveRequiredStatus(code: string): Promise<string> {
    const normalized = code.trim().toLowerCase();
    try {
      await this.lookupsService.assertActiveCode(LOOKUP_DOMAIN_CLIENT_STATUS, normalized);
      return normalized;
    } catch {
      throw new BadRequestException(
        `Required status "${normalized}" is not active in lookup domain ${LOOKUP_DOMAIN_CLIENT_STATUS}`,
      );
    }
  }

  private toResponseDto(client: Client): ClientResponseDto {
    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      plan: client.plan,
      status: client.status,
      billingEmail: client.billingEmail,
      tenantsCount: client.tenants?.length || 0,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  private toDetailDto(client: Client): ClientDetailResponseDto {
    return {
      ...this.toResponseDto(client),
      stripeCustomerId: client.stripeCustomerId,
      stripeSubscriptionId: client.stripeSubscriptionId,
      apiKeyPrefix: this.getApiKeyPrefix(client.apiKey),
      settings: client.settings,
      metadata: client.metadata,
    };
  }

  private generateApiKey(): string {
    return `skd_${randomBytes(24).toString('base64url')}`;
  }

  private getApiKeyPrefix(apiKey: string | null): string | null {
    if (!apiKey) {
      return null;
    }
    return `${apiKey.slice(0, 8)}...`;
  }
}
