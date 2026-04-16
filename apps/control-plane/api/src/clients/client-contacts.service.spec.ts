import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientContactsService } from './client-contacts.service';

function createRepoMock() {
  return {
    findOne: jest.fn(),
    find: jest.fn(async () => []),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    exist: jest.fn(async () => true),
    remove: jest.fn(async () => undefined),
  };
}

describe('ClientContactsService', () => {
  const currentUser = { id: 'user-1', clientId: 'client-1', isSkuld: () => true } as any;

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
