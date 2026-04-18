import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ClientAddressesService } from './client-addresses.service';
import { ClientAddress } from './entities/client-address.entity';
import { Client } from './entities/client.entity';

type AddressRepoMock = {
  create: jest.Mock;
  save: jest.Mock;
  delete: jest.Mock;
  findOne: jest.Mock;
  createQueryBuilder: jest.Mock;
};

type ClientRepoMock = {
  exist: jest.Mock;
};

function createUser(overrides: Partial<User>): User {
  return {
    id: 'user-1',
    clientId: null,
    isSkuld: () => true,
    ...overrides,
  } as unknown as User;
}

function createUpdateQueryBuilder() {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

describe('ClientAddressesService', () => {
  let service: ClientAddressesService;
  let addressRepository: AddressRepoMock;
  let clientRepository: ClientRepoMock;

  beforeEach(() => {
    addressRepository = {
      create: jest.fn((payload: Record<string, unknown>) => payload),
      save: jest.fn(async (payload: Record<string, unknown>) => payload),
      delete: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    clientRepository = {
      exist: jest.fn(),
    };

    service = new ClientAddressesService(
      addressRepository as unknown as Repository<ClientAddress>,
      clientRepository as unknown as Repository<Client>,
    );
  });

  it('creates an address and preserves normalized fields', async () => {
    addressRepository.createQueryBuilder.mockReturnValue(createUpdateQueryBuilder());
    clientRepository.exist.mockResolvedValue(true);
    const now = new Date();

    addressRepository.save.mockResolvedValue({
      id: 'addr-1',
      clientId: 'client-1',
      addressType: 'billing',
      label: 'HQ',
      addressLine1: 'Main Street 1',
      addressLine2: null,
      city: 'Miami',
      stateProvince: null,
      postalCode: null,
      country: 'US',
      isPrimary: false,
      isActive: true,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.createClientAddress(
      'client-1',
      {
        addressType: 'billing',
        label: 'HQ',
        addressLine1: ' Main Street 1 ',
        city: ' Miami ',
        country: ' US ',
      },
      createUser({ clientId: 'client-1', isSkuld: () => false }),
    );

    expect(result.addressLine1).toBe('Main Street 1');
    expect(result.city).toBe('Miami');
    expect(result.country).toBe('US');
  });

  it('sets address as primary and clears previous primary for same type', async () => {
    const updateQb = createUpdateQueryBuilder();
    addressRepository.createQueryBuilder.mockReturnValue(updateQb);
    clientRepository.exist.mockResolvedValue(true);
    addressRepository.findOne.mockResolvedValue({
      id: 'addr-1',
      clientId: 'client-1',
      addressType: 'billing',
      label: null,
      addressLine1: 'Main Street 1',
      addressLine2: null,
      city: 'Miami',
      stateProvince: null,
      postalCode: null,
      country: 'US',
      isPrimary: false,
      isActive: true,
      notes: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    addressRepository.save.mockImplementation(async (payload) => payload);

    const result = await service.setClientAddressPrimary(
      'client-1',
      'addr-1',
      createUser({ clientId: 'client-1', isSkuld: () => false }),
    );

    expect(updateQb.execute).toHaveBeenCalledTimes(1);
    expect(result.isPrimary).toBe(true);
  });

  it('blocks cross-client access for non-skuld users', async () => {
    clientRepository.exist.mockResolvedValue(true);

    await expect(
      service.getClientAddress(
        'client-1',
        'addr-1',
        createUser({ clientId: 'client-2', isSkuld: () => false }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
