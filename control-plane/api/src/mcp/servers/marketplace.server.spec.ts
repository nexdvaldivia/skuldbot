import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceServer } from './marketplace.server';
import { MarketplaceService } from '../../marketplace/marketplace.service';
import {
  MarketplaceBotStatus,
  PricingModel,
  ExecutionMode,
  BotCategory,
} from '../../marketplace/entities/marketplace-bot.entity';
import {
  MarketplaceSubscriptionPlan,
  MarketplaceSubscriptionStatus,
} from '../../marketplace/entities/marketplace-subscription.entity';

describe('MarketplaceServer', () => {
  let server: MarketplaceServer;
  let marketplaceService: jest.Mocked<MarketplaceService>;

  const bot = {
    id: '5d887476-25af-443f-b57a-10b45b7affd1',
    slug: 'fnol-bot',
    name: 'FNOL Bot',
    description: 'Automates FNOL workflows',
    category: BotCategory.INSURANCE,
    currentVersion: '1.0.0',
    executionMode: ExecutionMode.RUNNER,
    pricingModel: PricingModel.HYBRID,
    pricing: {
      minimumMonthly: 4000,
      usageMetrics: [{ metric: 'claims_completed', pricePerUnit: 3, description: 'per claim' }],
    },
    features: [{ title: 'OCR', description: 'OCR extraction' }],
    installs: 10,
    rating: 4.5,
    publisherId: '11111111-1111-1111-1111-111111111111',
    publisher: { name: 'Skuld' },
    status: MarketplaceBotStatus.PUBLISHED,
    isSkuldBot: true,
    documentationUrl: 'https://docs.example.com/fnol',
  } as any;

  beforeEach(async () => {
    const marketplaceServiceMock: Partial<jest.Mocked<MarketplaceService>> = {
      getCatalog: jest.fn(),
      getBotById: jest.fn(),
      getVersions: jest.fn(),
      subscribeTenantToBot: jest.fn(),
      unsubscribeTenantFromBot: jest.fn(),
      listTenantSubscriptions: jest.fn(),
      recordBotDownload: jest.fn(),
      getPartner: jest.fn(),
      getPublishedCategoriesSummary: jest.fn(),
      resolveBotVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceServer,
        {
          provide: MarketplaceService,
          useValue: marketplaceServiceMock,
        },
      ],
    }).compile();

    server = module.get<MarketplaceServer>(MarketplaceServer);
    marketplaceService = module.get(MarketplaceService);
  });

  it('exposes expected marketplace tools', () => {
    const tools = server.getTools();
    expect(tools).toHaveLength(7);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'search_marketplace_bots',
        'get_bot_details',
        'subscribe_to_bot',
        'download_bot',
      ]),
    );
  });

  it('searches marketplace catalog from service data', async () => {
    marketplaceService.getCatalog.mockResolvedValue({
      data: [bot],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const response = await server.executeTool({
      name: 'search_marketplace_bots',
      arguments: { query: 'fnol', category: 'insurance', pricingModel: 'hybrid' },
    });

    expect(response.success).toBe(true);
    expect(response.result.total).toBe(1);
    expect(response.result.bots[0].id).toBe(bot.id);
    expect(marketplaceService.getCatalog).toHaveBeenCalledTimes(1);
  });

  it('returns bot details and versions', async () => {
    marketplaceService.getBotById.mockResolvedValue(bot);
    marketplaceService.getVersions.mockResolvedValue([
      {
        id: '34a5c6c5-a160-47b4-9a69-e8f9235409f3',
        version: '1.0.0',
        releaseNotes: 'Initial',
        isLatest: true,
        packageHash: 'sha256',
        dslHash: 'dsl-hash',
        createdAt: new Date('2026-02-24T10:00:00.000Z'),
      } as any,
    ]);

    const response = await server.executeTool({
      name: 'get_bot_details',
      arguments: { botId: bot.id },
    });

    expect(response.success).toBe(true);
    expect(response.result.id).toBe(bot.id);
    expect(response.result.versions).toHaveLength(1);
  });

  it('subscribes tenant to bot with persisted subscription', async () => {
    marketplaceService.subscribeTenantToBot.mockResolvedValue({
      id: 'de2e25b6-da15-4512-84a5-22f68c6f83e1',
      tenantId: 'a8d9198d-bfa5-4f0f-aa1b-1d62096c4fdb',
      marketplaceBotId: bot.id,
      pricingPlan: MarketplaceSubscriptionPlan.HYBRID,
      status: MarketplaceSubscriptionStatus.ACTIVE,
      subscribedAt: new Date('2026-02-24T10:00:00.000Z'),
    } as any);

    const response = await server.executeTool({
      name: 'subscribe_to_bot',
      arguments: {
        tenantId: 'a8d9198d-bfa5-4f0f-aa1b-1d62096c4fdb',
        botId: bot.id,
        pricingPlan: 'hybrid',
      },
    });

    expect(response.success).toBe(true);
    expect(response.result.status).toBe('active');
    expect(marketplaceService.subscribeTenantToBot).toHaveBeenCalledWith({
      tenantId: 'a8d9198d-bfa5-4f0f-aa1b-1d62096c4fdb',
      botId: bot.id,
      pricingPlan: MarketplaceSubscriptionPlan.HYBRID,
    });
  });

  it('loads categories resource from service', async () => {
    marketplaceService.getPublishedCategoriesSummary.mockResolvedValue([
      { id: 'insurance', name: 'Insurance', botCount: 2 },
      { id: 'finance', name: 'Finance', botCount: 1 },
    ]);

    const resource = await server.readResource('marketplace://categories');
    const parsed = JSON.parse(resource.content);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('insurance');
  });

  it('returns unknown tool error for unsupported tool', async () => {
    const response = await server.executeTool({
      name: 'unsupported_tool',
      arguments: {},
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown tool');
  });
});
