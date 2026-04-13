import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyGatewaySignature } from '../public-leads-signature.util';

@Injectable()
export class PublicLeadsSignatureGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      body: unknown;
    }>();

    const gatewayId = this.readHeader(request.headers, 'x-gateway-id');
    const timestamp = this.readHeader(request.headers, 'x-gateway-timestamp');
    const signature = this.readHeader(request.headers, 'x-gateway-signature');

    if (!gatewayId || !timestamp || !signature) {
      throw new UnauthorizedException('Missing gateway signature headers');
    }

    this.assertTimestampWithinSkew(timestamp);

    const allowedGateways = this.configService
      .get<string>('CP_PUBLIC_LEADS_ALLOWED_GATEWAYS', '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (allowedGateways.length === 0) {
      throw new UnauthorizedException('Lead intake allowlist is not configured for gateways');
    }

    if (!allowedGateways.includes(gatewayId)) {
      throw new UnauthorizedException('Gateway is not allowed for lead intake');
    }

    const secret = this.getSharedSecret();

    const valid = verifyGatewaySignature({
      payload: request.body ?? {},
      secret,
      timestamp,
      signature,
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid gateway signature');
    }

    return true;
  }

  private assertTimestampWithinSkew(timestamp: string): void {
    const skewSeconds = Number(
      this.configService.get<number>('CP_PUBLIC_LEADS_MAX_CLOCK_SKEW_SECONDS', 300),
    );
    const parsed = Number(timestamp);
    if (!Number.isFinite(parsed)) {
      throw new UnauthorizedException('Invalid gateway timestamp');
    }

    const timestampMs = timestamp.length >= 13 ? parsed : parsed * 1000;
    const now = Date.now();
    const maxSkewMs = Math.max(1, Math.floor(skewSeconds)) * 1000;

    if (Math.abs(now - timestampMs) > maxSkewMs) {
      throw new UnauthorizedException('Gateway timestamp outside accepted window');
    }
  }

  private getSharedSecret(): string {
    const configured = this.configService.get<string>('CP_PUBLIC_LEADS_SHARED_SECRET');
    if (!configured || configured.trim().length === 0) {
      throw new UnauthorizedException('Lead intake signature secret is not configured');
    }
    return configured.trim();
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
    const value = headers[name];
    if (Array.isArray(value)) {
      return value[0]?.trim() ?? '';
    }
    return value?.trim() ?? '';
  }
}
