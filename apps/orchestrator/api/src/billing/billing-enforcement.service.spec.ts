import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingEnforcementService } from './billing-enforcement.service';
import { LicenseService } from '../license/license.service';

describe('BillingEnforcementService', () => {
  const tenantId = '8f42e901-8a09-4b97-90fd-3c910dc6f8ca';
  const controlPlaneUrl = 'https://cp.example.test';

  let service: BillingEnforcementService;
  let configService: { get: jest.Mock };
  let licenseService: { getTenantId: jest.Mock };

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        switch (key) {
          case 'CONTROL_PLANE_URL':
            return controlPlaneUrl;
          case 'ORCHESTRATOR_ID':
            return 'orch-test';
          case 'ENFORCEMENT_FAIL_CLOSED':
            return true;
          case 'LICENSE_KEY':
            return 'license-key';
          case 'CONTROL_PLANE_API_KEY':
            return 'cp-api-key';
          case 'FLEET_SHARED_SECRET':
            return 'fleet-secret';
          case 'FLEET_JWT_SECRET':
            return '';
          default:
            return defaultValue;
        }
      }),
    };

    licenseService = {
      getTenantId: jest.fn(() => tenantId),
    };

    service = new BillingEnforcementService(
      configService as unknown as ConfigService,
      licenseService as unknown as LicenseService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws ForbiddenException when quota check is denied', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: false,
          reason: 'Quota exceeded and blocked (limit 1000)',
          state: 'blocked',
          limit: 1000,
          projectedUsage: 1001,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(service.checkQuota(tenantId, 'runs_per_month', 1)).rejects.toThrow(
      ForbiddenException,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${controlPlaneUrl}/api/quota/check`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('returns quota result when check is allowed', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: true,
          reason: 'Within quota limit (1000)',
          state: 'normal',
          limit: 1000,
          projectedUsage: 450,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await service.checkQuota(tenantId, 'runs_per_month', 1);
    expect(result.allowed).toBe(true);
    expect(result.state).toBe('normal');
    expect(result.projectedUsage).toBe(450);
  });
});
