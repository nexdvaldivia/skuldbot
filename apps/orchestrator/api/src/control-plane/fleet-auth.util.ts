import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface FleetTokenResult {
  mode: 'jwt' | 'shared' | 'none';
  token: string;
}

const jwtService = new JwtService();

export function buildFleetToken(
  configService: ConfigService,
  orchestratorId: string,
  tenantId: string | null,
): FleetTokenResult {
  const jwtSecret = configService.get<string>('ORCHESTRATOR_FLEET_JWT_SECRET', '').trim();

  if (jwtSecret) {
    const issuer = configService.get<string>(
      'ORCHESTRATOR_FLEET_TOKEN_ISSUER',
      'skuldbot-orchestrator',
    );
    const audience = configService.get<string>(
      'ORCHESTRATOR_FLEET_TOKEN_AUDIENCE',
      'skuld-control-plane-fleet',
    );
    const expiresInSeconds = configService.get<number>('ORCHESTRATOR_FLEET_TOKEN_TTL_SECONDS', 120);

    const token = jwtService.sign(
      {
        sub: orchestratorId,
        orchestratorId,
        tenantId: tenantId ?? undefined,
      },
      {
        secret: jwtSecret,
        issuer,
        audience,
        expiresIn: expiresInSeconds,
      },
    );

    return { mode: 'jwt', token };
  }

  const sharedSecret = configService
    .get<string>(
      'ORCHESTRATOR_FLEET_SHARED_SECRET',
      configService.get<string>('CONTROL_PLANE_API_KEY', ''),
    )
    .trim();

  if (!sharedSecret) {
    return { mode: 'none', token: '' };
  }

  return { mode: 'shared', token: sharedSecret };
}

export function buildFleetAuthHeaders(
  configService: ConfigService,
  orchestratorId: string,
  tenantId: string | null,
  traceId?: string,
): Record<string, string> {
  const contractVersion = configService.get<string>('ORCHESTRATOR_FLEET_CONTRACT_VERSION', '1');
  const tokenResult = buildFleetToken(configService, orchestratorId, tenantId);

  if (tokenResult.mode === 'none') {
    const headers: Record<string, string> = {
      'X-Orchestrator-Id': orchestratorId,
      'X-Fleet-Contract-Version': contractVersion,
    };
    if (tenantId) {
      headers['X-Tenant-Id'] = tenantId;
    }
    if (traceId) {
      headers['X-Trace-Id'] = traceId;
    }
    return headers;
  }

  const headers: Record<string, string> = {
    'X-Orchestrator-Id': orchestratorId,
    'X-Orchestrator-Token': tokenResult.token,
    'X-Fleet-Contract-Version': contractVersion,
  };
  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId;
  }
  if (traceId) {
    headers['X-Trace-Id'] = traceId;
  }

  if (tokenResult.mode === 'jwt') {
    headers.Authorization = `Bearer ${tokenResult.token}`;
  }

  return headers;
}
