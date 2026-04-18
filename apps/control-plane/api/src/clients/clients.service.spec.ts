import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PaymentProvider } from '../common/interfaces/integration.interface';
import {
  LOOKUP_DOMAIN_CLIENT_PLAN,
  LOOKUP_DOMAIN_CLIENT_STATUS,
} from '../lookups/lookups.constants';
import { LookupsService } from '../lookups/lookups.service';
import { TenantStatus } from '../tenants/entities/tenant.entity';
import { Client } from './entities/client.entity';
import { ClientsService } from './clients.service';

type RepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  remove: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (payload) => payload),
    create: jest.fn((payload) => payload),
    remove: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('ClientsService', () => {
  let service: ClientsService;
  let clientRepository: RepoMock;
  let tenantRepository: RepoMock;
  let userRepository: RepoMock;
  let subscriptionRepository: RepoMock;
  let invoiceRepository: RepoMock;
  let usageRecordRepository: RepoMock;
  let ticketRepository: RepoMock;
  let contactRepository: RepoMock;
  let apiKeyAuditRepository: RepoMock;
  let paymentProvider: PaymentProvider;
  let lookupsService: jest.Mocked<Pick<LookupsService, 'getDefaultCode' | 'assertActiveCode'>>;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    clientRepository = createRepoMock();
    tenantRepository = createRepoMock();
    userRepository = createRepoMock();
    subscriptionRepository = createRepoMock();
    invoiceRepository = createRepoMock();
    usageRecordRepository = createRepoMock();
    ticketRepository = createRepoMock();
    contactRepository = createRepoMock();
    apiKeyAuditRepository = createRepoMock();
    paymentProvider = {
      name: 'stripe-test',
      type: 'payment' as never,
      isConfigured: jest.fn().mockReturnValue(false),
      healthCheck: jest.fn(),
      createCustomer: jest.fn(),
      updateCustomer: jest.fn(),
      deleteCustomer: jest.fn(),
      getCustomer: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
      getSubscription: jest.fn(),
      getUpcomingInvoice: jest.fn(),
      createPaymentIntent: jest.fn(),
      recordUsage: jest.fn(),
      getUsageSummary: jest.fn(),
      getInvoice: jest.fn(),
      listInvoices: jest.fn(),
      handleWebhook: jest.fn(),
    } as unknown as PaymentProvider;

    lookupsService = {
      getDefaultCode: jest.fn(),
      assertActiveCode: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'CLIENT_API_KEY_ENCRYPTION_KEY') {
          return 'test-secure-client-key';
        }
        if (key === 'NODE_ENV') {
          return 'test';
        }
        return undefined;
      }),
    };

    service = new ClientsService(
      clientRepository as unknown as Repository<Client>,
      tenantRepository as unknown as any,
      userRepository as unknown as any,
      subscriptionRepository as unknown as any,
      invoiceRepository as unknown as any,
      usageRecordRepository as unknown as any,
      ticketRepository as unknown as any,
      contactRepository as unknown as any,
      apiKeyAuditRepository as unknown as any,
      paymentProvider,
      lookupsService as unknown as LookupsService,
      configService as any,
    );
  });

  it('creates a client with generated api key and normalized plan/status', async () => {
    clientRepository.findOne.mockResolvedValue(null);
    lookupsService.getDefaultCode.mockResolvedValueOnce('pending');
    lookupsService.assertActiveCode.mockResolvedValue(undefined);
    clientRepository.save.mockImplementation(async (payload) => ({
      id: 'client-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenants: [],
      ...payload,
    }));

    const result = await service.create({
      name: 'Acme',
      slug: 'acme',
      billingEmail: 'billing@acme.com',
      plan: 'PRO',
    });

    expect(result.apiKeyPrefix).toMatch(/^skd_.+\.\.\.$/);
    expect(lookupsService.assertActiveCode).toHaveBeenCalledWith(
      LOOKUP_DOMAIN_CLIENT_PLAN,
      'pro',
      'Invalid client plan "PRO"',
    );
    expect(lookupsService.getDefaultCode).toHaveBeenCalledWith(
      LOOKUP_DOMAIN_CLIENT_STATUS,
      'pending',
    );
  });

  it('rejects duplicate name/slug on create', async () => {
    clientRepository.findOne.mockResolvedValue({ id: 'existing-client' });

    await expect(
      service.create({
        name: 'Acme',
        slug: 'acme',
        billingEmail: 'billing@acme.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivates only suspended clients', async () => {
    clientRepository.findOne
      .mockResolvedValueOnce({
        id: 'client-1',
        status: 'suspended',
        tenants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'client-2',
        status: 'active',
        tenants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    lookupsService.assertActiveCode.mockResolvedValue(undefined);
    clientRepository.save.mockImplementation(async (payload) => payload);

    const reactivated = await service.reactivate('client-1');
    expect(reactivated.status).toBe('active');

    await expect(service.reactivate('client-2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('regenerates client api key and returns both prefixes', async () => {
    clientRepository.findOne.mockResolvedValue({
      id: 'client-1',
      apiKey: 'skd_old_key_value',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    clientRepository.save.mockImplementation(async (payload) => payload);
    apiKeyAuditRepository.create.mockImplementation((payload) => payload);
    apiKeyAuditRepository.save.mockImplementation(async (payload) => payload);

    const response = await service.regenerateApiKey(
      'client-1',
      { email: 'admin@skuld.test' } as any,
      '127.0.0.1',
    );

    expect(response.status).toBe('success');
    expect(response.oldKeyPrefix).toBe('skd_old_...');
    expect(response.newApiKey).toMatch(/^skd_/);
    expect(response.newApiKey).not.toEqual('skd_old_key_value');
    expect(apiKeyAuditRepository.save).toHaveBeenCalled();
  });

  it('computes gates from client/tenant/billing status', async () => {
    clientRepository.findOne.mockResolvedValue({
      id: 'client-1',
      name: 'Acme',
      slug: 'acme',
      billingEmail: 'billing@acme.com',
      status: 'active',
      stripeCustomerId: 'cus_123',
      tenants: [{ id: 'tenant-1', status: TenantStatus.ACTIVE }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const gates = await service.getGates('client-1');
    expect(gates.overallPassed).toBe(true);
    expect(gates.gates).toHaveLength(4);
  });

  it('throws not found when overview client does not exist', async () => {
    clientRepository.findOne.mockResolvedValue(null);
    await expect(service.getOverview('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
