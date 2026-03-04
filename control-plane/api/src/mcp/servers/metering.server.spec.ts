import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MeteringServer } from './metering.server';
import { BillingService } from '../../billing/billing.service';
import { SubscriptionService } from '../../billing/subscription.service';
import { MarketplaceService } from '../../marketplace/marketplace.service';
import { UsageRecord } from '../../billing/entities/usage-record.entity';
import {
  RunnerHeartbeatEntity,
  RunnerType,
  RunnerRuntimeStatus,
} from '../entities/runner-heartbeat.entity';

describe('MeteringServer', () => {
  let server: MeteringServer;
  let billingService: jest.Mocked<BillingService>;
  let usageRecordRepository: {
    find: jest.Mock;
    delete: jest.Mock;
  };
  let heartbeatRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const tenantId = 'a8d9198d-bfa5-4f0f-aa1b-1d62096c4fdb';
  const botId = '5d887476-25af-443f-b57a-10b45b7affd1';
  const runnerId = 'de2e25b6-da15-4512-84a5-22f68c6f83e1';

  beforeEach(async () => {
    usageRecordRepository = {
      find: jest.fn(),
      delete: jest.fn(),
    };

    heartbeatRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeteringServer,
        {
          provide: BillingService,
          useValue: {
            ingestUsageBatch: jest.fn(),
          },
        },
        {
          provide: SubscriptionService,
          useValue: {
            getSubscription: jest.fn(),
          },
        },
        {
          provide: MarketplaceService,
          useValue: {
            getBotById: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UsageRecord),
          useValue: usageRecordRepository,
        },
        {
          provide: getRepositoryToken(RunnerHeartbeatEntity),
          useValue: heartbeatRepository,
        },
      ],
    }).compile();

    server = module.get<MeteringServer>(MeteringServer);
    billingService = module.get(BillingService);
  });

  it('exposes expected metering tools', () => {
    const tools = server.getTools();
    expect(tools).toHaveLength(6);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'report_bot_execution',
        'get_current_usage',
        'get_active_runners',
      ]),
    );
  });

  it('records bot execution through billing ingest', async () => {
    billingService.ingestUsageBatch.mockResolvedValue({
      processedCount: 2,
      duplicateBatch: false,
      duplicateEventCount: 0,
    });
    usageRecordRepository.find.mockResolvedValue([
      {
        metric: 'claimsCompleted',
        quantity: 3,
        totalAmount: 9,
      },
    ]);

    const response = await server.executeTool({
      name: 'report_bot_execution',
      arguments: {
        tenantId,
        botId,
        executionId: 'exec-001',
        startTime: '2026-02-24T10:00:00.000Z',
        endTime: '2026-02-24T10:05:00.000Z',
        status: 'success',
        metrics: {
          claimsCompleted: 3,
          apiCalls: 10,
        },
      },
    });

    expect(response.success).toBe(true);
    expect(response.result.recorded).toBe(true);
    expect(billingService.ingestUsageBatch).toHaveBeenCalledTimes(1);
  });

  it('reports and reads active runners from repository', async () => {
    const savedHeartbeat = {
      tenantId,
      runnerId,
      type: RunnerType.UNATTENDED,
      status: RunnerRuntimeStatus.ACTIVE,
      heartbeatAt: new Date(),
    };

    heartbeatRepository.findOne.mockResolvedValue(null);
    heartbeatRepository.create.mockReturnValue(savedHeartbeat);
    heartbeatRepository.save.mockResolvedValue(savedHeartbeat);
    heartbeatRepository.find.mockResolvedValue([savedHeartbeat]);

    const report = await server.executeTool({
      name: 'report_runner_heartbeat',
      arguments: {
        tenantId,
        runnerId,
        type: 'unattended',
        status: 'active',
      },
    });

    expect(report.success).toBe(true);

    const active = await server.executeTool({
      name: 'get_active_runners',
      arguments: { tenantId },
    });

    expect(active.success).toBe(true);
    expect(active.result.totalActive).toBe(1);
    expect(active.result.unattended).toBe(1);
  });

  it('resets usage metrics by tenant and period', async () => {
    usageRecordRepository.delete.mockResolvedValue({ affected: 4 });

    const response = await server.executeTool({
      name: 'reset_usage_metrics',
      arguments: {
        tenantId,
        period: '2026-02',
      },
    });

    expect(response.success).toBe(true);
    expect(response.result.resetCount).toBe(4);
    expect(usageRecordRepository.delete).toHaveBeenCalledWith({
      tenantId,
      period: '2026-02',
    });
  });

  it('returns unknown tool for unsupported calls', async () => {
    const response = await server.executeTool({
      name: 'unsupported_tool',
      arguments: {},
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown tool');
  });
});
