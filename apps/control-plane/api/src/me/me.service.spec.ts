import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientAddressesService } from '../clients/client-addresses.service';
import { ClientContactsService } from '../clients/client-contacts.service';
import { ClientsService } from '../clients/clients.service';
import { TenantSubscription } from '../billing/entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { MeService } from './me.service';

type RepoMock = {
  find: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    find: jest.fn(),
  };
}

describe('MeService', () => {
  let service: MeService;
  let clientsService: jest.Mocked<ClientsService>;
  let clientAddressesService: jest.Mocked<ClientAddressesService>;
  let clientContactsService: jest.Mocked<ClientContactsService>;
  let tenantRepository: RepoMock;
  let subscriptionRepository: RepoMock;

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

    tenantRepository = createRepoMock();
    subscriptionRepository = createRepoMock();

    service = new MeService(
      clientsService,
      clientAddressesService,
      clientContactsService,
      tenantRepository as unknown as Repository<Tenant>,
      subscriptionRepository as unknown as Repository<TenantSubscription>,
    );
  });

  it('rejects users without client context', async () => {
    await expect(service.getProfile({ clientId: null } as User)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns aggregated subscription payload for client tenants', async () => {
    tenantRepository.find.mockResolvedValue([{ id: 'tenant-1', name: 'T1', status: 'active' }]);
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
});
