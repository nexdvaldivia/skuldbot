/**
 * Data classification levels
 * Dominance order: CREDENTIALS > PCI > PHI > PII > UNCLASSIFIED
 */
export type Classification =
  | 'UNCLASSIFIED'
  | 'PII'
  | 'PHI'
  | 'PCI'
  | 'CREDENTIALS';

export const CLASSIFICATION_RANK: Record<Classification, number> = {
  UNCLASSIFIED: 0,
  PII: 1,
  PHI: 2,
  PCI: 3,
  CREDENTIALS: 4,
};

/**
 * How classification propagates through a node
 */
export type PropagationMode =
  | 'NONE' // out = produces (no inheritance)
  | 'PASS_THROUGH' // out = max(in, produces)
  | 'DERIVE' // out = produces (authoritative)
  | 'TRANSFORM'; // out can be lowered by controls (redact/tokenize)

/**
 * Egress mode for node capabilities
 */
export type EgressMode = 'NONE' | 'INTERNAL' | 'EXTERNAL';

/**
 * Write mode for node capabilities
 */
export type WriteMode = 'NONE' | 'INTERNAL' | 'EXTERNAL';

/**
 * Control types that can be required or supported by nodes
 */
export type ControlType =
  | 'AUDIT_LOG'
  | 'ARTIFACT_ENCRYPTION'
  | 'LOG_REDACTION'
  | 'DLP_SCAN'
  | 'HITL_APPROVAL'
  | 'MASK'
  | 'REDACT'
  | 'PSEUDONYMIZE'
  | 'HASH'
  | 'GENERALIZE'
  | 'ENCRYPT'
  | 'TOKENIZE'
  | 'VAULT_STORE'
  | 'PROMPT_GUARD'
  | 'RATE_LIMIT'
  | 'TIMEOUT_GUARD';

/**
 * Helper functions for classification
 */
export function maxClass(a: Classification, b: Classification): Classification {
  return CLASSIFICATION_RANK[a] >= CLASSIFICATION_RANK[b] ? a : b;
}

export function maxOfClassifications(
  list: Classification[],
  fallback: Classification = 'UNCLASSIFIED',
): Classification {
  return list.reduce((acc, c) => maxClass(acc, c), fallback);
}
