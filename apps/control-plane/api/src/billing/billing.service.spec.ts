import { ConfigService } from '@nestjs/config';
import { BillingService, UsageBatchDto } from './billing.service';

type RepoMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => payload),
  };
}

describe('BillingService - usage ingest idempotency', () => {
  it('deduplicates usage events by event_id and aggregates only accepted events', async () => {
    const usageRecordRepository = createRepoMock();
    const usageBatchRepository = createRepoMock();
    const usageIngestEventRepository = createRepoMock();
    const usageIngestDeadLetterRepository = createRepoMock();
    const revenueShareRepository = createRepoMock();
    const partnerPayoutRepository = createRepoMock();
    const partnerRepository = createRepoMock();
    const subscriptionRepository = createRepoMock();
    const paymentProvider = {
      isConfigured: jest.fn(() => false),
      recordUsage: jest.fn(),
    };
    const configService = {
      get: jest.fn((_: string, defaultValue: unknown) => defaultValue),
    } as unknown as ConfigService;

    usageBatchRepository.findOne.mockResolvedValue(null);
    usageIngestEventRepository.find.mockResolvedValue([{ eventId: 'evt-existing' }]);
    usageRecordRepository.findOne.mockResolvedValue(null);

    const service = new BillingService(
      configService,
      usageRecordRepository as any,
      usageBatchRepository as any,
      usageIngestEventRepository as any,
      usageIngestDeadLetterRepository as any,
      revenueShareRepository as any,
      partnerPayoutRepository as any,
      partnerRepository as any,
      subscriptionRepository as any,
      paymentProvider as any,
    );

    const batch: UsageBatchDto = {
      batchId: 'batch-1',
      tenantId: 'tenant-1',
      sentAt: new Date().toISOString(),
      events: [
        {
          id: 'evt-new',
          metric: 'bot_runs',
          quantity: 1,
          occurredAt: new Date().toISOString(),
        },
        {
          id: 'evt-new', // duplicate inside same batch
          metric: 'bot_runs',
          quantity: 1,
          occurredAt: new Date().toISOString(),
        },
        {
          id: 'evt-existing', // duplicate from previously ingested event
          metric: 'bot_runs',
          quantity: 1,
          occurredAt: new Date().toISOString(),
        },
      ],
    };

    const result = await service.ingestUsageBatch('orch-1', batch, {
      traceId: 'trace-123',
    });

    expect(result.duplicateBatch).toBe(false);
    expect(result.processedCount).toBe(1);
    expect(result.duplicateEventCount).toBe(2);
    expect(result.traceId).toBe('trace-123');
    expect(usageRecordRepository.save).toHaveBeenCalledTimes(1);
    expect(usageIngestDeadLetterRepository.save).not.toHaveBeenCalled();
  });

  it('retries transient failures and writes dead-letter after exhausting attempts', async () => {
    const usageRecordRepository = createRepoMock();
    const usageBatchRepository = createRepoMock();
    const usageIngestEventRepository = createRepoMock();
    const usageIngestDeadLetterRepository = createRepoMock();
    const revenueShareRepository = createRepoMock();
    const partnerPayoutRepository = createRepoMock();
    const partnerRepository = createRepoMock();
    const subscriptionRepository = createRepoMock();
    const paymentProvider = {
      isConfigured: jest.fn(() => false),
      recordUsage: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'USAGE_INGEST_MAX_RETRIES') {
          return 2;
        }
        if (key === 'USAGE_INGEST_BACKOFF_MS') {
          return 0;
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    usageBatchRepository.findOne.mockResolvedValue(null);
    usageIngestEventRepository.find.mockRejectedValue(new Error('database timeout'));
    usageIngestDeadLetterRepository.findOne.mockResolvedValue(null);

    const service = new BillingService(
      configService,
      usageRecordRepository as any,
      usageBatchRepository as any,
      usageIngestEventRepository as any,
      usageIngestDeadLetterRepository as any,
      revenueShareRepository as any,
      partnerPayoutRepository as any,
      partnerRepository as any,
      subscriptionRepository as any,
      paymentProvider as any,
    );

    const batch: UsageBatchDto = {
      batchId: 'batch-dlq-1',
      tenantId: 'tenant-1',
      sentAt: new Date().toISOString(),
      events: [
        {
          id: 'evt-1',
          metric: 'bot_runs',
          quantity: 1,
          occurredAt: new Date().toISOString(),
        },
      ],
    };

    await expect(
      service.ingestUsageBatch('orch-1', batch, { traceId: 'trace-dlq' }),
    ).rejects.toThrow('database timeout');

    expect(usageIngestEventRepository.find).toHaveBeenCalledTimes(2);
    expect(usageIngestDeadLetterRepository.save).toHaveBeenCalledTimes(1);
    expect(usageBatchRepository.save).toHaveBeenCalled();
  });

  it('rejects evidence-like metadata and does not persist dead-letter payload', async () => {
    const usageRecordRepository = createRepoMock();
    const usageBatchRepository = createRepoMock();
    const usageIngestEventRepository = createRepoMock();
    const usageIngestDeadLetterRepository = createRepoMock();
    const revenueShareRepository = createRepoMock();
    const partnerPayoutRepository = createRepoMock();
    const partnerRepository = createRepoMock();
    const subscriptionRepository = createRepoMock();
    const paymentProvider = {
      isConfigured: jest.fn(() => false),
      recordUsage: jest.fn(),
    };
    const configService = {
      get: jest.fn((_: string, defaultValue: unknown) => defaultValue),
    } as unknown as ConfigService;

    usageBatchRepository.findOne.mockResolvedValue(null);
    usageIngestEventRepository.find.mockResolvedValue([]);

    const service = new BillingService(
      configService,
      usageRecordRepository as any,
      usageBatchRepository as any,
      usageIngestEventRepository as any,
      usageIngestDeadLetterRepository as any,
      revenueShareRepository as any,
      partnerPayoutRepository as any,
      partnerRepository as any,
      subscriptionRepository as any,
      paymentProvider as any,
    );

    const batch: UsageBatchDto = {
      batchId: 'batch-boundary-1',
      tenantId: 'tenant-1',
      sentAt: new Date().toISOString(),
      events: [
        {
          id: 'evt-1',
          metric: 'bot_runs',
          quantity: 1,
          occurredAt: new Date().toISOString(),
          metadata: {
            evidencePackUri: 's3://tenant-1/evidence/run.zip',
          },
        },
      ],
    };

    await expect(service.ingestUsageBatch('orch-1', batch)).rejects.toThrow('evidence-like field');

    expect(usageIngestDeadLetterRepository.save).not.toHaveBeenCalled();
    expect(usageRecordRepository.save).not.toHaveBeenCalled();
  });

  it('records metered usage in provider when subscription is active', async () => {
    const usageRecordRepository = createRepoMock();
    const usageBatchRepository = createRepoMock();
    const usageIngestEventRepository = createRepoMock();
    const usageIngestDeadLetterRepository = createRepoMock();
    const revenueShareRepository = createRepoMock();
    const partnerPayoutRepository = createRepoMock();
    const partnerRepository = createRepoMock();
    const subscriptionRepository = createRepoMock();
    const paymentProvider = {
      isConfigured: jest.fn(() => true),
      recordUsage: jest.fn(async () => ({
        id: 'meter-usage-1',
        subscriptionItemId: 'si_123',
        quantity: 4,
        timestamp: new Date(),
        action: 'increment',
      })),
    };
    const configService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'STRIPE_METER_BOT_RUNS') {
          return 'meter_bot_runs';
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    usageBatchRepository.findOne.mockResolvedValue(null);
    usageIngestEventRepository.find.mockResolvedValue([]);
    usageRecordRepository.findOne.mockResolvedValue(null);
    subscriptionRepository.findOne.mockResolvedValue({
      tenantId: 'tenant-1',
      stripeSubscriptionId: 'sub_123',
      stripeSubscriptionItemId: 'si_123',
      status: 'active',
    });

    const service = new BillingService(
      configService,
      usageRecordRepository as any,
      usageBatchRepository as any,
      usageIngestEventRepository as any,
      usageIngestDeadLetterRepository as any,
      revenueShareRepository as any,
      partnerPayoutRepository as any,
      partnerRepository as any,
      subscriptionRepository as any,
      paymentProvider as any,
    );

    await service.ingestUsageBatch('orch-1', {
      batchId: 'batch-metering-1',
      tenantId: 'tenant-1',
      sentAt: new Date().toISOString(),
      events: [
        {
          id: 'evt-meter-1',
          metric: 'bot_runs',
          quantity: 4,
          occurredAt: new Date().toISOString(),
        },
      ],
    });

    expect(paymentProvider.recordUsage).toHaveBeenCalledTimes(1);
    expect(usageRecordRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeUsageRecordId: 'meter-usage-1',
        stripeSubscriptionItemId: 'si_123',
      }),
    );
  });
});
