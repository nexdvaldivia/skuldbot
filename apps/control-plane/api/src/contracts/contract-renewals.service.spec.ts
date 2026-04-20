import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractRenewalsService } from './contract-renewals.service';
import { ContractRenewalRequirementStatus } from './entities/contract-domain.enums';

describe('ContractRenewalsService', () => {
  const makeRepo = () =>
    ({
      findOne: jest.fn(),
      find: jest.fn(),
      findByIds: jest.fn(),
      exist: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn(),
    }) as any;

  const makeService = () => {
    const renewalRepo = makeRepo();
    const templateVersionRepo = makeRepo();
    const acceptanceRepo = makeRepo();
    const contractEventRepo = makeRepo();
    const clientRepo = makeRepo();
    const subscriptionRepo = makeRepo();

    const service = new ContractRenewalsService(
      renewalRepo,
      templateVersionRepo,
      acceptanceRepo,
      contractEventRepo,
      clientRepo,
      subscriptionRepo,
    );

    return {
      service,
      renewalRepo,
      templateVersionRepo,
      acceptanceRepo,
      contractEventRepo,
      clientRepo,
      subscriptionRepo,
    };
  };

  it('requires published template version for reacceptance', async () => {
    const { service, templateVersionRepo } = makeService();
    templateVersionRepo.findOne.mockResolvedValue({
      id: 'version-1',
      status: 'draft',
      supersedesVersionId: 'version-0',
    });

    await expect(
      service.requireReacceptance(
        {
          templateId: 'version-1',
        },
        { id: 'user-1' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates one requirement per client and returns counts', async () => {
    const { service, templateVersionRepo, acceptanceRepo, clientRepo, renewalRepo } = makeService();
    templateVersionRepo.findOne.mockResolvedValue({
      id: 'version-2',
      status: 'published',
      supersedesVersionId: 'version-1',
      template: { title: 'MSA' },
    });
    acceptanceRepo.find.mockResolvedValue([
      {
        id: 'acc-1',
        clientId: 'client-1',
        acceptedByEmail: 'legal@example.com',
        expirationDate: null,
      },
      {
        id: 'acc-2',
        clientId: 'client-1',
        acceptedByEmail: 'legal@example.com',
        expirationDate: null,
      },
    ]);
    acceptanceRepo.findOne.mockResolvedValue({
      id: 'acc-1',
      contractId: 'contract-1',
    });
    clientRepo.find.mockResolvedValue([{ id: 'client-1', name: 'Client One' }]);
    renewalRepo.exist.mockResolvedValue(false);
    renewalRepo.save.mockImplementation(async (value: unknown) =>
      (value as Array<Record<string, unknown>>).map((entry, index) => ({
        id: `req-${index + 1}`,
        ...entry,
      })),
    );

    const response = await service.requireReacceptance(
      {
        templateId: 'version-2',
      },
      { id: 'user-1' } as any,
    );

    expect(response.requirementsCreated).toBe(1);
    expect(response.notificationsSent).toBe(1);
    expect(response.clientsAffected).toHaveLength(1);
  });

  it('throws when accepting non-pending requirement', async () => {
    const { service, renewalRepo } = makeService();
    renewalRepo.findOne.mockResolvedValue({
      id: 'req-1',
      clientId: 'client-1',
      status: ContractRenewalRequirementStatus.ACCEPTED,
      oldAcceptance: { contractId: 'contract-1' },
    });

    await expect(
      service.acceptPendingContract(
        'client-1',
        'req-1',
        {
          signerName: 'Signer',
          signerEmail: 'signer@example.com',
          signerTitle: 'Counsel',
        },
        { clientId: 'client-1', isSkuld: () => false } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound for missing requirement during waive', async () => {
    const { service, renewalRepo } = makeService();
    renewalRepo.findOne.mockResolvedValue(null);

    await expect(
      service.waiveRequirement('missing', { reason: 'Approved exception' }, {
        id: 'user-1',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
