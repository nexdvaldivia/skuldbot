import { BadRequestException } from '@nestjs/common';

const EVIDENCE_KEY_TOKENS = [
  'evidence',
  'evidencepack',
  'artifact',
  'artifacts',
  'chainofcustody',
  'custody',
  'legalhold',
  'auditlog',
  'audittrail',
  'forensic',
  'runlog',
  'runtrace',
  'tracebundle',
  'screenshot',
  'screenshots',
  'screenrecording',
  'screenrecord',
  'transcript',
  'prompttemplate',
  'prompttext',
  'modelresponse',
  'rawlog',
  'rawpayload',
  'evidencemanifest',
];

interface TraverseNode {
  path: string;
  value: unknown;
}

export interface EvidenceBoundaryViolation {
  key: string;
  normalizedKey: string;
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isEvidenceLikeKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return EVIDENCE_KEY_TOKENS.some((token) => normalized.includes(token));
}

export function findEvidenceBoundaryViolations(
  payload: unknown,
): EvidenceBoundaryViolation[] {
  if (!isRecord(payload) && !Array.isArray(payload)) {
    return [];
  }

  const violations: EvidenceBoundaryViolation[] = [];
  const stack: TraverseNode[] = [{ path: '$', value: payload }];
  let processedNodes = 0;
  const nodeBudget = 500;

  while (stack.length > 0 && processedNodes < nodeBudget) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    processedNodes++;

    if (Array.isArray(node.value)) {
      for (let index = 0; index < node.value.length; index++) {
        stack.push({
          path: `${node.path}[${index}]`,
          value: node.value[index],
        });
      }
      continue;
    }

    if (!isRecord(node.value)) {
      continue;
    }

    for (const [key, child] of Object.entries(node.value)) {
      if (isEvidenceLikeKey(key)) {
        violations.push({
          key,
          normalizedKey: normalizeKey(key),
          path: `${node.path}.${key}`,
        });
      }

      if (isRecord(child) || Array.isArray(child)) {
        stack.push({
          path: `${node.path}.${key}`,
          value: child,
        });
      }
    }
  }

  return violations;
}

export function assertNoOperationalEvidencePayload(
  payload: unknown,
  context: string,
): void {
  const violations = findEvidenceBoundaryViolations(payload);
  if (violations.length === 0) {
    return;
  }

  const firstViolation = violations[0];
  throw new BadRequestException(
    `Control Plane only accepts telemetry metadata. ${context} includes evidence-like field "${firstViolation.key}" at "${firstViolation.path}".`,
  );
}
