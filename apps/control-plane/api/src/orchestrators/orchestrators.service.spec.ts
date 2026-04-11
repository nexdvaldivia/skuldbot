import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrchestratorsService } from './orchestrators.service';

type RepoMock = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    create: jest.fn(() => ({})),
    save: jest.fn(async (payload) => payload),
  };
}

describe('OrchestratorsService evidence boundary', () => {
  it('rejects registration metadata with evidence-like fields', async () => {
    const repository = createRepoMock();
    repository.findOne.mockResolvedValue(null);

    const configService = {
      get: jest.fn((_: string, defaultValue: unknown) => defaultValue),
    } as unknown as ConfigService;

    const service = new OrchestratorsService(repository as any, configService);

    await expect(
      service.register(
        {
          orchestratorId: 'orch-1',
          tenantId: 'tenant-1',
          metadata: {
            evidencePackUri: 's3://tenant-1/evidence/run.zip',
          },
        },
        '127.0.0.1',
        'trace-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects heartbeat report with evidence-like fields', async () => {
    const repository = createRepoMock();
    repository.findOne.mockResolvedValue({
      orchestratorId: 'orch-1',
      tenantId: 'tenant-1',
      registeredAt: new Date(),
      metadata: {},
      lastMetrics: {},
      lastHealthReport: null,
    });

    const configService = {
      get: jest.fn((_: string, defaultValue: unknown) => defaultValue),
    } as unknown as ConfigService;

    const service = new OrchestratorsService(repository as any, configService);

    await expect(
      service.heartbeat(
        {
          orchestratorId: 'orch-1',
          healthReport: {
            rawLogBlob: '...',
          },
        },
        '127.0.0.1',
        'trace-2',
        'tenant-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });
});
