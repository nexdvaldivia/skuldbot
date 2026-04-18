import {
  Injectable,
  ConflictException,
  BadRequestException,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
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
  ClientAuthorizationResponseDto,
  SendClientContractsRequestDto,
} from './dto/client.dto';
import { PaymentProvider } from '../common/interfaces/integration.interface';
import { PAYMENT_PROVIDER } from '../integrations/payment/payment.module';
import { LookupsService } from '../lookups/lookups.service';
import {
  LOOKUP_DOMAIN_CLIENT_PLAN,
  LOOKUP_DOMAIN_CLIENT_STATUS,
} from '../lookups/lookups.constants';
import { requireEntity } from '../common/utils/entity.util';
import { normalizeOptionalLowercaseString } from '../common/utils/string.util';
import { Tenant, TenantStatus } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { SubscriptionStatus, TenantSubscription } from '../billing/entities/subscription.entity';
import { InvoiceEntity, InvoiceStatusEnum } from '../integrations/payment/entities/invoice.entity';
import { UsageRecord } from '../billing/entities/usage-record.entity';
import { Ticket, TicketPriority } from '../tickets/entities/ticket.entity';
import {
  decryptSecretAes256Gcm,
  encryptSecretAes256Gcm,
  hashSecretSha256,
  isEncryptedSecret,
} from '../common/utils/secret-crypto.util';
import { ensureClientAccess } from './clients-shared.util';
import { ClientContact } from './entities/client-contact.entity';
import { ClientApiKeyAudit } from './entities/client-api-key-audit.entity';

interface StoredClientContract {
  id: string;
  templateType: string;
  status: 'pending' | 'signed' | 'revoked';
  createdAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  pdfPath: string | null;
  signerEmail: string | null;
}

interface ClientAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  message: string;
  detectedAt: string;
  sourceId: string;
}

interface QuotaStatusItem {
  slug: string;
  name: string;
  current: number;
  limit: number;
  percent: number;
  status: 'normal' | 'warning' | 'exceeded' | 'blocked';
  unit: string;
}

const PLAN_LIMITS: Record<string, { executions: number; storageGb: number; dataPods: number }> = {
  free: { executions: 10000, storageGb: 10, dataPods: 5 },
  trial: { executions: 5000, storageGb: 5, dataPods: 3 },
  starter: { executions: 25000, storageGb: 50, dataPods: 10 },
  pro: { executions: 100000, storageGb: 200, dataPods: 25 },
  professional: { executions: 100000, storageGb: 200, dataPods: 25 },
  enterprise: { executions: 1000000, storageGb: 2000, dataPods: 500 },
};

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);
  private readonly apiKeyPrimarySeed: string;
  private readonly apiKeyDecryptionSeeds: string[];

  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionRepository: Repository<TenantSubscription>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepository: Repository<InvoiceEntity>,
    @InjectRepository(UsageRecord)
    private readonly usageRecordRepository: Repository<UsageRecord>,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(ClientContact)
    private readonly contactRepository: Repository<ClientContact>,
    @InjectRepository(ClientApiKeyAudit)
    private readonly apiKeyAuditRepository: Repository<ClientApiKeyAudit>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly lookupsService: LookupsService,
    private readonly configService: ConfigService,
  ) {
    const seeds = this.resolveApiKeySeeds();
    this.apiKeyPrimarySeed = seeds.primary;
    this.apiKeyDecryptionSeeds = seeds.candidates;
  }

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
    const client = await requireEntity(this.clientRepository, { id }, 'Client', {
      relations: ['tenants'],
    });
    return this.toDetailDto(client);
  }

  async findBySlug(slug: string): Promise<ClientDetailResponseDto> {
    const client = await requireEntity(this.clientRepository, { slug }, 'Client', {
      relations: ['tenants'],
    });
    return this.toDetailDto(client);
  }

  async create(dto: CreateClientDto): Promise<ClientDetailResponseDto> {
    const existing = await this.clientRepository.findOne({
      where: [{ slug: dto.slug }, { name: dto.name }],
    });

    if (existing) {
      throw new ConflictException('Client with this name or slug already exists');
    }

    const normalizedPlan = normalizeOptionalLowercaseString(dto.plan);
    const plan =
      normalizedPlan ??
      (await this.lookupsService.getDefaultCode(LOOKUP_DOMAIN_CLIENT_PLAN, 'free'));
    await this.lookupsService.assertActiveCode(
      LOOKUP_DOMAIN_CLIENT_PLAN,
      plan,
      `Invalid client plan "${dto.plan}"`,
    );

    const status = await this.lookupsService.getDefaultCode(LOOKUP_DOMAIN_CLIENT_STATUS, 'pending');
    const apiKeyPayload = this.generateEncryptedApiKey();

    const client = this.clientRepository.create({
      ...dto,
      plan,
      status,
      apiKey: apiKeyPayload.encrypted,
      apiKeyHash: apiKeyPayload.hash,
      apiKeyRotatedAt: new Date(),
    });

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
    const hydrated = await requireEntity(this.clientRepository, { id }, 'Client', {
      relations: ['tenants'],
    });

    const normalizedPlan = normalizeOptionalLowercaseString(dto.plan);
    if (normalizedPlan) {
      await this.lookupsService.assertActiveCode(
        LOOKUP_DOMAIN_CLIENT_PLAN,
        normalizedPlan,
        `Invalid client plan "${dto.plan}"`,
      );
      dto.plan = normalizedPlan;
    }

    const normalizedStatus = normalizeOptionalLowercaseString(dto.status);
    if (normalizedStatus) {
      await this.lookupsService.assertActiveCode(
        LOOKUP_DOMAIN_CLIENT_STATUS,
        normalizedStatus,
        `Invalid client status "${dto.status}"`,
      );
      dto.status = normalizedStatus;
    }

    if (
      dto.billingEmail &&
      dto.billingEmail !== hydrated.billingEmail &&
      hydrated.stripeCustomerId &&
      this.paymentProvider.isConfigured()
    ) {
      try {
        await this.paymentProvider.updateCustomer(hydrated.stripeCustomerId, {
          email: dto.billingEmail,
          name: dto.name || hydrated.name,
        });
      } catch (error) {
        this.logger.error(`Failed to update Stripe customer for ${hydrated.slug}`, error);
      }
    }

    Object.assign(hydrated, dto);
    const saved = await this.clientRepository.save(hydrated);
    return this.toDetailDto(saved);
  }

  async delete(id: string): Promise<void> {
    const hydrated = await requireEntity(this.clientRepository, { id }, 'Client', {
      relations: ['tenants'],
    });

    if (hydrated.tenants && hydrated.tenants.length > 0) {
      throw new ConflictException('Cannot delete client with active tenants');
    }

    if (hydrated.stripeCustomerId && this.paymentProvider.isConfigured()) {
      try {
        await this.paymentProvider.deleteCustomer(hydrated.stripeCustomerId);
      } catch (error) {
        this.logger.error(`Failed to delete Stripe customer for ${hydrated.slug}`, error);
      }
    }

    await this.clientRepository.remove(hydrated);
  }

  async activate(id: string): Promise<ClientDetailResponseDto> {
    const hydrated = await requireEntity(this.clientRepository, { id }, 'Client', {
      relations: ['tenants'],
    });

    const activeStatus = await this.resolveRequiredStatus('active');
    hydrated.status = activeStatus;
    const saved = await this.clientRepository.save(hydrated);
    return this.toDetailDto(saved);
  }

  async suspend(id: string): Promise<ClientDetailResponseDto> {
    const hydrated = await requireEntity(this.clientRepository, { id }, 'Client', {
      relations: ['tenants'],
    });

    if (hydrated.status === 'suspended') {
      throw new BadRequestException('Client is already suspended');
    }
    if (hydrated.status === 'cancelled') {
      throw new BadRequestException('Cannot suspend a cancelled client');
    }
    const suspendedStatus = await this.resolveRequiredStatus('suspended');
    hydrated.status = suspendedStatus;
    const saved = await this.clientRepository.save(hydrated);
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

  async regenerateApiKey(
    id: string,
    currentUser: User,
    requestIp: string | null,
  ): Promise<RegenerateClientApiKeyResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const oldKeyPrefix = this.getApiKeyPrefix(client.apiKey);
    const apiKeyPayload = this.generateEncryptedApiKey();
    client.apiKey = apiKeyPayload.encrypted;
    client.apiKeyHash = apiKeyPayload.hash;
    client.apiKeyRotatedAt = new Date();
    await this.clientRepository.save(client);

    await this.apiKeyAuditRepository.save(
      this.apiKeyAuditRepository.create({
        clientId: client.id,
        oldKeyPrefix,
        newKeyPrefix: this.getApiKeyPrefix(client.apiKey) ?? 'hidden',
        rotatedBy: currentUser.email,
        rotatedAt: client.apiKeyRotatedAt,
        rotatedFromIp: requestIp,
        metadata: {
          operation: 'regenerate_api_key',
        },
      }),
    );

    return {
      status: 'success',
      message: 'API key regenerated',
      oldKeyPrefix,
      newApiKey: apiKeyPayload.raw,
    };
  }

  async authorize(id: string, currentUser: User): Promise<ClientAuthorizationResponseDto> {
    const client = await this.loadClientForScopedAction(id, currentUser);

    if (client.status === 'cancelled') {
      throw new BadRequestException('Cannot authorize a cancelled client');
    }

    const targetStatus = await this.resolveRequiredStatus('active');
    client.status = targetStatus;

    let issuedToken: string | null = null;
    if (!client.apiKeyHash) {
      const apiKeyPayload = this.generateEncryptedApiKey();
      client.apiKey = apiKeyPayload.encrypted;
      client.apiKeyHash = apiKeyPayload.hash;
      client.apiKeyRotatedAt = new Date();
      issuedToken = apiKeyPayload.raw;
    }

    await this.clientRepository.save(client);

    return {
      success: true,
      message: issuedToken
        ? 'Client authorized and API key issued'
        : 'Client authorization confirmed',
      clientId: client.id,
      clientEmail: client.billingEmail,
      accessToken: issuedToken,
    };
  }

  async resendAuthorization(
    id: string,
    currentUser: User,
    regenerateToken: boolean,
  ): Promise<ClientAuthorizationResponseDto> {
    const client = await this.loadClientForScopedAction(id, currentUser);

    let issuedToken: string | null = null;
    if (regenerateToken || !client.apiKeyHash) {
      const apiKeyPayload = this.generateEncryptedApiKey();
      client.apiKey = apiKeyPayload.encrypted;
      client.apiKeyHash = apiKeyPayload.hash;
      client.apiKeyRotatedAt = new Date();
      issuedToken = apiKeyPayload.raw;
      await this.clientRepository.save(client);
    }

    return {
      success: true,
      message: regenerateToken ? 'Authorization resent with new API key' : 'Authorization resent',
      clientId: client.id,
      clientEmail: client.billingEmail,
      accessToken: issuedToken,
    };
  }

  async deny(id: string, reason: string, currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);

    if (client.status === 'cancelled') {
      throw new BadRequestException('Client is already cancelled');
    }

    const activeTenants = await this.tenantRepository.count({
      where: { clientId: id, status: TenantStatus.ACTIVE },
    });
    if (activeTenants > 0) {
      throw new BadRequestException('Cannot deny client with active tenants');
    }

    client.status = await this.resolveRequiredStatus('cancelled');
    client.metadata = {
      ...(client.metadata || {}),
      denial: {
        reason,
        deniedAt: new Date().toISOString(),
        deniedBy: currentUser.email,
      },
    };

    await this.clientRepository.save(client);

    return {
      success: true,
      clientId: id,
      reason,
      deniedBy: currentUser.email,
    };
  }

  async getContracts(
    id: string,
    currentUser: User,
    includeRevoked: boolean,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const contracts = this.getStoredContracts(client).filter((contract) => {
      return includeRevoked ? true : contract.status !== 'revoked';
    });

    return {
      clientId: client.id,
      clientName: client.name,
      totalContracts: contracts.length,
      contracts,
    };
  }

  async generateContractPdf(
    id: string,
    contractId: string,
    currentUser: User,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const contracts = this.getStoredContracts(client);
    const index = contracts.findIndex((contract) => contract.id === contractId);

    if (index < 0) {
      throw new NotFoundException(`Contract ${contractId} not found for client ${id}`);
    }

    const nowIso = new Date().toISOString();
    contracts[index] = {
      ...contracts[index],
      pdfPath: `/api/v1/clients/${id}/contracts/${contractId}/pdf?generatedAt=${encodeURIComponent(nowIso)}`,
      acceptedAt: contracts[index].acceptedAt ?? nowIso,
    };

    await this.persistStoredContracts(client, contracts);

    return {
      success: true,
      clientId: id,
      contractId,
      pdfPath: contracts[index].pdfPath,
      generatedAt: nowIso,
    };
  }

  async revokeContract(
    id: string,
    contractId: string,
    reason: string,
    currentUser: User,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const contracts = this.getStoredContracts(client);
    const index = contracts.findIndex((contract) => contract.id === contractId);

    if (index < 0) {
      throw new NotFoundException(`Contract ${contractId} not found for client ${id}`);
    }

    if (contracts[index].status === 'revoked') {
      throw new BadRequestException('Contract is already revoked');
    }

    contracts[index] = {
      ...contracts[index],
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revocationReason: reason,
    };

    await this.persistStoredContracts(client, contracts);

    return {
      success: true,
      contractId,
      revokedAt: contracts[index].revokedAt,
      reason,
      revokedBy: currentUser.email,
    };
  }

  async getContractSigningReadiness(
    id: string,
    currentUser: User,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const contacts = await this.contactRepository.find({
      where: { clientId: id },
      order: { createdAt: 'ASC' },
    });
    const activeContacts = contacts.filter((contact) => !contact.deletedAt);
    const signers = activeContacts.filter((contact) => contact.isContractSigner);

    const issues: string[] = [];
    if (activeContacts.length === 0) {
      issues.push('No contacts configured for this client');
    }
    if (signers.length === 0) {
      issues.push('No contract signer is configured');
    }

    return {
      clientId: id,
      clientName: client.name,
      isReady: signers.length > 0,
      hasContacts: activeContacts.length > 0,
      hasContractSigner: signers.length > 0,
      contractSigners: signers.map((contact) => ({
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
        title: contact.jobTitle,
        contactType: contact.contactType,
      })),
      issues,
    };
  }

  async sendContracts(
    id: string,
    request: SendClientContractsRequestDto,
    currentUser: User,
  ): Promise<Record<string, unknown>> {
    const readiness = await this.getContractSigningReadiness(id, currentUser);
    if (!readiness.isReady) {
      return {
        success: false,
        message: 'Client is not ready for contract signing',
        clientId: id,
        issues: readiness.issues,
        templateTypes: request.templateTypes,
      };
    }

    const client = await this.loadClientForScopedAction(id, currentUser);
    const signer = (readiness.contractSigners as Array<Record<string, unknown>>)[0];
    const nowIso = new Date().toISOString();
    const contracts = this.getStoredContracts(client);

    for (const templateType of request.templateTypes) {
      contracts.push({
        id: this.generateContractId(),
        templateType,
        status: 'pending',
        createdAt: nowIso,
        sentAt: request.autoSend === false ? null : nowIso,
        acceptedAt: null,
        revokedAt: null,
        revocationReason: null,
        pdfPath: null,
        signerEmail: String(signer.email ?? ''),
      });
    }

    await this.persistStoredContracts(client, contracts);

    return {
      success: true,
      message: 'Contracts queued for signing',
      clientId: id,
      envelopeId: this.generateEnvelopeId(),
      signerEmail: signer.email,
      signerName: signer.name,
      templateTypes: request.templateTypes,
      sentAt: request.autoSend === false ? null : nowIso,
      notes: request.notes ?? null,
    };
  }

  async getInvoices(
    id: string,
    currentUser: User,
    statusFilter: string | null,
    page: number,
    pageSize: number,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const tenantIds = await this.getTenantIds(id);

    if (tenantIds.length === 0) {
      return this.emptyInvoiceResponse(client, page, pageSize);
    }

    const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedPageSize =
      Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : 20;

    const where = statusFilter
      ? { tenantId: In(tenantIds), status: statusFilter as InvoiceStatusEnum }
      : { tenantId: In(tenantIds) };

    const invoices = await this.invoiceRepository.find({
      where,
      order: { createdAt: 'DESC' },
      skip: (normalizedPage - 1) * normalizedPageSize,
      take: normalizedPageSize,
    });

    const total = await this.invoiceRepository.count({ where });

    const paidInvoices = await this.invoiceRepository.find({
      where: { tenantId: In(tenantIds), status: InvoiceStatusEnum.PAID },
      select: ['totalInCents'],
    });

    const lifetimeRevenue = paidInvoices.reduce(
      (sum, invoice) => sum + (invoice.totalInCents || 0),
      0,
    );

    return {
      clientId: id,
      clientName: client.name,
      totalInvoices: total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages: Math.ceil(total / normalizedPageSize),
      summary: {
        lifetimeRevenueUsd: Number((lifetimeRevenue / 100).toFixed(2)),
        paidInvoicesCount: paidInvoices.length,
      },
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        stripeInvoiceId: invoice.stripeInvoiceId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        currency: invoice.currency,
        totalAmountUsd: Number((invoice.totalInCents / 100).toFixed(2)),
        amountPaidUsd: Number((invoice.amountPaidInCents / 100).toFixed(2)),
        amountDueUsd: Number((invoice.amountDueInCents / 100).toFixed(2)),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        invoicePdfUrl: invoice.invoicePdfUrl,
      })),
    };
  }

  async getUsageHistory(
    id: string,
    currentUser: User,
    months: number,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const tenantIds = await this.getTenantIds(id);
    const normalizedMonths = Number.isFinite(months)
      ? Math.max(1, Math.min(24, Math.floor(months)))
      : 12;

    if (tenantIds.length === 0) {
      return {
        clientId: id,
        clientName: client.name,
        monthsRequested: normalizedMonths,
        monthsAvailable: 0,
        usageHistory: [],
      };
    }

    const usage = await this.usageRecordRepository.find({
      where: { tenantId: In(tenantIds) },
      order: { period: 'DESC', createdAt: 'DESC' },
      take: normalizedMonths * 100,
    });

    const periodMap = new Map<
      string,
      { quantity: number; amount: number; metrics: Record<string, number> }
    >();
    for (const row of usage) {
      if (!periodMap.has(row.period)) {
        periodMap.set(row.period, { quantity: 0, amount: 0, metrics: {} });
      }
      const bucket = periodMap.get(row.period)!;
      bucket.quantity += Number(row.quantity ?? 0);
      bucket.amount += Number(row.totalAmount ?? 0);
      bucket.metrics[row.metric] = Number(
        (bucket.metrics[row.metric] ?? 0) + Number(row.quantity ?? 0),
      );
    }

    const periods = [...periodMap.keys()]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, normalizedMonths);

    return {
      clientId: id,
      clientName: client.name,
      monthsRequested: normalizedMonths,
      monthsAvailable: periods.length,
      usageHistory: periods.map((period) => ({
        period,
        totalQuantity: Number(periodMap.get(period)!.quantity.toFixed(6)),
        totalAmountUsd: Number(periodMap.get(period)!.amount.toFixed(2)),
        metrics: periodMap.get(period)!.metrics,
      })),
    };
  }

  async getDataPodDailyVolume(
    id: string,
    currentUser: User,
    days: number,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const tenantIds = await this.getTenantIds(id);
    const normalizedDays = Number.isFinite(days)
      ? Math.max(1, Math.min(365, Math.floor(days)))
      : 30;

    if (tenantIds.length === 0) {
      return { clientId: id, clientName: client.name, days: normalizedDays, dailyVolume: [] };
    }

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - normalizedDays);

    const usage = await this.usageRecordRepository.find({
      where: { tenantId: In(tenantIds), createdAt: MoreThanOrEqual(startDate) },
      order: { createdAt: 'ASC' },
    });

    const grouped = new Map<string, { totalQuantity: number; metrics: Record<string, number> }>();
    for (const row of usage) {
      const day = row.createdAt.toISOString().slice(0, 10);
      if (!grouped.has(day)) {
        grouped.set(day, { totalQuantity: 0, metrics: {} });
      }
      const bucket = grouped.get(day)!;
      bucket.totalQuantity += Number(row.quantity ?? 0);
      bucket.metrics[row.metric] = Number(
        (bucket.metrics[row.metric] ?? 0) + Number(row.quantity ?? 0),
      );
    }

    return {
      clientId: id,
      clientName: client.name,
      days: normalizedDays,
      dailyVolume: [...grouped.entries()].map(([day, values]) => ({
        date: day,
        totalQuantity: Number(values.totalQuantity.toFixed(6)),
        metrics: values.metrics,
      })),
    };
  }

  async getSupportTickets(
    id: string,
    currentUser: User,
    statusFilter: string | null,
    limit: number,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const tenantIds = await this.getTenantIds(id);
    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 100)
      : 20;

    if (tenantIds.length === 0) {
      return {
        clientId: id,
        clientName: client.name,
        summary: { totalTickets: 0, openTickets: 0, closedTickets: 0, urgentOpenTickets: 0 },
        tickets: [],
      };
    }

    const where = statusFilter
      ? { tenantId: In(tenantIds), status: statusFilter }
      : { tenantId: In(tenantIds) };

    const tickets = await this.ticketRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: normalizedLimit,
    });

    const totalTickets = await this.ticketRepository.count({ where: { tenantId: In(tenantIds) } });
    const openTickets = await this.ticketRepository.count({
      where: { tenantId: In(tenantIds), status: In(['open', 'in_progress']) },
    });

    const urgentOpenTickets = await this.ticketRepository.count({
      where: {
        tenantId: In(tenantIds),
        status: In(['open', 'in_progress']),
        priority: TicketPriority.URGENT,
      },
    });

    return {
      clientId: id,
      clientName: client.name,
      summary: {
        totalTickets,
        openTickets,
        closedTickets: totalTickets - openTickets,
        urgentOpenTickets,
      },
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        tenantId: ticket.tenantId,
        requesterEmail: ticket.requesterEmail,
        requesterName: ticket.requesterName,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        source: ticket.source,
        category: ticket.category,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      })),
    };
  }

  async getAlerts(
    id: string,
    currentUser: User,
    severityFilter: string | null,
    days: number,
  ): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const tenantIds = await this.getTenantIds(id);
    const normalizedDays = Number.isFinite(days)
      ? Math.max(1, Math.min(365, Math.floor(days)))
      : 30;

    if (tenantIds.length === 0) {
      return {
        clientId: id,
        clientName: client.name,
        summary: { totalAlerts: 0, critical: 0, high: 0, medium: 0, low: 0 },
        alerts: [],
      };
    }

    const alerts = await this.collectClientAlerts(tenantIds, normalizedDays);
    const filtered = severityFilter
      ? alerts.filter((alert) => alert.severity === severityFilter)
      : alerts;

    return {
      clientId: id,
      clientName: client.name,
      summary: {
        totalAlerts: filtered.length,
        critical: filtered.filter((alert) => alert.severity === 'critical').length,
        high: filtered.filter((alert) => alert.severity === 'high').length,
        medium: filtered.filter((alert) => alert.severity === 'medium').length,
        low: filtered.filter((alert) => alert.severity === 'low').length,
      },
      alerts: filtered,
    };
  }

  async getQuotaStatus(id: string, currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const tenantIds = await this.getTenantIds(id);

    if (tenantIds.length === 0) {
      return {
        clientId: id,
        clientName: client.name,
        plan: client.plan,
        overallStatus: 'normal',
        quotas: [],
      };
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);
    const usage = await this.usageRecordRepository.find({
      where: { tenantId: In(tenantIds), period: currentPeriod },
    });

    const totals = this.summarizeQuotaUsage(usage);
    const limits = PLAN_LIMITS[client.plan] ?? PLAN_LIMITS.free;

    const quotas: QuotaStatusItem[] = [
      this.buildQuotaItem(
        'executions',
        'Pipeline Executions',
        totals.executions,
        limits.executions,
        'runs',
      ),
      this.buildQuotaItem('storage', 'Storage', totals.storageGb, limits.storageGb, 'GB'),
      this.buildQuotaItem('data_pods', 'Data Pods', totals.dataPods, limits.dataPods, 'pods'),
    ];

    const maxPercent = Math.max(...quotas.map((quota) => quota.percent));

    return {
      clientId: id,
      clientName: client.name,
      plan: client.plan,
      billingPeriod: currentPeriod,
      overallStatus: this.resolveQuotaStatus(maxPercent),
      quotas,
    };
  }

  async getHealthScore(id: string, currentUser: User): Promise<Record<string, unknown>> {
    const client = await this.loadClientForScopedAction(id, currentUser);
    const tenantIds = await this.getTenantIds(id);

    if (tenantIds.length === 0) {
      return {
        clientId: id,
        clientName: client.name,
        healthScore: 35,
        grade: 'D',
        factors: {
          payment: 0,
          usage: 0,
          support: 20,
          operations: 15,
        },
      };
    }

    const payment = await this.calculatePaymentHealth(tenantIds);
    const usage = await this.calculateUsageHealth(tenantIds);
    const support = await this.calculateSupportHealth(tenantIds);
    const alerts = await this.collectClientAlerts(tenantIds, 30);
    const operations = Math.max(0, 25 - alerts.length * 2);

    const score = Math.max(0, Math.min(100, payment + usage + support + operations));

    return {
      clientId: id,
      clientName: client.name,
      healthScore: score,
      grade: this.resolveHealthGrade(score),
      factors: {
        payment,
        usage,
        support,
        operations,
      },
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
      hasApiKey: Boolean(client.apiKeyHash),
      hasStripeCustomer: Boolean(client.stripeCustomerId),
    };
  }

  private async loadClientForScopedAction(clientId: string, currentUser: User): Promise<Client> {
    await ensureClientAccess(this.clientRepository, clientId, currentUser);
    return requireEntity(this.clientRepository, { id: clientId }, 'Client', {
      relations: ['tenants'],
    });
  }

  private async resolveRequiredStatus(code: string): Promise<string> {
    const normalized = normalizeOptionalLowercaseString(code);
    if (!normalized) {
      throw new BadRequestException('Client status code is required');
    }

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

  private resolveApiKeySeeds(): { primary: string; candidates: string[] } {
    const primaryCandidate =
      this.configService.get<string>('CLIENT_API_KEY_ENCRYPTION_KEY_PRIMARY') ??
      this.configService.get<string>('CLIENT_API_KEY_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_SECRET');
    const secondaryCandidate =
      this.configService.get<string>('CLIENT_API_KEY_ENCRYPTION_KEY_SECONDARY') ?? null;

    const blockedDefaults = new Set(['change-this-secret', 'changeme', 'default-secret', 'secret']);

    const isSecure = (value: string | null | undefined): value is string => {
      if (typeof value !== 'string') {
        return false;
      }
      const normalized = value.trim();
      return normalized.length > 0 && !blockedDefaults.has(normalized.toLowerCase());
    };

    if (isSecure(primaryCandidate)) {
      const candidates = new Set<string>([primaryCandidate]);
      if (isSecure(secondaryCandidate)) {
        candidates.add(secondaryCandidate);
      }
      return {
        primary: primaryCandidate,
        candidates: [...candidates],
      };
    }

    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return {
        primary: 'test-client-api-key-seed',
        candidates: ['test-client-api-key-seed'],
      };
    }

    throw new Error(
      'CLIENT_API_KEY_ENCRYPTION_KEY_PRIMARY (or CLIENT_API_KEY_ENCRYPTION_KEY/JWT_SECRET fallback) must be configured with a secure value.',
    );
  }

  private generateEncryptedApiKey(): { raw: string; encrypted: string; hash: string } {
    const raw = `skd_${randomBytes(24).toString('base64url')}`;
    return {
      raw,
      encrypted: encryptSecretAes256Gcm(raw, this.apiKeyPrimarySeed),
      hash: hashSecretSha256(raw),
    };
  }

  private decryptApiKey(apiKey: string | null): string | null {
    if (!apiKey) {
      return null;
    }

    if (!isEncryptedSecret(apiKey)) {
      return apiKey;
    }

    for (const seed of this.apiKeyDecryptionSeeds) {
      try {
        return decryptSecretAes256Gcm(apiKey, seed);
      } catch {
        continue;
      }
    }

    this.logger.error('Failed to decrypt client API key for prefix display');
    return null;
  }

  private getApiKeyPrefix(apiKey: string | null): string | null {
    const raw = this.decryptApiKey(apiKey);
    if (!raw) {
      return null;
    }
    return `${raw.slice(0, 8)}...`;
  }

  private getStoredContracts(client: Client): StoredClientContract[] {
    const metadata = client.metadata || {};
    const raw = (metadata.contracts as unknown[]) || [];

    return raw
      .filter((item) => typeof item === 'object' && item !== null)
      .map((item) => {
        const entry = item as Partial<StoredClientContract>;
        return {
          id: String(entry.id ?? this.generateContractId()),
          templateType: String(entry.templateType ?? 'unknown'),
          status:
            entry.status === 'revoked' || entry.status === 'signed' ? entry.status : 'pending',
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          sentAt: entry.sentAt ?? null,
          acceptedAt: entry.acceptedAt ?? null,
          revokedAt: entry.revokedAt ?? null,
          revocationReason: entry.revocationReason ?? null,
          pdfPath: entry.pdfPath ?? null,
          signerEmail: entry.signerEmail ?? null,
        };
      });
  }

  private async persistStoredContracts(
    client: Client,
    contracts: StoredClientContract[],
  ): Promise<void> {
    client.metadata = {
      ...(client.metadata || {}),
      contracts,
    };
    await this.clientRepository.save(client);
  }

  private generateContractId(): string {
    return `ctr_${randomBytes(12).toString('hex')}`;
  }

  private generateEnvelopeId(): string {
    return `env_${randomBytes(12).toString('hex')}`;
  }

  private async getTenantIds(clientId: string): Promise<string[]> {
    const tenants = await this.tenantRepository.find({
      where: { clientId },
      select: ['id'],
    });
    return tenants.map((tenant) => tenant.id);
  }

  private emptyInvoiceResponse(
    client: Client,
    page: number,
    pageSize: number,
  ): Record<string, unknown> {
    return {
      clientId: client.id,
      clientName: client.name,
      totalInvoices: 0,
      page,
      pageSize,
      totalPages: 0,
      summary: {
        lifetimeRevenueUsd: 0,
        paidInvoicesCount: 0,
      },
      invoices: [],
    };
  }

  private summarizeQuotaUsage(usage: UsageRecord[]): {
    executions: number;
    storageGb: number;
    dataPods: number;
  } {
    const totals = {
      executions: 0,
      storageGb: 0,
      dataPods: 0,
    };

    for (const row of usage) {
      const metric = row.metric.toLowerCase();
      const quantity = Number(row.quantity ?? 0);

      if (metric.includes('execution') || metric.includes('run')) {
        totals.executions += quantity;
      }
      if (metric.includes('storage')) {
        totals.storageGb += quantity;
      }
      if (metric.includes('pod')) {
        totals.dataPods += quantity;
      }
    }

    return totals;
  }

  private buildQuotaItem(
    slug: string,
    name: string,
    current: number,
    limit: number,
    unit: string,
  ): QuotaStatusItem {
    const percent = limit > 0 ? (current / limit) * 100 : 0;

    return {
      slug,
      name,
      current: Number(current.toFixed(2)),
      limit,
      percent: Number(percent.toFixed(1)),
      status: this.resolveQuotaStatus(percent),
      unit,
    };
  }

  private resolveQuotaStatus(percent: number): 'normal' | 'warning' | 'exceeded' | 'blocked' {
    if (percent >= 110) {
      return 'blocked';
    }
    if (percent >= 100) {
      return 'exceeded';
    }
    if (percent >= 80) {
      return 'warning';
    }
    return 'normal';
  }

  private async collectClientAlerts(tenantIds: string[], days: number): Promise<ClientAlert[]> {
    const alerts: ClientAlert[] = [];
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);

    const subscriptions = await this.subscriptionRepository.find({
      where: {
        tenantId: In(tenantIds),
        status: In([
          SubscriptionStatus.PAST_DUE,
          SubscriptionStatus.SUSPENDED,
          SubscriptionStatus.UNPAID,
        ]),
      },
    });
    for (const subscription of subscriptions) {
      alerts.push({
        id: `sub-${subscription.id}`,
        severity: subscription.status === SubscriptionStatus.SUSPENDED ? 'critical' : 'high',
        category: 'billing',
        message: `Subscription ${subscription.status} for tenant ${subscription.tenantId}`,
        detectedAt: subscription.updatedAt.toISOString(),
        sourceId: subscription.id,
      });
    }

    const failedUsage = await this.usageRecordRepository.find({
      where: {
        tenantId: In(tenantIds),
        status: 'failed',
        createdAt: MoreThanOrEqual(startDate),
      },
      order: { createdAt: 'DESC' },
      take: 25,
    });
    for (const row of failedUsage) {
      alerts.push({
        id: `usage-${row.id}`,
        severity: 'medium',
        category: 'usage-ingest',
        message: row.error || `Usage ingest failure for metric ${row.metric}`,
        detectedAt: row.createdAt.toISOString(),
        sourceId: row.id,
      });
    }

    const urgentTickets = await this.ticketRepository.find({
      where: {
        tenantId: In(tenantIds),
        status: In(['open', 'in_progress']),
        priority: TicketPriority.URGENT,
      },
      order: { createdAt: 'DESC' },
      take: 25,
    });
    for (const ticket of urgentTickets) {
      alerts.push({
        id: `ticket-${ticket.id}`,
        severity: 'high',
        category: 'support',
        message: `Urgent ticket: ${ticket.subject}`,
        detectedAt: ticket.createdAt.toISOString(),
        sourceId: ticket.id,
      });
    }

    return alerts.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  }

  private async calculatePaymentHealth(tenantIds: string[]): Promise<number> {
    const invoices = await this.invoiceRepository.find({
      where: { tenantId: In(tenantIds) },
      select: ['status'],
    });

    if (invoices.length === 0) {
      return 15;
    }

    const paid = invoices.filter((invoice) => invoice.status === InvoiceStatusEnum.PAID).length;
    const open = invoices.filter((invoice) => invoice.status === InvoiceStatusEnum.OPEN).length;
    const ratio = paid / invoices.length;

    return Math.max(0, Math.min(25, Math.round(ratio * 25) - open));
  }

  private async calculateUsageHealth(tenantIds: string[]): Promise<number> {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 30);

    const usage = await this.usageRecordRepository.find({
      where: {
        tenantId: In(tenantIds),
        createdAt: MoreThanOrEqual(startDate),
      },
      select: ['id', 'status'],
    });

    if (usage.length === 0) {
      return 8;
    }

    const failed = usage.filter((record) => record.status === 'failed').length;
    const successRatio = 1 - failed / usage.length;

    return Math.max(0, Math.min(25, Math.round(successRatio * 25)));
  }

  private async calculateSupportHealth(tenantIds: string[]): Promise<number> {
    const total = await this.ticketRepository.count({ where: { tenantId: In(tenantIds) } });
    const open = await this.ticketRepository.count({
      where: { tenantId: In(tenantIds), status: In(['open', 'in_progress']) },
    });

    if (total === 0) {
      return 25;
    }

    const openRatio = open / total;
    return Math.max(0, Math.min(25, Math.round((1 - openRatio) * 25)));
  }

  private resolveHealthGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) {
      return 'A';
    }
    if (score >= 75) {
      return 'B';
    }
    if (score >= 60) {
      return 'C';
    }
    if (score >= 40) {
      return 'D';
    }
    return 'F';
  }
}
