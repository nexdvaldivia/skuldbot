import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { LicensesService } from './licenses.service';
import { License } from './entities/license.entity';
import { LicenseAudit } from './entities/license-audit.entity';
import { LicenseTypeFeature } from './entities/license-type-feature.entity';

type RepoMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function buildRepoMock<T extends { id?: string }>(): RepoMock {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((payload: T) => payload),
    createQueryBuilder: jest.fn(),
  };
}

describe('LicensesService', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const now = new Date('2026-04-19T12:00:00.000Z');

  let licenseStore: Record<string, License>;
  let licenseRepo: RepoMock;
  let auditRepo: RepoMock;
  let tenantRepo: RepoMock;
  let featureRepo: RepoMock;
  let service: LicensesService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    licenseStore = {};
    licenseRepo = buildRepoMock<License>();
    auditRepo = buildRepoMock<LicenseAudit>();
    tenantRepo = buildRepoMock<{ id: string; slug: string }>();
    featureRepo = buildRepoMock<LicenseTypeFeature>();

    licenseRepo.save.mockImplementation(async (payload: License) => {
      const id = payload.id ?? crypto.randomUUID();
      const persisted = { ...payload, id } as License;
      licenseStore[id] = persisted;
      return persisted;
    });
    licenseRepo.findOne.mockImplementation(
      async (query: { where: { id?: string; key?: string } }) => {
        const { id, key } = query.where;
        if (id) {
          return licenseStore[id] ?? null;
        }
        if (key) {
          const found = Object.values(licenseStore).find((row) => row.key === key);
          if (!found) {
            return null;
          }
          return { ...found, tenant: { id: tenantId, slug: 'acme' } } as License;
        }
        return null;
      },
    );

    tenantRepo.findOne.mockResolvedValue({ id: tenantId, slug: 'acme' });
    featureRepo.find.mockResolvedValue([
      {
        featureKey: 'maxBots',
        valueType: 'number',
        numberValue: 10,
        booleanValue: null,
        isActive: true,
      },
      {
        featureKey: 'maxRunners',
        valueType: 'number',
        numberValue: 2,
        booleanValue: null,
        isActive: true,
      },
      {
        featureKey: 'maxConcurrentRuns',
        valueType: 'number',
        numberValue: 5,
        booleanValue: null,
        isActive: true,
      },
      {
        featureKey: 'maxRunsPerMonth',
        valueType: 'number',
        numberValue: 1000,
        booleanValue: null,
        isActive: true,
      },
      {
        featureKey: 'aiAssistant',
        valueType: 'boolean',
        numberValue: null,
        booleanValue: true,
        isActive: true,
      },
      {
        featureKey: 'customNodes',
        valueType: 'boolean',
        numberValue: null,
        booleanValue: false,
        isActive: true,
      },
      {
        featureKey: 'apiAccess',
        valueType: 'boolean',
        numberValue: null,
        booleanValue: true,
        isActive: true,
      },
      {
        featureKey: 'sso',
        valueType: 'boolean',
        numberValue: null,
        booleanValue: false,
        isActive: true,
      },
      {
        featureKey: 'auditLog',
        valueType: 'boolean',
        numberValue: null,
        booleanValue: true,
        isActive: true,
      },
      {
        featureKey: 'prioritySupport',
        valueType: 'boolean',
        numberValue: null,
        booleanValue: false,
        isActive: true,
      },
    ]);
    auditRepo.save.mockImplementation(async (payload: LicenseAudit) => payload);

    const lookupsService = {
      assertActiveCode: jest.fn().mockResolvedValue(undefined),
      getDefaultCode: jest.fn().mockResolvedValue('active'),
      listValuesByDomainCode: jest
        .fn()
        .mockResolvedValue([{ id: 'lt-starter', code: 'starter', isActive: true }]),
      getMetadata: jest.fn().mockResolvedValue({ blocksUsage: false }),
    };

    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'LICENSE_GRACE_PERIOD_DAYS') return '30';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    service = new LicensesService(
      licenseRepo as never,
      auditRepo as never,
      tenantRepo as never,
      featureRepo as never,
      buildRepoMock() as never,
      buildRepoMock() as never,
      buildRepoMock() as never,
      configService,
      lookupsService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('signs issued licenses and validates with signature', async () => {
    const created = await service.create({
      tenantId,
      type: 'starter',
      validFrom: '2026-04-01T00:00:00.000Z',
      validUntil: '2026-05-01T00:00:00.000Z',
    });

    expect(created.signatureAlgorithm).toBe('ed25519');
    expect(created.publicKeyId.length).toBeGreaterThan(0);

    const validation = await service.validate(created.key);
    expect(validation.valid).toBe(true);
    expect(validation.signatureVerified).toBe(true);
    expect(validation.validationCount).toBe(1);
    expect(validation.message).toContain('valid');
  });

  it('rejects tampered payload when signature no longer matches', async () => {
    const created = await service.create({
      tenantId,
      type: 'starter',
      validFrom: '2026-04-01T00:00:00.000Z',
      validUntil: '2026-05-01T00:00:00.000Z',
    });

    const stored = Object.values(licenseStore).find((row) => row.id === created.id) as License;
    stored.features = { ...stored.features, maxBots: 999 };
    licenseStore[stored.id] = stored;

    const validation = await service.validate(created.key);
    expect(validation.valid).toBe(false);
    expect(validation.signatureVerified).toBe(false);
    expect(validation.message).toContain('signature verification failed');
  });

  it('allows expired license while within grace period and blocks after grace ends', async () => {
    const created = await service.create({
      tenantId,
      type: 'starter',
      validFrom: '2026-03-01T00:00:00.000Z',
      validUntil: '2026-04-10T00:00:00.000Z',
      gracePeriodDays: 30,
    });

    const first = await service.validate(created.key);
    expect(first.valid).toBe(true);
    expect(first.message).toContain('grace period');
    expect(first.gracePeriodEndsAt).not.toBeNull();

    const stored = Object.values(licenseStore).find((row) => row.id === created.id) as License;
    stored.gracePeriodEndsAt = new Date('2026-04-18T00:00:00.000Z');
    licenseStore[stored.id] = stored;

    const second = await service.validate(created.key);
    expect(second.valid).toBe(false);
    expect(second.message).toContain('expired');
  });

  it('keeps revoked license operable only during grace window', async () => {
    const created = await service.create({
      tenantId,
      type: 'starter',
      validFrom: '2026-04-01T00:00:00.000Z',
      validUntil: '2026-05-30T00:00:00.000Z',
      gracePeriodDays: 10,
    });

    await service.revoke(created.id);
    const validation = await service.validate(created.key);
    expect(validation.valid).toBe(true);
    expect(validation.message).toContain('grace period');
    expect(auditRepo.save).toHaveBeenCalled();
  });
});
