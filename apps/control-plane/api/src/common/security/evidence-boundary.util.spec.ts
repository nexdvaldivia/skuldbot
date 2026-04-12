import { BadRequestException } from '@nestjs/common';
import {
  assertNoOperationalEvidencePayload,
  findEvidenceBoundaryViolations,
} from './evidence-boundary.util';

describe('evidence boundary util', () => {
  it('accepts telemetry metadata without evidence keys', () => {
    const payload = {
      cpuPercent: 42,
      memoryMb: 512,
      queueDepth: 3,
      node: {
        botRuns: 7,
      },
    };

    const violations = findEvidenceBoundaryViolations(payload);
    expect(violations).toHaveLength(0);
    expect(() => assertNoOperationalEvidencePayload(payload, 'usage metadata')).not.toThrow();
  });

  it('detects nested evidence-like keys', () => {
    const payload = {
      runtime: {
        details: {
          evidencePackUri: 's3://tenant-x/evidence/run-1.zip',
        },
      },
    };

    const violations = findEvidenceBoundaryViolations(payload);
    expect(violations).toHaveLength(1);
    expect(violations[0].key).toBe('evidencePackUri');
    expect(violations[0].path).toBe('$.runtime.details.evidencePackUri');
  });

  it('throws BadRequestException when payload contains evidence keys', () => {
    const payload = {
      health: {
        raw_log_blob: '...',
      },
    };

    expect(() => assertNoOperationalEvidencePayload(payload, 'heartbeat report')).toThrow(
      BadRequestException,
    );
  });
});
