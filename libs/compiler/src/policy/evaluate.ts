import { CFG, isPseudo } from '../types/cfg';
import {
  Classification,
  ControlType,
  CLASSIFICATION_RANK,
} from '../types/classification';
import { NodeManifest, createUnknownNodeManifest } from '../types/manifest';
import { NodeClassInfo } from '../types/execution-plan';
import {
  TenantPolicyPack,
  PolicyRule,
  PolicyCondition,
  PolicyResult,
  PolicyViolation,
} from '../types/policy';

/**
 * Evaluate tenant policies against the CFG and classification map
 * Returns blocks, warnings, and required controls per node
 */
export function evaluatePolicies(
  cfg: CFG,
  classMap: Record<string, NodeClassInfo>,
  manifests: Record<string, NodeManifest>,
  policyPack: TenantPolicyPack,
): PolicyResult {
  const result: PolicyResult = {
    blocks: [],
    warnings: [],
    requiresControls: {},
  };

  // Evaluate each real node (skip pseudo nodes)
  for (const [nodeId, node] of cfg.nodesById.entries()) {
    // Skip container nodes (their children are evaluated individually)
    if (node.children?.length) {
      continue;
    }

    const nodeClass = classMap[nodeId] ?? { in: 'UNCLASSIFIED', out: 'UNCLASSIFIED' };
    const manifest = manifests[node.type] ?? createUnknownNodeManifest(node.type);

    // Auto-inject controls based on manifest.controls.requires
    if (manifest.controls.requires.length > 0) {
      ensureControlsSet(result.requiresControls, nodeId);
      for (const control of manifest.controls.requires) {
        result.requiresControls[nodeId].add(control);
      }
    }

    // Evaluate each policy rule
    for (const rule of policyPack.rules) {
      const matches = evaluateCondition(
        rule.when,
        nodeId,
        node.type,
        nodeClass,
        manifest,
      );

      if (matches) {
        applyAction(result, nodeId, rule, manifest);
      }
    }

    // Auto-inject controls based on classification + capabilities
    autoInjectClassificationControls(
      result,
      nodeId,
      nodeClass,
      manifest,
      policyPack,
    );
  }

  return result;
}

/**
 * Evaluate if a condition matches for a node
 */
function evaluateCondition(
  when: PolicyCondition,
  nodeId: string,
  nodeType: string,
  nodeClass: NodeClassInfo,
  manifest: NodeManifest,
): boolean {
  // All conditions must match (AND logic)

  // Check data classification
  if (when.dataContains && when.dataContains.length > 0) {
    const hasMatchingClass = when.dataContains.some(
      (reqClass) =>
        CLASSIFICATION_RANK[nodeClass.in] >= CLASSIFICATION_RANK[reqClass] ||
        CLASSIFICATION_RANK[nodeClass.out] >= CLASSIFICATION_RANK[reqClass],
    );
    if (!hasMatchingClass) {
      return false;
    }
  }

  // Check node type
  if (when.nodeType && when.nodeType !== nodeType) {
    return false;
  }

  // Check node category
  if (when.nodeCategory && when.nodeCategory !== manifest.category) {
    return false;
  }

  // Check egress capability
  if (when.egress && when.egress !== manifest.capabilities.egress) {
    return false;
  }

  // Check writes capability
  if (when.writes && when.writes !== manifest.capabilities.writes) {
    return false;
  }

  // Check deletes capability
  if (when.deletes !== undefined && when.deletes !== manifest.capabilities.deletes) {
    return false;
  }

  // Check privileged access
  if (
    when.privilegedAccess !== undefined &&
    when.privilegedAccess !== manifest.capabilities.privilegedAccess
  ) {
    return false;
  }

  // Check capability (shorthand for any of the above)
  if (when.capability) {
    switch (when.capability) {
      case 'egress':
        if (manifest.capabilities.egress === 'NONE') return false;
        break;
      case 'writes':
        if (manifest.capabilities.writes === 'NONE') return false;
        break;
      case 'deletes':
        if (!manifest.capabilities.deletes) return false;
        break;
      case 'privilegedAccess':
        if (!manifest.capabilities.privilegedAccess) return false;
        break;
    }
  }

  // Check network domain matches
  if (when.networkDomainMatches) {
    const allowDomains = manifest.capabilities.network?.allowDomains ?? [];
    const regex = new RegExp(when.networkDomainMatches);
    const matchesDomain = allowDomains.some((domain) => regex.test(domain));
    if (!matchesDomain) {
      return false;
    }
  }

  return true;
}

/**
 * Apply the policy action to the result
 */
function applyAction(
  result: PolicyResult,
  nodeId: string,
  rule: PolicyRule,
  manifest: NodeManifest,
): void {
  const { then: action } = rule;
  const severity = action.severity ?? 'MEDIUM';

  const violation: PolicyViolation = {
    nodeId,
    ruleId: rule.id,
    message: action.message ?? rule.description ?? `Policy rule ${rule.id} triggered`,
    severity,
  };

  switch (action.action) {
    case 'BLOCK':
      result.blocks.push(violation);
      break;

    case 'WARN':
      result.warnings.push(violation);
      break;

    case 'REQUIRE_CONTROLS':
      // Only add controls that the node supports
      if (action.controls && action.controls.length > 0) {
        ensureControlsSet(result.requiresControls, nodeId);
        const supportedControls = new Set([
          ...manifest.controls.supports,
          ...manifest.controls.requires,
        ]);

        for (const control of action.controls) {
          // Add control if node supports it, or if it's a generic control
          // Generic controls: AUDIT_LOG, DLP_SCAN, HITL_APPROVAL
          if (
            supportedControls.has(control) ||
            isGenericControl(control)
          ) {
            result.requiresControls[nodeId].add(control);
          } else {
            // Node doesn't support required control -> warn
            result.warnings.push({
              nodeId,
              ruleId: rule.id,
              message: `Node ${manifest.type} does not support required control: ${control}`,
              severity: 'HIGH',
            });
          }
        }
      }
      break;
  }
}

/**
 * Auto-inject controls based on classification level
 */
function autoInjectClassificationControls(
  result: PolicyResult,
  nodeId: string,
  nodeClass: NodeClassInfo,
  manifest: NodeManifest,
  policyPack: TenantPolicyPack,
): void {
  const maxClass = CLASSIFICATION_RANK[nodeClass.in] >= CLASSIFICATION_RANK[nodeClass.out]
    ? nodeClass.in
    : nodeClass.out;

  // Always audit log for non-trivial data
  if (CLASSIFICATION_RANK[maxClass] >= CLASSIFICATION_RANK['PII']) {
    ensureControlsSet(result.requiresControls, nodeId);
    result.requiresControls[nodeId].add('AUDIT_LOG');
  }

  // PHI/PCI/CREDENTIALS: require log redaction
  if (CLASSIFICATION_RANK[maxClass] >= CLASSIFICATION_RANK['PHI']) {
    ensureControlsSet(result.requiresControls, nodeId);
    if (policyPack.defaults.logging.redact) {
      result.requiresControls[nodeId].add('LOG_REDACTION');
    }
  }

  // Artifacts with sensitive data: encrypt at rest
  if (
    CLASSIFICATION_RANK[maxClass] >= CLASSIFICATION_RANK['PII'] &&
    manifest.capabilities.writes !== 'NONE' &&
    policyPack.defaults.artifacts.encryptAtRest
  ) {
    ensureControlsSet(result.requiresControls, nodeId);
    result.requiresControls[nodeId].add('ARTIFACT_ENCRYPTION');
  }

  // CREDENTIALS: always require vault store
  if (maxClass === 'CREDENTIALS') {
    ensureControlsSet(result.requiresControls, nodeId);
    result.requiresControls[nodeId].add('VAULT_STORE');
  }

  // External egress with sensitive data: require DLP scan
  if (
    CLASSIFICATION_RANK[maxClass] >= CLASSIFICATION_RANK['PII'] &&
    manifest.capabilities.egress === 'EXTERNAL'
  ) {
    ensureControlsSet(result.requiresControls, nodeId);
    result.requiresControls[nodeId].add('DLP_SCAN');
  }
}

/**
 * Generic controls that can be applied to any node
 */
function isGenericControl(control: ControlType): boolean {
  const genericControls: ControlType[] = [
    'AUDIT_LOG',
    'DLP_SCAN',
    'HITL_APPROVAL',
    'LOG_REDACTION',
    'ARTIFACT_ENCRYPTION',
  ];
  return genericControls.includes(control);
}

/**
 * Ensure the controls set exists for a node
 */
function ensureControlsSet(
  requiresControls: Record<string, Set<ControlType>>,
  nodeId: string,
): void {
  if (!requiresControls[nodeId]) {
    requiresControls[nodeId] = new Set<ControlType>();
  }
}

/**
 * Check if compilation should be blocked based on policy result
 */
export function shouldBlockCompilation(result: PolicyResult): boolean {
  return result.blocks.length > 0;
}

/**
 * Get all controls for a node from policy result
 */
export function getNodeControls(
  result: PolicyResult,
  nodeId: string,
): ControlType[] {
  return Array.from(result.requiresControls[nodeId] ?? new Set());
}

/**
 * Merge multiple policy results
 */
export function mergePolicyResults(...results: PolicyResult[]): PolicyResult {
  const merged: PolicyResult = {
    blocks: [],
    warnings: [],
    requiresControls: {},
  };

  for (const result of results) {
    merged.blocks.push(...result.blocks);
    merged.warnings.push(...result.warnings);

    for (const [nodeId, controls] of Object.entries(result.requiresControls)) {
      ensureControlsSet(merged.requiresControls, nodeId);
      for (const control of controls) {
        merged.requiresControls[nodeId].add(control);
      }
    }
  }

  return merged;
}
