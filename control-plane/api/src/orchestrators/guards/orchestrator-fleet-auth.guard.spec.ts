import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { OrchestratorFleetAuthGuard } from './orchestrator-fleet-auth.guard';

type HeaderMap = Record<string, string | string[] | undefined>;

function createExecutionContext(
  headers: HeaderMap,
  body?: { orchestratorId?: string; tenantId?: string },
): ExecutionContext {
  const normalizedHeaders: HeaderMap = {
    'x-fleet-contract-version': '1',
    ...headers,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: normalizedHeaders, body }),
    }),
  } as unknown as ExecutionContext;
}

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key in values) {
        return values[key];
      }
      return defaultValue;
    }),
  } as unknown as ConfigService;
}

describe('OrchestratorFleetAuthGuard', () => {
  it('allows development bypass when no fleet auth is configured', () => {
    const configService = createConfigService({ NODE_ENV: 'development' });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects production requests when fleet auth is not configured', () => {
    const configService = createConfigService({ NODE_ENV: 'production' });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('authenticates with shared secret token', () => {
    const configService = createConfigService({
      ORCHESTRATOR_FLEET_SHARED_SECRET: 'fleet-shared-secret',
      NODE_ENV: 'production',
    });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext(
      {
        'x-orchestrator-token': 'fleet-shared-secret',
        'x-orchestrator-id': 'orch-a',
      },
      { orchestratorId: 'orch-a' },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects shared secret token mismatch', () => {
    const configService = createConfigService({
      ORCHESTRATOR_FLEET_SHARED_SECRET: 'fleet-shared-secret',
      NODE_ENV: 'production',
    });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext(
      {
        'x-orchestrator-token': 'wrong-token',
      },
      { orchestratorId: 'orch-a' },
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('authenticates with JWT token and strict issuer/audience', () => {
    const jwtSecret = 'fleet-jwt-secret';
    const jwtService = new JwtService();
    const token = jwtService.sign(
      { sub: 'orch-jwt', orchestratorId: 'orch-jwt' },
      {
        secret: jwtSecret,
        issuer: 'skuldbot-orchestrator',
        audience: 'skuld-control-plane-fleet',
        expiresIn: '2m',
      },
    );

    const configService = createConfigService({
      ORCHESTRATOR_FLEET_JWT_SECRET: jwtSecret,
      ORCHESTRATOR_FLEET_TOKEN_ISSUER: 'skuldbot-orchestrator',
      ORCHESTRATOR_FLEET_TOKEN_AUDIENCE: 'skuld-control-plane-fleet',
      NODE_ENV: 'production',
    });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext(
      {
        authorization: `Bearer ${token}`,
        'x-orchestrator-id': 'orch-jwt',
      },
      { orchestratorId: 'orch-jwt' },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects JWT when subject does not match body orchestratorId', () => {
    const jwtSecret = 'fleet-jwt-secret';
    const jwtService = new JwtService();
    const token = jwtService.sign(
      { sub: 'orch-jwt-a' },
      {
        secret: jwtSecret,
        issuer: 'skuldbot-orchestrator',
        audience: 'skuld-control-plane-fleet',
        expiresIn: '2m',
      },
    );

    const configService = createConfigService({
      ORCHESTRATOR_FLEET_JWT_SECRET: jwtSecret,
      ORCHESTRATOR_FLEET_TOKEN_ISSUER: 'skuldbot-orchestrator',
      ORCHESTRATOR_FLEET_TOKEN_AUDIENCE: 'skuld-control-plane-fleet',
      NODE_ENV: 'production',
    });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext(
      { authorization: `Bearer ${token}` },
      { orchestratorId: 'orch-jwt-b' },
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects JWT when tenant claim does not match x-tenant-id', () => {
    const jwtSecret = 'fleet-jwt-secret';
    const jwtService = new JwtService();
    const token = jwtService.sign(
      { sub: 'orch-jwt-a', tenantId: 'tenant-a' },
      {
        secret: jwtSecret,
        issuer: 'skuldbot-orchestrator',
        audience: 'skuld-control-plane-fleet',
        expiresIn: '2m',
      },
    );

    const configService = createConfigService({
      ORCHESTRATOR_FLEET_JWT_SECRET: jwtSecret,
      ORCHESTRATOR_FLEET_TOKEN_ISSUER: 'skuldbot-orchestrator',
      ORCHESTRATOR_FLEET_TOKEN_AUDIENCE: 'skuld-control-plane-fleet',
      NODE_ENV: 'production',
    });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext(
      {
        authorization: `Bearer ${token}`,
        'x-orchestrator-id': 'orch-jwt-a',
        'x-tenant-id': 'tenant-b',
      },
      { orchestratorId: 'orch-jwt-a', tenantId: 'tenant-a' },
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when contract version header is missing', () => {
    const configService = createConfigService({
      ORCHESTRATOR_FLEET_SHARED_SECRET: 'fleet-shared-secret',
      ORCHESTRATOR_FLEET_CONTRACT_VERSION: '1',
      NODE_ENV: 'production',
    });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext(
      {
        'x-orchestrator-token': 'fleet-shared-secret',
        'x-orchestrator-id': 'orch-a',
        'x-fleet-contract-version': undefined,
      },
      { orchestratorId: 'orch-a' },
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when contract version major is incompatible', () => {
    const configService = createConfigService({
      ORCHESTRATOR_FLEET_SHARED_SECRET: 'fleet-shared-secret',
      ORCHESTRATOR_FLEET_CONTRACT_VERSION: '2',
      NODE_ENV: 'production',
    });
    const guard = new OrchestratorFleetAuthGuard(configService);
    const context = createExecutionContext(
      {
        'x-orchestrator-token': 'fleet-shared-secret',
        'x-orchestrator-id': 'orch-a',
        'x-fleet-contract-version': '1.4.0',
      },
      { orchestratorId: 'orch-a' },
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
