import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ContractLookupsService } from './contract-lookups.service';

const makeUser = () => ({ id: 'user-1' }) as any;

function createRepositoryMock(initialRecords: any[] = []) {
  const records = [...initialRecords];

  return {
    find: jest.fn(async ({ where }: any) => {
      if (where?.isActive === true) {
        return records.filter((record) => record.isActive === true);
      }
      return records;
    }),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      if (records.some((record) => record.code === value.code && record.id !== value.id)) {
        const error = new QueryFailedError(
          'INSERT',
          [],
          new Error('duplicate'),
        ) as QueryFailedError & {
          code?: string;
        };
        error.code = '23505';
        throw error;
      }

      if (!value.id) {
        const created = {
          ...value,
          id: `id-${records.length + 1}`,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        };
        records.push(created);
        return created;
      }

      const index = records.findIndex((record) => record.id === value.id);
      if (index >= 0) {
        records[index] = {
          ...records[index],
          ...value,
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        };
        return records[index];
      }

      records.push(value);
      return value;
    }),
    findOne: jest.fn(
      async ({ where }: any) => records.find((record) => record.id === where.id) ?? null,
    ),
  };
}

describe('ContractLookupsService', () => {
  it('returns grouped lookups from dedicated contract lookup repositories', async () => {
    const typeRepo = createRepositoryMock([
      {
        id: 'type-1',
        code: 'msa',
        label: 'MSA',
        description: null,
        sortOrder: 10,
        isActive: true,
        metadata: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const jurisdictionRepo = createRepositoryMock([
      {
        id: 'jur-1',
        code: 'us',
        label: 'United States',
        description: null,
        sortOrder: 5,
        isActive: true,
        metadata: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const frameworkRepo = createRepositoryMock([
      {
        id: 'fw-1',
        code: 'hipaa',
        label: 'HIPAA',
        description: null,
        sortOrder: 1,
        isActive: true,
        metadata: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const service = new ContractLookupsService(
      typeRepo as any,
      jurisdictionRepo as any,
      frameworkRepo as any,
    );

    const result = await service.getContractLookups();

    expect(result.contractTypes).toHaveLength(1);
    expect(result.jurisdictions).toHaveLength(1);
    expect(result.complianceFrameworks).toHaveLength(1);
    expect(typeRepo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { sortOrder: 'ASC', label: 'ASC' },
    });
  });

  it('throws conflict when creating contract type with duplicated code', async () => {
    const typeRepo = createRepositoryMock([
      {
        id: 'type-1',
        code: 'msa',
        label: 'MSA',
        description: null,
        sortOrder: 0,
        isActive: true,
        metadata: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const service = new ContractLookupsService(
      typeRepo as any,
      createRepositoryMock() as any,
      createRepositoryMock() as any,
    );

    await expect(
      service.createContractType(
        {
          code: 'MSA',
          label: 'Master Service Agreement',
        },
        makeUser(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found when updating missing jurisdiction lookup', async () => {
    const service = new ContractLookupsService(
      createRepositoryMock() as any,
      createRepositoryMock() as any,
      createRepositoryMock() as any,
    );

    await expect(
      service.updateJurisdiction(
        'missing-id',
        {
          label: 'European Union',
        },
        makeUser(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters inactive compliance frameworks unless includeInactive is true', async () => {
    const service = new ContractLookupsService(
      createRepositoryMock() as any,
      createRepositoryMock() as any,
      createRepositoryMock([
        {
          id: 'fw-1',
          code: 'soc2',
          label: 'SOC 2',
          description: null,
          sortOrder: 1,
          isActive: true,
          metadata: {},
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'fw-2',
          code: 'legacy-framework',
          label: 'Legacy Framework',
          description: null,
          sortOrder: 2,
          isActive: false,
          metadata: {},
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]) as any,
    );

    const activeOnly = await service.listComplianceFrameworks(false);
    const allRecords = await service.listComplianceFrameworks(true);

    expect(activeOnly).toHaveLength(1);
    expect(allRecords).toHaveLength(2);
  });
});
