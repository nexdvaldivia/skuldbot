import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class OrchestratorFleetAuthGuard implements CanActivate {
  private readonly logger = new Logger(OrchestratorFleetAuthGuard.name);
  private warnedDevBypass = false;
  private readonly jwtService = new JwtService();

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      body?: { orchestratorId?: string; tenantId?: string };
    }>();

    const jwtSecret = this.getJwtSecret();
    const expectedSharedSecret = this.getExpectedSharedSecret();
    if (!jwtSecret && !expectedSharedSecret) {
      const isProduction =
        this.configService.get<string>('NODE_ENV') === 'production';
      if (isProduction) {
        throw new UnauthorizedException(
          'Fleet channel authentication is not configured in Control Plane',
        );
      }

      if (!this.warnedDevBypass) {
        this.warnedDevBypass = true;
        this.logger.warn(
          'Fleet auth bypassed because no secret is configured (development mode only)',
        );
      }
      return true;
    }

    const providedToken = this.getProvidedToken(request.headers);
    if (!providedToken) {
      throw new UnauthorizedException('Missing orchestrator authentication token');
    }

    if (jwtSecret) {
      this.validateJwtToken(providedToken, jwtSecret, request);
      this.validateFleetContractVersion(request.headers);
      return true;
    }

    if (!this.safeCompare(providedToken, expectedSharedSecret)) {
      throw new UnauthorizedException(
        'Invalid orchestrator authentication token',
      );
    }

    const headerOrchestratorId = this.getHeaderValue(
      request.headers['x-orchestrator-id'],
    );
    if (
      headerOrchestratorId &&
      request.body?.orchestratorId &&
      headerOrchestratorId !== request.body.orchestratorId
    ) {
      throw new UnauthorizedException(
        'x-orchestrator-id header does not match body.orchestratorId',
      );
    }

    this.validateFleetContractVersion(request.headers);
    return true;
  }

  private getJwtSecret(): string {
    return this.configService
      .get<string>('ORCHESTRATOR_FLEET_JWT_SECRET', '')
      .trim();
  }

  private getExpectedSharedSecret(): string {
    const fleetSecret = this.configService
      .get<string>('ORCHESTRATOR_FLEET_SHARED_SECRET', '')
      .trim();
    if (fleetSecret) {
      return fleetSecret;
    }

    return this.configService.get<string>('CONTROL_PLANE_API_KEY', '').trim();
  }

  private getProvidedToken(
    headers: Record<string, string | string[] | undefined>,
  ): string | null {
    const headerToken = this.getHeaderValue(headers['x-orchestrator-token']);
    if (headerToken) {
      return headerToken;
    }

    const authorization = this.getHeaderValue(headers.authorization);
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice(7).trim();
    }

    return null;
  }

  private getHeaderValue(header: string | string[] | undefined): string {
    if (!header) {
      return '';
    }

    if (Array.isArray(header)) {
      return header[0] ?? '';
    }

    return header;
  }

  private validateJwtToken(
    token: string,
    jwtSecret: string,
    request: {
      headers: Record<string, string | string[] | undefined>;
      body?: { orchestratorId?: string; tenantId?: string };
    },
  ): void {
    try {
      const expectedIssuer = this.configService.get<string>(
        'ORCHESTRATOR_FLEET_TOKEN_ISSUER',
        'skuldbot-orchestrator',
      );
      const expectedAudience = this.configService.get<string>(
        'ORCHESTRATOR_FLEET_TOKEN_AUDIENCE',
        'skuld-control-plane-fleet',
      );

      const payload = this.jwtService.verify<{
        sub?: string;
        orchestratorId?: string;
        tenantId?: string;
      }>(token, {
        secret: jwtSecret,
        issuer: expectedIssuer,
        audience: expectedAudience,
      });

      const payloadOrchestratorId = payload.sub || payload.orchestratorId || '';
      if (!payloadOrchestratorId) {
        throw new UnauthorizedException(
          'Invalid fleet JWT: missing orchestrator subject',
        );
      }

      const headerOrchestratorId = this.getHeaderValue(
        request.headers['x-orchestrator-id'],
      );
      if (
        headerOrchestratorId &&
        headerOrchestratorId !== payloadOrchestratorId
      ) {
        throw new UnauthorizedException(
          'Fleet JWT subject does not match x-orchestrator-id',
        );
      }

      if (
        request.body?.orchestratorId &&
        request.body.orchestratorId !== payloadOrchestratorId
      ) {
        throw new UnauthorizedException(
          'Fleet JWT subject does not match body.orchestratorId',
        );
      }

      const payloadTenantId = payload.tenantId?.trim();
      if (!payloadTenantId) {
        return;
      }

      const headerTenantId = this.getHeaderValue(request.headers['x-tenant-id']).trim();
      if (headerTenantId && headerTenantId !== payloadTenantId) {
        throw new UnauthorizedException(
          'Fleet JWT tenant does not match x-tenant-id',
        );
      }

      if (request.body?.tenantId && request.body.tenantId !== payloadTenantId) {
        throw new UnauthorizedException(
          'Fleet JWT tenant does not match body.tenantId',
        );
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid fleet JWT token');
    }
  }

  private safeCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);

    if (aBuf.length !== bBuf.length) {
      return false;
    }

    return timingSafeEqual(aBuf, bBuf);
  }

  private validateFleetContractVersion(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const expectedVersion = this.configService.get<string>(
      'ORCHESTRATOR_FLEET_CONTRACT_VERSION',
      '1',
    );
    const providedVersion = this.getHeaderValue(
      headers['x-fleet-contract-version'],
    ).trim();

    if (!providedVersion) {
      throw new UnauthorizedException('Missing x-fleet-contract-version header');
    }

    if (!this.isCompatibleContractVersion(providedVersion, expectedVersion)) {
      throw new UnauthorizedException(
        `Unsupported fleet contract version "${providedVersion}" (expected ${expectedVersion})`,
      );
    }
  }

  private isCompatibleContractVersion(
    provided: string,
    expected: string,
  ): boolean {
    const providedMajor = this.extractMajorVersion(provided);
    const expectedMajor = this.extractMajorVersion(expected);

    if (providedMajor !== null && expectedMajor !== null) {
      return providedMajor === expectedMajor;
    }

    return this.normalizeVersion(provided) === this.normalizeVersion(expected);
  }

  private extractMajorVersion(version: string): number | null {
    const normalized = this.normalizeVersion(version);
    const [major] = normalized.split('.');
    if (!major || !/^\d+$/.test(major)) {
      return null;
    }
    return Number(major);
  }

  private normalizeVersion(version: string): string {
    return version.trim().toLowerCase().replace(/^v/, '');
  }
}
