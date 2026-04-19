import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientAddressesService } from '../clients/client-addresses.service';
import { ClientContactsService } from '../clients/client-contacts.service';
import { ClientsService } from '../clients/clients.service';
import { Client } from '../clients/entities/client.entity';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import { PaymentProvider } from '../common/interfaces/integration.interface';
import { PaymentConfig } from '../billing/entities/payment-config.entity';
import { TenantSubscription } from '../billing/entities/subscription.entity';
import { PaymentMethodService } from '../billing/payment-method.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { MeService } from './me.service';

type RepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (payload) => payload),
    create: jest.fn((payload) => payload),
  };
}

describe('MeService', () => {
  let service: MeService;
  let clientsService: jest.Mocked<ClientsService>;
  let clientAddressesService: jest.Mocked<ClientAddressesService>;
  let clientContactsService: jest.Mocked<ClientContactsService>;
  let paymentMethodService: jest.Mocked<PaymentMethodService>;
  let usersService: jest.Mocked<UsersService>;
  let clientRepository: RepoMock;
  let userRepository: RepoMock;
  let tenantRepository: RepoMock;
  let subscriptionRepository: RepoMock;
  let paymentConfigRepository: RepoMock;
  let securityAuditRepository: RepoMock;
  let paymentProvider: jest.Mocked<PaymentProvider>;

  beforeEach(() => {
    clientsService = {
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<ClientsService>;

    clientAddressesService = {
      listClientAddresses: jest.fn(),
      createClientAddress: jest.fn(),
      updateClientAddress: jest.fn(),
      deleteClientAddress: jest.fn(),
      setClientAddressPrimary: jest.fn(),
    } as unknown as jest.Mocked<ClientAddressesService>;

    clientContactsService = {
      listClientContacts: jest.fn(),
      createClientContact: jest.fn(),
      bulkCreateClientContacts: jest.fn(),
      updateClientContact: jest.fn(),
      deleteClientContact: jest.fn(),
      setClientContactPrimary: jest.fn(),
    } as unknown as jest.Mocked<ClientContactsService>;

    paymentMethodService = {
      getAllowedPaymentMethods: jest.fn().mockResolvedValue({
        achAllowed: true,
        cardAllowed: true,
        preferredMethod: 'ach',
      }),
    } as unknown as jest.Mocked<PaymentMethodService>;

    usersService = {
      findOne: jest.fn(),
      uploadAvatar: jest.fn(),
      deleteAvatar: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    paymentProvider = {
      name: 'stripe',
      type: 'payment' as never,
      isConfigured: jest.fn().mockReturnValue(true),
      healthCheck: jest.fn(),
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_123' }),
      updateCustomer: jest.fn(),
      deleteCustomer: jest.fn(),
      getCustomer: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
      getSubscription: jest.fn(),
      createPaymentIntent: jest.fn(),
      recordUsage: jest.fn(),
      getUsageSummary: jest.fn(),
      getInvoice: jest.fn(),
      listInvoices: jest.fn(),
      getUpcomingInvoice: jest.fn(),
      handleWebhook: jest.fn(),
      createACHSetupIntent: jest.fn().mockResolvedValue({
        clientSecret: 'seti_secret',
        setupIntentId: 'seti_123',
      }),
      getCustomerBankAccount: jest.fn().mockResolvedValue({
        id: 'pm_123',
        bankName: 'Chase',
        last4: '4242',
        accountType: 'checking',
        status: 'verified',
      }),
      setDefaultPaymentMethod: jest.fn(),
      detachPaymentMethod: jest.fn(),
    } as unknown as jest.Mocked<PaymentProvider>;

    clientRepository = createRepoMock();
    userRepository = createRepoMock();
    tenantRepository = createRepoMock();
    subscriptionRepository = createRepoMock();
    paymentConfigRepository = createRepoMock();
    securityAuditRepository = createRepoMock();

    service = new MeService(
      clientsService,
      clientAddressesService,
      clientContactsService,
      paymentMethodService,
      usersService,
      clientRepository as unknown as Repository<Client>,
      userRepository as unknown as Repository<User>,
      tenantRepository as unknown as Repository<Tenant>,
      subscriptionRepository as unknown as Repository<TenantSubscription>,
      paymentConfigRepository as unknown as Repository<PaymentConfig>,
      securityAuditRepository as unknown as Repository<SecurityAuditEvent>,
      paymentProvider,
    );
  });

  it('rejects users without client context', async () => {
    await expect(service.getProfile({ clientId: null } as User)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns aggregated subscription payload for client tenants', async () => {
    tenantRepository.find.mockResolvedValue([{ id: 'tenant-1' }]);
    subscriptionRepository.find.mockResolvedValue([
      {
        id: 'sub-1',
        tenantId: 'tenant-1',
        tenantName: 'T1',
        status: 'active',
        paymentMethodType: 'ach_debit',
        currency: 'USD',
        botsCanRun: true,
      },
    ]);

    const payload = await service.getSubscription({ clientId: 'client-1' } as User);

    expect(payload.total).toBe(1);
    expect((payload.subscriptions as Array<Record<string, unknown>>)[0].tenantId).toBe('tenant-1');
  });

  it('creates setup intent for payment method setup', async () => {
    clientRepository.findOne.mockResolvedValue({
      id: 'client-1',
      name: 'Client',
      billingEmail: 'billing@test.com',
      stripeCustomerId: 'cus_abc',
      plan: 'pro',
      settings: {},
      metadata: {},
    });

    const payload = await service.getPaymentMethodSetup({
      id: 'user-1',
      clientId: 'client-1',
    } as User);
    expect(payload.customerId).toBe('cus_abc');
    expect(paymentProvider.createACHSetupIntent).toHaveBeenCalled();
  });
});
