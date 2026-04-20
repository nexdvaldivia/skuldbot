import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RevenueShareRecord } from '../billing/entities/revenue-share.entity';
import { SecurityAuditEvent } from '../common/audit/entities/security-audit-event.entity';
import {
  MarketplaceBot,
  MarketplaceBotStatus,
  BotVersion,
} from './entities/marketplace-bot.entity';
import { Partner, PartnerStatus } from './entities/partner.entity';
import { PartnerType } from './entities/partner-type.entity';
import {
  MarketplaceSubscription,
  MarketplaceSubscriptionStatus,
} from './entities/marketplace-subscription.entity';
import { MarketplaceService } from './marketplace.service';

type RepoMock<T = unknown> = {
  __entityType?: T;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  increment: jest.Mock;
  decrement: jest.Mock;
  remove: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepoMock<T = unknown>(): RepoMock<T> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (payload) => payload),
    create: jest.fn((payload) => payload),
    count: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function createQueryBuilderMock(returnData: unknown[]) {
  return {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(returnData),
  };
}

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let botRepository: RepoMock<MarketplaceBot>;
  let versionRepository: RepoMock<BotVersion>;
  let partnerRepository: RepoMock<Partner>;
  let partnerTypeRepository: RepoMock<PartnerType>;
  let subscriptionRepository: RepoMock<MarketplaceSubscription>;
  let securityAuditRepository: RepoMock<SecurityAuditEvent>;
  let revenueShareRepository: RepoMock<RevenueShareRecord>;

  beforeEach(() => {
    botRepository = createRepoMock<MarketplaceBot>();
    versionRepository = createRepoMock<BotVersion>();
    partnerRepository = createRepoMock<Partner>();
    partnerTypeRepository = createRepoMock<PartnerType>();
    subscriptionRepository = createRepoMock<MarketplaceSubscription>();
    securityAuditRepository = createRepoMock<SecurityAuditEvent>();
    revenueShareRepository = createRepoMock<RevenueShareRecord>();

    service = new MarketplaceService(
      botRepository as unknown as Repository<MarketplaceBot>,
      versionRepository as unknown as Repository<BotVersion>,
      partnerRepository as unknown as Repository<Partner>,
      partnerTypeRepository as unknown as Repository<PartnerType>,
      subscriptionRepository as unknown as Repository<MarketplaceSubscription>,
      securityAuditRepository as unknown as Repository<SecurityAuditEvent>,
      revenueShareRepository as unknown as Repository<RevenueShareRecord>,
    );
  });

  it('returns analytics payload and writes audit event', async () => {
    botRepository.find.mockResolvedValue([
      { id: 'bot-1', name: 'Bot One', installs: 15, status: MarketplaceBotStatus.PUBLISHED },
      { id: 'bot-2', name: 'Bot Two', installs: 5, status: MarketplaceBotStatus.PUBLISHED },
    ]);
    partnerRepository.count.mockResolvedValue(3);
    revenueShareRepository.find.mockResolvedValue([
      { grossRevenue: 125.5, status: 'approved' },
      { grossRevenue: 74.5, status: 'paid' },
    ]);

    const payload = await service.getMarketplaceAnalytics({
      actorUserId: 'user-1',
      actorEmail: 'admin@skuld.ai',
      requestIp: '203.0.113.5',
    });

    expect(payload.totalBots).toBe(2);
    expect(payload.totalPartners).toBe(3);
    expect(payload.totalInstalls).toBe(20);
    expect(payload.monthlyRevenue).toBe(200);
    expect(payload.topBots).toHaveLength(2);
    expect(securityAuditRepository.save).toHaveBeenCalled();
  });

  it('creates partner and records audit trail', async () => {
    partnerRepository.findOne.mockResolvedValue(null);
    partnerRepository.create.mockReturnValue({
      id: 'partner-1',
      company: 'Acme',
      status: PartnerStatus.PENDING,
    });

    const partner = await service.createPartner(
      {
        name: 'Acme Partner',
        email: 'partner@acme.com',
        company: 'Acme',
      },
      { actorUserId: 'user-1', actorEmail: 'admin@skuld.ai', requestIp: '203.0.113.7' },
    );

    expect(partner.id).toBe('partner-1');
    expect(securityAuditRepository.save).toHaveBeenCalled();
  });

  it('rejects duplicate partner email', async () => {
    partnerRepository.findOne.mockResolvedValue({ id: 'existing-partner' });

    await expect(
      service.createPartner({
        name: 'Dup',
        email: 'dup@example.com',
        company: 'Dup Co',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists partners with status filter and records audit', async () => {
    partnerRepository.createQueryBuilder.mockReturnValue(
      createQueryBuilderMock([
        { id: 'partner-1', status: PartnerStatus.APPROVED } as Partner,
        { id: 'partner-2', status: PartnerStatus.APPROVED } as Partner,
      ]),
    );

    const payload = await service.listPartners(
      { status: PartnerStatus.APPROVED },
      {
        actorUserId: 'user-2',
        actorEmail: 'support@skuld.ai',
        requestIp: '203.0.113.10',
      },
    );

    expect(payload).toHaveLength(2);
    expect(securityAuditRepository.save).toHaveBeenCalled();
  });

  it('rejects partner application with reason', async () => {
    partnerRepository.findOne.mockResolvedValue({
      id: 'partner-1',
      status: PartnerStatus.PENDING,
    } as Partner);

    const payload = await service.rejectPartner(
      'partner-1',
      'admin@skuld.ai',
      'Missing compliance docs',
      {
        actorUserId: 'admin-1',
        actorEmail: 'admin@skuld.ai',
        requestIp: '203.0.113.22',
      },
    );

    expect(payload.status).toBe(PartnerStatus.REJECTED);
    expect(partnerRepository.save).toHaveBeenCalled();
    expect(securityAuditRepository.save).toHaveBeenCalled();
  });

  it('activates approved partner', async () => {
    partnerRepository.findOne.mockResolvedValue({
      id: 'partner-1',
      status: PartnerStatus.APPROVED,
    } as Partner);

    const payload = await service.activatePartner('partner-1', 'admin@skuld.ai');
    expect(payload.status).toBe(PartnerStatus.ACTIVE);
    expect(partnerRepository.save).toHaveBeenCalled();
  });

  it('blocks suspension when partner is pending', async () => {
    partnerRepository.findOne.mockResolvedValue({
      id: 'partner-1',
      status: PartnerStatus.PENDING,
    } as Partner);

    await expect(
      service.suspendPartner('partner-1', 'admin@skuld.ai', 'Risk detected'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates partner type and enforces slug uniqueness', async () => {
    partnerTypeRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'type-2',
      slug: 'services',
    });
    partnerTypeRepository.create.mockReturnValue({
      id: 'type-1',
      name: 'Services',
      slug: 'services',
      isActive: true,
      sortOrder: 0,
    });

    const created = await service.createPartnerType({
      name: 'Services',
      slug: 'services',
    });
    expect(created.slug).toBe('services');

    await expect(
      service.createPartnerType({
        name: 'Services',
        slug: 'services',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns active tenant subscriptions', async () => {
    const now = new Date();
    subscriptionRepository.find.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        marketplaceBotId: 'bot-1',
        status: MarketplaceSubscriptionStatus.ACTIVE,
        subscribedAt: now,
      },
    ]);

    const payload = await service.listTenantSubscriptions('tenant-1');
    expect(payload).toHaveLength(1);
  });
});
