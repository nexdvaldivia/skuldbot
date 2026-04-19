import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from './subscription.service';
import { SubscriptionStatus } from './entities/subscription.entity';

type RepoMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((payload: unknown) => payload),
    save: jest.fn(async (payload: unknown) => payload),
    createQueryBuilder: jest.fn(),
  };
}

describe('SubscriptionService', () => {
  it('creates subscription using selected pricing plan and interval', async () => {
    const subscriptionRepo = createRepoMock();
    const paymentHistoryRepo = createRepoMock();
    const pricingPlanRepo = createRepoMock();
    const paymentProvider = {
      isConfigured: jest.fn(() => false),
      createCustomer: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
    };
    const configService = {
      get: jest.fn((_: string, defaultValue: unknown) => defaultValue),
    } as unknown as ConfigService;

    subscriptionRepo.findOne.mockResolvedValue(null);
    pricingPlanRepo.findOne.mockResolvedValue({
      code: 'starter',
      baseMonthlyCents: 4900,
      baseAnnualCents: 49000,
      isActive: true,
    });

    const service = new SubscriptionService(
      configService,
      subscriptionRepo as never,
      paymentHistoryRepo as never,
      pricingPlanRepo as never,
      paymentProvider as never,
    );

    const subscription = await service.createSubscription('tenant-1', 'Acme', 14, {
      planCode: 'starter',
      billingInterval: 'annual',
    });

    expect(subscription.planCode).toBe('starter');
    expect(subscription.billingInterval).toBe('annual');
    expect(subscription.monthlyAmount).toBe(490);
  });

  it('changes plan and updates existing Stripe subscription', async () => {
    const subscriptionRepo = createRepoMock();
    const paymentHistoryRepo = createRepoMock();
    const pricingPlanRepo = createRepoMock();
    const paymentProvider = {
      isConfigured: jest.fn(() => true),
      createCustomer: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(async () => ({
        id: 'sub_1',
        customerId: 'cus_1',
        status: 'active',
        priceId: 'price_pro',
        currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
      })),
      cancelSubscription: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'STRIPE_PRICE_PROFESSIONAL_MONTHLY') {
          return 'price_pro';
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    subscriptionRepo.findOne.mockResolvedValue({
      id: 'sub-local-1',
      tenantId: 'tenant-1',
      tenantName: 'Acme',
      planCode: 'starter',
      billingInterval: 'monthly',
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      gracePeriodDays: 14,
    });
    pricingPlanRepo.findOne.mockResolvedValue({
      code: 'professional',
      baseMonthlyCents: 14900,
      baseAnnualCents: 149000,
      isActive: true,
    });

    const service = new SubscriptionService(
      configService,
      subscriptionRepo as never,
      paymentHistoryRepo as never,
      pricingPlanRepo as never,
      paymentProvider as never,
    );

    const updated = await service.changePlan('tenant-1', 'professional', 'monthly');
    expect(updated.planCode).toBe('professional');
    expect(updated.monthlyAmount).toBe(149);
    expect(paymentProvider.updateSubscription).toHaveBeenCalledTimes(1);
  });

  it('cancels subscription with grace window and calls provider cancellation', async () => {
    const subscriptionRepo = createRepoMock();
    const paymentHistoryRepo = createRepoMock();
    const pricingPlanRepo = createRepoMock();
    const paymentProvider = {
      isConfigured: jest.fn(() => true),
      createCustomer: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(async () => undefined),
    };
    const configService = {
      get: jest.fn((_: string, defaultValue: unknown) => defaultValue),
    } as unknown as ConfigService;

    subscriptionRepo.findOne.mockResolvedValue({
      id: 'sub-local-1',
      tenantId: 'tenant-1',
      tenantName: 'Acme',
      planCode: 'starter',
      billingInterval: 'monthly',
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      gracePeriodDays: 14,
      botsCanRun: true,
    });

    const service = new SubscriptionService(
      configService,
      subscriptionRepo as never,
      paymentHistoryRepo as never,
      pricingPlanRepo as never,
      paymentProvider as never,
    );

    const canceled = await service.cancelSubscriptionWithGrace('tenant-1', 7);
    expect(canceled.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(canceled.gracePeriodDays).toBe(7);
    expect(canceled.gracePeriodEnds).toBeDefined();
    expect(paymentProvider.cancelSubscription).toHaveBeenCalledWith('sub_1');
  });
});
