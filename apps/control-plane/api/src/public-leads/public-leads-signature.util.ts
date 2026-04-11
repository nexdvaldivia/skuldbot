import { createHmac, timingSafeEqual } from 'crypto';

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = sortValue(source[key]);
  }
  return sorted;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function computeGatewaySignature(
  payload: unknown,
  secret: string,
  timestamp: string,
): string {
  const canonicalPayload = canonicalStringify(payload);
  return createHmac('sha256', secret)
    .update(`${timestamp}.${canonicalPayload}`)
    .digest('hex');
}

export function verifyGatewaySignature(params: {
  payload: unknown;
  secret: string;
  timestamp: string;
  signature: string;
}): boolean {
  const expected = computeGatewaySignature(
    params.payload,
    params.secret,
    params.timestamp,
  );
  const received = params.signature.replace(/^sha256=/i, '');

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
