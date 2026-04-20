import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ClientContactsService } from './client-contacts.service';
import { ClientContact } from './entities/client-contact.entity';
import { Client } from './entities/client.entity';

type ContactRepoMock = {
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

function createExistsQueryBuilder(exists: boolean) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(exists),
  };
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

describe('ClientContactsService', () => {
  let service: ClientContactsService;
  let contactRepository: ContactRepoMock;
  let clientRepository: ClientRepoMock;

  beforeEach(() => {
    contactRepository = {
      create: jest.fn((payload: Record<string, unknown>) => payload),
      save: jest.fn(async (payload: Record<string, unknown>) => payload),
      delete: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    clientRepository = {
      exist: jest.fn(),
    };

    service = new ClientContactsService(
      contactRepository as unknown as Repository<ClientContact>,
      clientRepository as unknown as Repository<Client>,
    );
  });

  it('creates a contact and normalizes email casing', async () => {
    const existsQb = createExistsQueryBuilder(false);
    contactRepository.createQueryBuilder.mockImplementation((alias?: string) =>
      alias ? existsQb : createUpdateQueryBuilder(),
    );
    clientRepository.exist.mockResolvedValue(true);

    const now = new Date();
    contactRepository.save.mockResolvedValue({
      id: 'contact-1',
      clientId: 'client-1',
      contactType: 'billing',
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      phone: null,
      mobile: null,
      jobTitle: null,
      department: null,
      linkedinUrl: null,
      isPrimary: false,
      isContractSigner: false,
      isInstaller: false,
      isActive: true,
      canReceiveMarketing: true,
      canReceiveUpdates: true,
      preferredLanguage: 'en',
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.createClientContact(
      'client-1',
      {
        contactType: 'billing',
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ANA@Example.Com',
      },
      createUser({ clientId: 'client-1', isSkuld: () => false }),
    );

    expect(result.email).toBe('ana@example.com');
    expect(result.fullName).toBe('Ana Lopez');
  });

  it('rejects duplicate contact email for the same client', async () => {
    const existsQb = createExistsQueryBuilder(true);
    contactRepository.createQueryBuilder.mockImplementation((alias?: string) =>
      alias ? existsQb : createUpdateQueryBuilder(),
    );
    clientRepository.exist.mockResolvedValue(true);

    await expect(
      service.createClientContact(
        'client-1',
        {
          contactType: 'billing',
          firstName: 'Ana',
          lastName: 'Lopez',
          email: 'ana@example.com',
        },
        createUser({ clientId: 'client-1', isSkuld: () => false }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sets contact as primary and clears previous primary for same type', async () => {
    const updateQb = createUpdateQueryBuilder();
    contactRepository.createQueryBuilder.mockImplementation((alias?: string) =>
      alias ? createExistsQueryBuilder(false) : updateQb,
    );
    clientRepository.exist.mockResolvedValue(true);
    contactRepository.findOne.mockResolvedValue({
      id: 'contact-1',
      clientId: 'client-1',
      contactType: 'billing',
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      isPrimary: false,
      isContractSigner: false,
      isInstaller: false,
      isActive: true,
      canReceiveMarketing: true,
      canReceiveUpdates: true,
      preferredLanguage: 'en',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    contactRepository.save.mockImplementation(async (payload) => payload);

    const result = await service.setClientContactPrimary(
      'client-1',
      'contact-1',
      createUser({ clientId: 'client-1', isSkuld: () => false }),
    );

    expect(updateQb.execute).toHaveBeenCalledTimes(1);
    expect(result.isPrimary).toBe(true);
  });

  it('blocks cross-client access for non-skuld users', async () => {
    clientRepository.exist.mockResolvedValue(true);

    await expect(
      service.getClientContact(
        'client-1',
        'contact-1',
        createUser({ clientId: 'client-2', isSkuld: () => false }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
