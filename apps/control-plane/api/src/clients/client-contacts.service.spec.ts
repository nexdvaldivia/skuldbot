import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientContactsService } from './client-contacts.service';

function createRepoMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    exist: jest.fn(async () => true),
    remove: jest.fn(async () => undefined),
  };
}

describe('ClientContactsService', () => {
  const currentUser = { id: 'user-1', clientId: 'client-1', isSkuld: () => true } as any;

  it('lists contacts ordered by primary first and full name ascending', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    const contacts = [
      {
        id: 'contact-1',
        clientId: 'client-1',
        fullName: 'Alice',
        email: 'alice@acme.com',
        phone: null,
        title: 'CFO',
        department: 'Finance',
        roleCodes: ['billing'],
        isPrimary: true,
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'contact-2',
        clientId: 'client-1',
        fullName: 'Bob',
        email: 'bob@acme.com',
        phone: null,
        title: 'CTO',
        department: 'Engineering',
        roleCodes: ['technical'],
        isPrimary: false,
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    contactRepository.find.mockResolvedValue(contacts);
    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    const result = await service.list('client-1', currentUser);

    expect(contactRepository.find).toHaveBeenCalledWith({
      where: { clientId: 'client-1' },
      order: {
        isPrimary: 'DESC',
        fullName: 'ASC',
      },
    });
    expect(result.map((contact) => contact.id)).toEqual(['contact-1', 'contact-2']);
  });

  it('returns a contact by id', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    const contact = {
      id: 'contact-1',
      clientId: 'client-1',
      fullName: 'Jane Doe',
      email: 'jane@acme.com',
      phone: '+15005550006',
      title: 'Legal',
      department: 'Legal',
      roleCodes: ['signer'],
      isPrimary: true,
      isActive: true,
      metadata: { source: 'import' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    contactRepository.findOne.mockResolvedValue(contact);
    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    const result = await service.getById('client-1', 'contact-1', currentUser);

    expect(contactRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: 'contact-1',
        clientId: 'client-1',
      },
    });
    expect(result).toMatchObject({
      id: 'contact-1',
      email: 'jane@acme.com',
      fullName: 'Jane Doe',
    });
  });

  it('creates a contact with all fields', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    contactRepository.findOne.mockResolvedValue(null);
    contactRepository.find.mockResolvedValue([]);
    contactRepository.save.mockImplementation(async (value) => ({
      id: 'contact-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...value,
    }));

    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    const result = await service.create(
      'client-1',
      {
        fullName: 'Jane Doe',
        email: 'JANE@ACME.COM',
        phone: '+15005550006',
        title: 'Legal Counsel',
        department: 'Legal',
        roleCodes: ['Signer', 'Billing'],
        isPrimary: true,
        isActive: true,
        metadata: { source: 'manual' },
      },
      currentUser,
    );

    expect(contactRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        fullName: 'Jane Doe',
        email: 'jane@acme.com',
        phone: '+15005550006',
        title: 'Legal Counsel',
        department: 'Legal',
        roleCodes: ['signer', 'billing'],
        isPrimary: true,
        isActive: true,
      }),
    );
    expect(result).toMatchObject({
      id: 'contact-1',
      email: 'jane@acme.com',
      fullName: 'Jane Doe',
      roleCodes: ['signer', 'billing'],
    });
  });

  it('updates a contact partially', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    const existing = {
      id: 'contact-1',
      clientId: 'client-1',
      email: 'jane@acme.com',
      fullName: 'Jane Doe',
      phone: '+15005550006',
      title: 'Counsel',
      department: 'Legal',
      roleCodes: ['signer'],
      isPrimary: false,
      isActive: true,
      metadata: { source: 'manual' },
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    contactRepository.findOne.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
    contactRepository.save.mockImplementation(async (value) => value);

    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    const result = await service.update(
      'client-1',
      'contact-1',
      {
        fullName: 'Jane A. Doe',
        title: 'General Counsel',
        metadata: { source: 'api' },
      },
      currentUser,
    );

    expect(result).toMatchObject({
      id: 'contact-1',
      fullName: 'Jane A. Doe',
      title: 'General Counsel',
      metadata: { source: 'api' },
    });
  });

  it('rejects update when email belongs to another contact', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    const existing = {
      id: 'contact-1',
      clientId: 'client-1',
      email: 'jane@acme.com',
      fullName: 'Jane Doe',
      phone: null,
      title: null,
      department: null,
      roleCodes: [],
      isPrimary: false,
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const duplicate = {
      id: 'contact-2',
      clientId: 'client-1',
      email: 'used@acme.com',
    };

    contactRepository.findOne.mockResolvedValueOnce(existing).mockResolvedValueOnce(duplicate);
    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    await expect(
      service.update(
        'client-1',
        'contact-1',
        {
          email: 'used@acme.com',
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects duplicate email on create', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    contactRepository.findOne.mockResolvedValueOnce({ id: 'existing-1' });

    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    await expect(
      service.create(
        'client-1',
        {
          fullName: 'Jane Doe',
          email: 'jane@acme.com',
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears previous primary when promoting a new primary contact', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    const currentPrimary = {
      id: 'contact-old-primary',
      clientId: 'client-1',
      isPrimary: true,
      updatedByUserId: null,
    };

    const target = {
      id: 'contact-target',
      clientId: 'client-1',
      email: 'new@acme.com',
      fullName: 'New Primary',
      phone: null,
      title: null,
      department: null,
      roleCodes: [],
      isPrimary: false,
      isActive: true,
      metadata: {},
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    contactRepository.findOne.mockResolvedValue(target);
    (contactRepository.find as jest.Mock).mockResolvedValue([currentPrimary as any]);

    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    const result = await service.update(
      'client-1',
      'contact-target',
      {
        isPrimary: true,
      },
      currentUser,
    );

    expect(result.isPrimary).toBe(true);
    expect(contactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'contact-old-primary',
        isPrimary: false,
      }),
    );
  });

  it('throws not found when deleting missing contact', async () => {
    const clientRepository = createRepoMock();
    const contactRepository = createRepoMock();

    contactRepository.findOne.mockResolvedValue(null);

    const service = new ClientContactsService(clientRepository as any, contactRepository as any);

    await expect(service.remove('client-1', 'missing', currentUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
