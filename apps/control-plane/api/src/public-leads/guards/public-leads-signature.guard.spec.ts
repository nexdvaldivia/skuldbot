import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { PublicLeadsSignatureGuard } from './public-leads-signature.guard';
import { computeGatewaySignature } from '../public-leads-signature.util';

type HeaderMap = Record<string, string | string[] | undefined>;

function createExecutionContext(headers: HeaderMap, body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, body }),
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

describe('PublicLeadsSignatureGuard', () => {
  const secret = 'shared-secret';

  it('accepts request with valid signature', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = { tenantId: 'skuld', source: 'contact_form', email: 'a@b.com' };
    const signature = computeGatewaySignature(body, secret, timestamp);

    const guard = new PublicLeadsSignatureGuard(
      createConfigService({
        CP_PUBLIC_LEADS_SHARED_SECRET: secret,
        CP_PUBLIC_LEADS_ALLOWED_GATEWAYS: 'skuldbotweb',
      }),
    );
    const context = createExecutionContext(
      {
        'x-gateway-id': 'skuldbotweb',
        'x-gateway-timestamp': timestamp,
        'x-gateway-signature': signature,
      },
      body,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects request with invalid signature', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = { tenantId: 'skuld', source: 'contact_form', email: 'a@b.com' };

    const guard = new PublicLeadsSignatureGuard(
      createConfigService({
        CP_PUBLIC_LEADS_SHARED_SECRET: secret,
        CP_PUBLIC_LEADS_ALLOWED_GATEWAYS: 'skuldbotweb',
      }),
    );
    const context = createExecutionContext(
      {
        'x-gateway-id': 'skuldbotweb',
        'x-gateway-timestamp': timestamp,
        'x-gateway-signature': 'bad-signature',
      },
      body,
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
