import { UserRole } from '../users/entities/user.entity';
import { ContractsService } from './contracts.service';
import { ContractSignerStatus } from './entities/contract-signer.entity';
import { ContractStatus } from './entities/contract.entity';

type RepoMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  delete: jest.Mock;
  exist: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => payload),
    delete: jest.fn(),
    exist: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function makeSkuldAdmin() {
  return {
    id: 'user-skuld',
    role: UserRole.SKULD_ADMIN,
    clientId: null,
    isSkuld: () => true,
  } as any;
}

function makeClientAdmin(clientId: string) {
  return {
    id: `user-${clientId}`,
    role: UserRole.CLIENT_ADMIN,
    clientId,
    isSkuld: () => false,
  } as any;
}

describe('ContractsService', () => {
  it('transitions draft -> pending_signature on submitForSignature', async () => {
    const contractRepository = createRepoMock();
    const signerRepository = createRepoMock();
    const eventRepository = createRepoMock();
    const clientRepository = createRepoMock();
    const tenantRepository = createRepoMock();

    const baseContract = {
      id: 'ctr-1',
      clientId: 'client-1',
      tenantId: null,
      title: 'Master Services Agreement',
      templateKey: 'msa.v1',
      version: 1,
      status: ContractStatus.DRAFT,
      variables: {},
      documentJson: {},
      renderedHtml: null,
      pdfPath: null,
      envelopeProvider: null,
      envelopeId: null,
      signedAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    contractRepository.findOne.mockResolvedValueOnce({ ...baseContract }).mockResolvedValueOnce({
      ...baseContract,
      status: ContractStatus.PENDING_SIGNATURE,
      envelopeProvider: 'docusign',
      envelopeId: 'env-1',
      signers: [
        {
          id: 'signer-1',
          contractId: 'ctr-1',
          email: 'a@acme.com',
          fullName: 'Alice',
          roleLabel: 'Signer',
          sortOrder: 0,
          status: ContractSignerStatus.SENT,
          sentAt: new Date(),
          viewedAt: null,
          signedAt: null,
          declinedAt: null,
        },
      ],
    });

    signerRepository.find.mockResolvedValue([
      {
        id: 'signer-1',
        contractId: 'ctr-1',
        status: ContractSignerStatus.PENDING,
        sentAt: null,
      },
    ]);

    const service = new ContractsService(
      contractRepository as any,
      signerRepository as any,
      eventRepository as any,
      clientRepository as any,
      tenantRepository as any,
    );

    const result = await service.submitForSignature(
      'ctr-1',
      { envelopeProvider: 'docusign', envelopeId: 'env-1' },
      makeSkuldAdmin(),
    );

    expect(result.status).toBe(ContractStatus.PENDING_SIGNATURE);
    expect(contractRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ctr-1',
        status: ContractStatus.PENDING_SIGNATURE,
        envelopeProvider: 'docusign',
      }),
    );
    expect(signerRepository.save).toHaveBeenCalledTimes(1);
    expect(eventRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects cancel when contract is already signed', async () => {
    const contractRepository = createRepoMock();
    const signerRepository = createRepoMock();
    const eventRepository = createRepoMock();
    const clientRepository = createRepoMock();
    const tenantRepository = createRepoMock();

    contractRepository.findOne.mockResolvedValue({
      id: 'ctr-signed',
      clientId: 'client-1',
      status: ContractStatus.SIGNED,
    });

    const service = new ContractsService(
      contractRepository as any,
      signerRepository as any,
      eventRepository as any,
      clientRepository as any,
      tenantRepository as any,
    );

    await expect(
      service.cancelContract(
        'ctr-signed',
        { reason: 'Attempt cancel after signed' },
        makeSkuldAdmin(),
      ),
    ).rejects.toThrow('cannot be cancelled');

    expect(contractRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
  });

  it('enforces client boundary: user from clientA cannot read contract of clientB', async () => {
    const contractRepository = createRepoMock();
    const signerRepository = createRepoMock();
    const eventRepository = createRepoMock();
    const clientRepository = createRepoMock();
    const tenantRepository = createRepoMock();

    contractRepository.findOne.mockResolvedValue({
      id: 'ctr-client-b',
      clientId: 'client-b',
      status: ContractStatus.DRAFT,
      signers: [],
    });

    const service = new ContractsService(
      contractRepository as any,
      signerRepository as any,
      eventRepository as any,
      clientRepository as any,
      tenantRepository as any,
    );

    await expect(
      service.getById('ctr-client-b', makeClientAdmin('client-a')),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLIENT_SCOPE_VIOLATION',
      }),
    });
  });

  it('auto-completes contract status to SIGNED when all signers sign', async () => {
    const contractRepository = createRepoMock();
    const signerRepository = createRepoMock();
    const eventRepository = createRepoMock();
    const clientRepository = createRepoMock();
    const tenantRepository = createRepoMock();

    const pendingContract = {
      id: 'ctr-2',
      clientId: 'client-1',
      status: ContractStatus.PENDING_SIGNATURE,
      signedAt: null,
      updatedByUserId: null,
    };

    contractRepository.findOne.mockResolvedValueOnce({ ...pendingContract }).mockResolvedValueOnce({
      ...pendingContract,
      status: ContractStatus.SIGNED,
      signedAt: new Date(),
      signers: [
        {
          id: 'signer-1',
          status: ContractSignerStatus.SIGNED,
          sortOrder: 0,
        },
        {
          id: 'signer-2',
          status: ContractSignerStatus.SIGNED,
          sortOrder: 1,
        },
      ],
    });

    signerRepository.findOne.mockResolvedValue({
      id: 'signer-1',
      contractId: 'ctr-2',
      status: ContractSignerStatus.SENT,
      signatureAudit: {},
      viewedAt: null,
      signedAt: null,
      declinedAt: null,
    });

    signerRepository.find.mockResolvedValue([
      {
        id: 'signer-1',
        contractId: 'ctr-2',
        status: ContractSignerStatus.SIGNED,
        signedAt: new Date(),
      },
      {
        id: 'signer-2',
        contractId: 'ctr-2',
        status: ContractSignerStatus.SIGNED,
        signedAt: new Date(),
      },
    ]);

    const service = new ContractsService(
      contractRepository as any,
      signerRepository as any,
      eventRepository as any,
      clientRepository as any,
      tenantRepository as any,
    );

    const result = await service.updateSignerStatus(
      'ctr-2',
      'signer-1',
      { status: ContractSignerStatus.SIGNED },
      makeSkuldAdmin(),
    );

    expect(result.status).toBe(ContractStatus.SIGNED);
    expect(contractRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ctr-2',
        status: ContractStatus.SIGNED,
        signedAt: expect.any(Date),
      }),
    );
  });

  it('updates draft contracts and replaces signers when requested', async () => {
    const contractRepository = createRepoMock();
    const signerRepository = createRepoMock();
    const eventRepository = createRepoMock();
    const clientRepository = createRepoMock();
    const tenantRepository = createRepoMock();

    const draftContract = {
      id: 'ctr-3',
      clientId: 'client-1',
      tenantId: null,
      title: 'Old title',
      templateKey: 'msa.v1',
      version: 1,
      status: ContractStatus.DRAFT,
      variables: { old: true },
      documentJson: { legacy: true },
      renderedHtml: null,
      pdfPath: null,
      envelopeProvider: null,
      envelopeId: null,
      signedAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    contractRepository.findOne.mockResolvedValueOnce({ ...draftContract }).mockResolvedValueOnce({
      ...draftContract,
      title: 'Updated contract',
      version: 2,
      variables: { total: 10 },
      documentJson: { doc: 'json' },
      signers: [
        {
          id: 'signer-new',
          email: 'signer@client.com',
          fullName: 'New Signer',
          roleLabel: 'Legal',
          sortOrder: 0,
          status: ContractSignerStatus.PENDING,
          sentAt: null,
          viewedAt: null,
          signedAt: null,
          declinedAt: null,
        },
      ],
    });

    const service = new ContractsService(
      contractRepository as any,
      signerRepository as any,
      eventRepository as any,
      clientRepository as any,
      tenantRepository as any,
    );

    const result = await service.updateContractDraft(
      'ctr-3',
      {
        title: 'Updated contract',
        variables: { total: 10 },
        documentJson: { doc: 'json' },
        signers: [
          {
            email: 'signer@client.com',
            fullName: 'New Signer',
            roleLabel: 'Legal',
          },
        ],
      },
      makeClientAdmin('client-1'),
    );

    expect(result.title).toBe('Updated contract');
    expect(contractRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ctr-3',
        title: 'Updated contract',
        version: 2,
      }),
    );
    expect(signerRepository.delete).toHaveBeenCalledWith({ contractId: 'ctr-3' });
    expect(signerRepository.save).toHaveBeenCalledTimes(1);
  });
});
