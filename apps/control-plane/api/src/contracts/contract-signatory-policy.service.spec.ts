import { BadRequestException, ConflictException } from '@nestjs/common';
import { ContractSignatoryPolicyService } from './contract-signatory-policy.service';

describe('ContractSignatoryPolicyService', () => {
  const makePolicyRepo = () =>
    ({
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value) => ({
        id: value.id ?? 'policy-1',
        createdAt: value.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...value,
      })),
      create: jest.fn((value) => value),
      find: jest.fn(),
    }) as any;

  const makeSignatoryRepo = () =>
    ({
      findOne: jest.fn(),
    }) as any;

  const makeContractTypeRepo = () =>
    ({
      findOne: jest.fn(),
    }) as any;

  it('rejects overlapping active windows for same contract type and priority', async () => {
    const policyRepo = makePolicyRepo();
    const signatoryRepo = makeSignatoryRepo();
    const contractTypeRepo = makeContractTypeRepo();

    contractTypeRepo.findOne.mockResolvedValue({ code: 'msa' });
    signatoryRepo.findOne.mockResolvedValue({
      id: 'sig-1',
      isActive: true,
      deletedAt: null,
    });

    const overlapQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'policy-existing',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validTo: new Date('2026-12-31T00:00:00.000Z'),
        },
      ]),
    };
    policyRepo.createQueryBuilder.mockReturnValue(overlapQuery);

    const service = new ContractSignatoryPolicyService(policyRepo, signatoryRepo, contractTypeRepo);

    await expect(
      service.createPolicy(
        {
          contractType: 'msa',
          signatoryId: 'sig-1',
          priority: 100,
          isActive: true,
          validFrom: '2026-06-01T00:00:00.000Z',
          validTo: '2026-07-01T00:00:00.000Z',
        },
        { id: 'user-1' } as any,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists policies with filters and returns total', async () => {
    const policyRepo = makePolicyRepo();
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    policyRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    const service = new ContractSignatoryPolicyService(
      policyRepo,
      makeSignatoryRepo(),
      makeContractTypeRepo(),
    );
    const response = await service.listPolicies('msa', true);
    expect(response.total).toBe(0);
    expect(queryBuilder.andWhere).toHaveBeenCalled();
  });

  it('blocks activation when target signatory is inactive', async () => {
    const policyRepo = makePolicyRepo();
    policyRepo.findOne.mockResolvedValue({
      id: 'policy-1',
      contractType: 'msa',
      signatoryId: 'sig-1',
      priority: 100,
      isActive: false,
      validFrom: null,
      validTo: null,
    });
    policyRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    const signatoryRepo = makeSignatoryRepo();
    signatoryRepo.findOne.mockResolvedValue({
      id: 'sig-1',
      isActive: false,
      deletedAt: null,
    });

    const service = new ContractSignatoryPolicyService(
      policyRepo,
      signatoryRepo,
      makeContractTypeRepo(),
    );

    await expect(
      service.activatePolicy('policy-1', { id: 'user-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns policy-based preview when matching active policy exists', async () => {
    const policyRepo = makePolicyRepo();
    policyRepo.createQueryBuilder
      .mockReturnValueOnce({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'policy-1',
            contractType: 'msa',
            signatoryId: 'sig-1',
            priority: 10,
            isActive: true,
            validFrom: null,
            validTo: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            signatory: {
              id: 'sig-1',
              fullName: 'Jane Legal',
              title: 'General Counsel',
              email: 'jane@example.com',
              isActive: true,
              signatureStorageKey: 'key',
              signatureSha256: 'abc',
            },
          },
        ]),
      })
      .mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

    const service = new ContractSignatoryPolicyService(
      policyRepo,
      makeSignatoryRepo(),
      makeContractTypeRepo(),
    );
    const preview = await service.resolvePreview({
      contractType: 'msa',
      requireReady: true,
    });

    expect(preview.resolutionSource).toBe('policy');
    expect(preview.ready).toBe(true);
    expect(preview.signatoryId).toBe('sig-1');
  });
});
