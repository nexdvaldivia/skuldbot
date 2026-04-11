import { CFG, isPseudo, END, ROOT_SCOPE } from '../types/cfg';
import { ControlType } from '../types/classification';
import { NodeManifest, createUnknownNodeManifest } from '../types/manifest';
import {
  ExecutionPlan,
  ExecutionStep,
  Jump,
  NodeClassInfo,
} from '../types/execution-plan';
import { PolicyResult } from '../types/policy';
import { getNodeControls } from '../policy/evaluate';

/**
 * Options for compiling an execution plan
 */
export interface CompileOptions {
  runId: string;
  tenantId: string;
  botId: string;
  botVersion: string;
}

/**
 * Compile CFG + policies into an ExecutionPlan for the runner
 */
export function compileExecutionPlan(
  cfg: CFG,
  classMap: Record<string, NodeClassInfo>,
  manifests: Record<string, NodeManifest>,
  policyResult: PolicyResult,
  options: CompileOptions,
): ExecutionPlan {
  const steps: ExecutionStep[] = [];
  const stepIdMap = new Map<string, string>(); // nodeId -> stepId

  // Assign step IDs to real nodes only
  let stepCounter = 0;
  for (const nodeId of cfg.nodeIds) {
    if (isPseudo(nodeId)) continue;
    const node = cfg.nodesById.get(nodeId);
    if (!node) continue;

    // Skip container nodes - they don't become steps themselves
    if (node.children?.length) continue;

    stepIdMap.set(nodeId, `step_${stepCounter++}`);
  }

  // Build steps
  for (const [nodeId, stepId] of stepIdMap.entries()) {
    const node = cfg.nodesById.get(nodeId)!;
    const manifest = manifests[node.type] ?? createUnknownNodeManifest(node.type);
    const nodeClass = classMap[nodeId] ?? { in: 'UNCLASSIFIED', out: 'UNCLASSIFIED' };
    const controls = getNodeControls(policyResult, nodeId);

    // Resolve config expressions (placeholder - actual resolution at runtime)
    const resolvedConfig = resolveConfig(node.config, node.type);

    // Build jumps from CFG edges
    const jumps = buildJumps(nodeId, cfg, stepIdMap);

    const step: ExecutionStep = {
      stepId,
      nodeId,
      type: node.type,
      resolvedConfig,
      controls,
      classification: {
        in: nodeClass.in,
        out: nodeClass.out,
      },
      runtime: {
        idempotent: manifest.runtime.idempotent,
        retry: manifest.runtime.defaultRetry,
        timeoutMs: manifest.runtime.timeoutMs,
      },
      jumps,
    };

    steps.push(step);
  }

  // Find entry step
  const entryStepId = findEntryStep(cfg, stepIdMap);

  return {
    planVersion: '1.0',
    run: {
      runId: options.runId,
      tenantId: options.tenantId,
      botId: options.botId,
      botVersion: options.botVersion,
      startedAt: new Date().toISOString(),
    },
    entryStepId,
    steps,
    policy: {
      blocks: policyResult.blocks,
      warnings: policyResult.warnings,
    },
  };
}

/**
 * Build jumps from CFG edges for a node
 */
function buildJumps(
  nodeId: string,
  cfg: CFG,
  stepIdMap: Map<string, string>,
): Jump[] {
  const jumps: Jump[] = [];
  const seenPorts = new Set<string>();

  // Find all edges from this node
  for (const edge of cfg.edges) {
    if (edge.from !== nodeId) continue;

    const port = edge.fromPort;
    if (seenPorts.has(port)) continue;
    seenPorts.add(port);

    // Resolve target: skip pseudo-nodes to find the actual next step
    const targetStepId = resolveJumpTarget(edge.to, cfg, stepIdMap);

    jumps.push({
      on: port,
      toStepId: targetStepId,
    });
  }

  // Ensure at least success and error jumps exist
  if (!seenPorts.has('success')) {
    jumps.push({ on: 'success', toStepId: 'END' });
  }
  if (!seenPorts.has('error')) {
    jumps.push({ on: 'error', toStepId: 'END' });
  }

  return jumps;
}

/**
 * Resolve jump target, following pseudo-nodes until we hit a real step or END
 */
function resolveJumpTarget(
  targetId: string,
  cfg: CFG,
  stepIdMap: Map<string, string>,
  visited = new Set<string>(),
): string | 'END' {
  // Prevent infinite loops
  if (visited.has(targetId)) {
    return 'END';
  }
  visited.add(targetId);

  // Check if it's a real node with a step
  if (stepIdMap.has(targetId)) {
    return stepIdMap.get(targetId)!;
  }

  // If it's an END pseudo-node, return END
  if (targetId.startsWith('__END__:') || targetId.startsWith('__DONE__:')) {
    // Check if this is a nested scope END
    // If so, follow to the container's done target
    const scope = extractScope(targetId);
    if (scope !== ROOT_SCOPE) {
      const container = cfg.nodesById.get(scope);
      if (container?.outputs?.done) {
        const doneTarget = container.outputs.done === 'END'
          ? END(getParentScope(scope, cfg))
          : container.outputs.done;
        return resolveJumpTarget(doneTarget, cfg, stepIdMap, visited);
      }
    }
    return 'END';
  }

  // If it's NEXT_ITER, follow to the body entry
  if (targetId.startsWith('__NEXT_ITER__:')) {
    const scope = extractScope(targetId);
    const container = cfg.nodesById.get(scope);
    const bodyEntry = container?.scope?.ports?.body?.entryId;
    if (bodyEntry) {
      return resolveJumpTarget(bodyEntry, cfg, stepIdMap, visited);
    }
    return 'END';
  }

  // If it's ENTRY, follow to first real node
  if (targetId.startsWith('__ENTRY__:')) {
    const successors = cfg.succ.get(targetId);
    if (successors && successors.size > 0) {
      const first = Array.from(successors)[0];
      return resolveJumpTarget(first, cfg, stepIdMap, visited);
    }
    return 'END';
  }

  // Container node - follow to its entry point
  const container = cfg.nodesById.get(targetId);
  if (container?.children?.length) {
    // Find the first port entry
    const ports = container.scope?.ports ?? {};
    for (const portName of Object.keys(ports)) {
      const entry = ports[portName]?.entryId;
      if (entry) {
        return resolveJumpTarget(entry, cfg, stepIdMap, visited);
      }
    }
    // No ports, check successors
    const successors = cfg.succ.get(targetId);
    if (successors && successors.size > 0) {
      const first = Array.from(successors)[0];
      return resolveJumpTarget(first, cfg, stepIdMap, visited);
    }
  }

  return 'END';
}

/**
 * Extract scope ID from pseudo-node ID
 */
function extractScope(pseudoId: string): string {
  const parts = pseudoId.split(':');
  return parts[1] || ROOT_SCOPE;
}

/**
 * Get parent scope of a scope
 */
function getParentScope(scopeId: string, cfg: CFG): string {
  if (scopeId === ROOT_SCOPE) return ROOT_SCOPE;
  const parentScope = cfg.scopeOf.get(scopeId);
  return parentScope || ROOT_SCOPE;
}

/**
 * Find the entry step ID
 */
function findEntryStep(
  cfg: CFG,
  stepIdMap: Map<string, string>,
): string {
  // Follow from ROOT ENTRY
  const entrySuccessors = cfg.succ.get(`__ENTRY__:${ROOT_SCOPE}`);
  if (entrySuccessors && entrySuccessors.size > 0) {
    const first = Array.from(entrySuccessors)[0];
    const resolved = resolveJumpTarget(first, cfg, stepIdMap);
    if (resolved !== 'END') {
      return resolved;
    }
  }

  // Fallback: first step
  if (stepIdMap.size > 0) {
    return Array.from(stepIdMap.values())[0];
  }

  return 'END';
}

/**
 * Resolve config expressions (placeholder for actual implementation)
 * In production, this would:
 * - Resolve ${var} expressions
 * - Expand credentials references
 * - Validate required fields
 */
function resolveConfig(
  config: Record<string, any>,
  nodeType: string,
): Record<string, any> {
  // For now, pass through. Expression resolution happens at runtime
  return { ...config };
}

/**
 * Validate that the execution plan is executable
 */
export function validateExecutionPlan(plan: ExecutionPlan): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for blocks
  if (plan.policy.blocks.length > 0) {
    for (const block of plan.policy.blocks) {
      errors.push(`Policy block: ${block.message} (node: ${block.nodeId})`);
    }
  }

  // Check entry step exists
  if (plan.entryStepId === 'END' && plan.steps.length > 0) {
    errors.push('No entry step found but plan has steps');
  }

  // Check all jump targets are valid
  const stepIds = new Set(plan.steps.map((s) => s.stepId));
  for (const step of plan.steps) {
    for (const jump of step.jumps) {
      if (jump.toStepId !== 'END' && !stepIds.has(jump.toStepId)) {
        errors.push(`Step ${step.stepId} has invalid jump to ${jump.toStepId}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Serialize execution plan to JSON (for storage/transport)
 */
export function serializeExecutionPlan(plan: ExecutionPlan): string {
  return JSON.stringify(plan, null, 2);
}

/**
 * Deserialize execution plan from JSON
 */
export function deserializeExecutionPlan(json: string): ExecutionPlan {
  return JSON.parse(json) as ExecutionPlan;
}

/**
 * Calculate a hash of the execution plan for caching/comparison
 */
export function hashExecutionPlan(plan: ExecutionPlan): string {
  // Create a deterministic string representation
  const content = JSON.stringify({
    steps: plan.steps.map((s) => ({
      nodeId: s.nodeId,
      type: s.type,
      config: s.resolvedConfig,
      controls: s.controls.sort(),
      jumps: s.jumps.sort((a, b) => a.on.localeCompare(b.on)),
    })),
    entryStepId: plan.entryStepId,
  });

  // Simple hash function (in production, use crypto.createHash)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
