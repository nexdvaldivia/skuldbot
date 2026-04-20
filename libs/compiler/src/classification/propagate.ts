import { CFG, isPseudo } from '../types/cfg';
import {
  Classification,
  ControlType,
  maxClass,
  maxOfClassifications,
  CLASSIFICATION_RANK,
} from '../types/classification';
import { NodeManifest, createUnknownNodeManifest } from '../types/manifest';
import { NodeClassInfo } from '../types/execution-plan';

/**
 * Propagate data classification through the CFG using worklist algorithm
 * Handles loops with fixed-point convergence
 */
export function propagateClassification(
  cfg: CFG,
  manifests: Record<string, NodeManifest>,
  injectedControls: Record<string, ControlType[]> = {},
): Record<string, NodeClassInfo> {
  const IN = new Map<string, Classification>();
  const OUT = new Map<string, Classification>();

  // Initialize all nodes to UNCLASSIFIED
  for (const id of cfg.nodeIds) {
    IN.set(id, 'UNCLASSIFIED');
    OUT.set(id, 'UNCLASSIFIED');
  }

  // Worklist algorithm
  const queue: string[] = Array.from(cfg.nodeIds);
  const MAX_ITERATIONS = cfg.nodeIds.size * 30;
  let iterations = 0;

  while (queue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const nodeId = queue.shift()!;
    const predecessors = cfg.pred.get(nodeId) ?? new Set<string>();

    // Compute new IN: join (max) of all predecessor OUTs
    let newIn: Classification = 'UNCLASSIFIED';
    for (const predId of predecessors) {
      newIn = maxClass(newIn, OUT.get(predId) ?? 'UNCLASSIFIED');
    }

    // Transfer function: compute OUT from IN
    const newOut = transfer(nodeId, newIn, cfg, manifests, injectedControls);

    // Check if changed
    const changed = newIn !== IN.get(nodeId) || newOut !== OUT.get(nodeId);

    IN.set(nodeId, newIn);
    OUT.set(nodeId, newOut);

    // If changed, add successors to queue
    if (changed) {
      const successors = cfg.succ.get(nodeId) ?? new Set<string>();
      for (const succId of successors) {
        queue.push(succId);
      }
    }
  }

  // Build result map (only for real nodes)
  const result: Record<string, NodeClassInfo> = {};
  for (const [id] of cfg.nodesById.entries()) {
    result[id] = {
      in: IN.get(id) ?? 'UNCLASSIFIED',
      out: OUT.get(id) ?? 'UNCLASSIFIED',
    };
  }

  return result;
}

/**
 * Transfer function: compute OUT classification from IN
 */
function transfer(
  nodeId: string,
  inClass: Classification,
  cfg: CFG,
  manifests: Record<string, NodeManifest>,
  injectedControls: Record<string, ControlType[]>,
): Classification {
  // Pseudo nodes pass through
  if (isPseudo(nodeId)) {
    return inClass;
  }

  const node = cfg.nodesById.get(nodeId);
  if (!node) {
    return inClass;
  }

  // Container nodes pass through (their effect is captured by internal edges)
  if (node.children?.length) {
    return inClass;
  }

  // Get manifest (or create conservative default)
  const manifest = manifests[node.type] ?? createUnknownNodeManifest(node.type);

  // Get max of what the node produces
  const producesMax = maxOfClassifications(
    manifest.data.produces,
    'UNCLASSIFIED',
  );

  let outClass: Classification;

  switch (manifest.data.propagation) {
    case 'NONE':
      // Output is only what the node produces, no inheritance
      outClass = producesMax;
      break;

    case 'DERIVE':
      // Node authoritatively sets output classification
      outClass = producesMax;
      break;

    case 'PASS_THROUGH':
      // Output is max of input and produces
      outClass = maxClass(inClass, producesMax);
      break;

    case 'TRANSFORM':
      // Start with pass-through, then potentially lower via controls
      outClass = maxClass(inClass, producesMax);
      outClass = applyTransformControls(
        outClass,
        injectedControls[nodeId] ?? [],
      );
      break;

    default:
      outClass = maxClass(inClass, producesMax);
  }

  return outClass;
}

/**
 * Apply transformation controls that can lower classification
 * (e.g., REDACT, TOKENIZE can convert PHI -> UNCLASSIFIED)
 */
function applyTransformControls(
  classification: Classification,
  controls: ControlType[],
): Classification {
  // Check for controls that can lower classification
  const hasRedact = controls.includes('REDACT');
  const hasTokenize = controls.includes('TOKENIZE');
  const hasEncrypt = controls.includes('ENCRYPT');

  // REDACT and TOKENIZE can reduce to UNCLASSIFIED
  if (hasRedact || hasTokenize) {
    if (classification === 'PHI' || classification === 'PII') {
      return 'UNCLASSIFIED';
    }
  }

  // ENCRYPT doesn't change classification but is noted
  // (data is still sensitive, just protected)

  return classification;
}

/**
 * Validate that node can consume the incoming classification
 */
export function validateConsumes(
  nodeId: string,
  inClass: Classification,
  manifests: Record<string, NodeManifest>,
  cfg: CFG,
): { valid: boolean; message?: string } {
  const node = cfg.nodesById.get(nodeId);
  if (!node) {
    return { valid: true };
  }

  const manifest = manifests[node.type] ?? createUnknownNodeManifest(node.type);
  const consumesSet = new Set(manifest.data.consumes);

  // Check if input classification is allowed
  const maxAllowed = maxOfClassifications(manifest.data.consumes, 'UNCLASSIFIED');

  if (CLASSIFICATION_RANK[inClass] > CLASSIFICATION_RANK[maxAllowed]) {
    return {
      valid: false,
      message: `Node ${node.type} cannot consume ${inClass} data (max allowed: ${maxAllowed})`,
    };
  }

  return { valid: true };
}
