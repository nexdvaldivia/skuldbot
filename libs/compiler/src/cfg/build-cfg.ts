import { BotDSL, DSLNode } from '../types/dsl';
import {
  CFG,
  Edge,
  ENTRY,
  END,
  DONE,
  NEXT_ITER,
  ROOT_SCOPE,
} from '../types/cfg';

/**
 * Build Control Flow Graph from DSL
 * Supports all container types with scope.ports (Option C)
 */
export function buildCFG(dsl: BotDSL): CFG {
  const edges: Edge[] = [];
  const nodeIds = new Set<string>();
  const nodesById = new Map<string, DSLNode>();
  const scopeOf = new Map<string, string>();

  // Create root scope pseudo nodes
  nodeIds.add(ENTRY(ROOT_SCOPE));
  nodeIds.add(END(ROOT_SCOPE));
  nodeIds.add(DONE(ROOT_SCOPE));
  scopeOf.set(ENTRY(ROOT_SCOPE), ROOT_SCOPE);
  scopeOf.set(END(ROOT_SCOPE), ROOT_SCOPE);
  scopeOf.set(DONE(ROOT_SCOPE), ROOT_SCOPE);

  // Index all nodes recursively
  indexNodesRecursive(dsl.nodes, nodesById, nodeIds, scopeOf, ROOT_SCOPE);

  // Build edges for root scope
  buildScopeEdges(ROOT_SCOPE, dsl.nodes, edges);

  // Connect entry to first node(s) - triggers or first node
  const entryNodes = pickRootEntryNodes(dsl);
  for (const id of entryNodes) {
    edges.push({ from: ENTRY(ROOT_SCOPE), fromPort: 'entry', to: id });
  }

  // Build container scopes recursively
  for (const node of dsl.nodes) {
    if (node.children?.length) {
      buildContainerScopes(node, ROOT_SCOPE, nodeIds, edges, scopeOf);
    }
  }

  // Compute adjacency maps
  const { succ, pred } = computeAdjacency(edges);

  return { nodeIds, edges, succ, pred, nodesById, scopeOf };
}

/**
 * Index all nodes recursively
 */
function indexNodesRecursive(
  nodes: DSLNode[],
  nodesById: Map<string, DSLNode>,
  nodeIds: Set<string>,
  scopeOf: Map<string, string>,
  scopeId: string,
): void {
  for (const node of nodes) {
    nodesById.set(node.id, node);
    nodeIds.add(node.id);
    scopeOf.set(node.id, scopeId);

    if (node.children?.length) {
      // Children belong to this container's scope
      indexNodesRecursive(node.children, nodesById, nodeIds, scopeOf, node.id);
    }
  }
}

/**
 * Pick entry nodes for root scope
 */
function pickRootEntryNodes(dsl: BotDSL): string[] {
  // If triggers are defined, use them
  if (dsl.triggers?.length) {
    return dsl.triggers;
  }

  // Otherwise, find nodes that are trigger types
  const triggerNodes = dsl.nodes.filter((n) => n.type.startsWith('trigger.'));
  if (triggerNodes.length > 0) {
    return triggerNodes.map((n) => n.id);
  }

  // Fallback: first node
  if (dsl.nodes.length > 0) {
    return [dsl.nodes[0].id];
  }

  return [];
}

/**
 * Build edges within a scope based on node outputs
 */
function buildScopeEdges(
  scopeId: string,
  nodes: DSLNode[],
  edges: Edge[],
): void {
  const endId = END(scopeId);

  for (const node of nodes) {
    // Success edge
    if (node.outputs?.success) {
      edges.push({
        from: node.id,
        fromPort: 'success',
        to: node.outputs.success === 'END' ? endId : node.outputs.success,
      });
    }

    // Error edge
    if (node.outputs?.error) {
      edges.push({
        from: node.id,
        fromPort: 'error',
        to: node.outputs.error === 'END' ? endId : node.outputs.error,
      });
    }

    // Done edge (for containers)
    if (node.outputs?.done) {
      edges.push({
        from: node.id,
        fromPort: 'done',
        to: node.outputs.done === 'END' ? endId : node.outputs.done,
      });
    }
  }
}

/**
 * Build container scopes with proper region handling
 */
function buildContainerScopes(
  container: DSLNode,
  parentScopeId: string,
  nodeIds: Set<string>,
  edges: Edge[],
  scopeOf: Map<string, string>,
): void {
  const cId = container.id;

  // Create pseudo nodes for this container
  nodeIds.add(ENTRY(cId));
  nodeIds.add(END(cId));
  nodeIds.add(DONE(cId));
  scopeOf.set(ENTRY(cId), cId);
  scopeOf.set(END(cId), cId);
  scopeOf.set(DONE(cId), cId);

  // Build edges among children
  if (container.children?.length) {
    buildScopeEdges(cId, container.children, edges);
  }

  const ports = container.scope?.ports ?? {};
  const getEntry = (portName: string): string | null =>
    ports[portName]?.entryId || null;

  // Calculate done target (where to go after container completes)
  const doneTarget = container.outputs.done
    ? container.outputs.done === 'END'
      ? END(parentScopeId)
      : container.outputs.done
    : END(parentScopeId);

  // Handle each container type
  switch (container.type) {
    case 'control.if': {
      const thenEntry = getEntry('then');
      const elseEntry = getEntry('else');

      if (thenEntry) {
        edges.push({ from: cId, fromPort: 'then', to: thenEntry });
      }
      if (elseEntry) {
        edges.push({ from: cId, fromPort: 'else', to: elseEntry });
      }

      // Rewrite END -> DONE
      rewriteTargets(END(cId), DONE(cId), edges);

      // DONE connects to outside
      edges.push({ from: DONE(cId), fromPort: 'done', to: doneTarget });
      break;
    }

    case 'control.try_catch': {
      const tryEntry = getEntry('try');
      const catchEntry = getEntry('catch');

      if (tryEntry) {
        edges.push({ from: cId, fromPort: 'try', to: tryEntry });
      }
      if (catchEntry) {
        edges.push({ from: cId, fromPort: 'catch', to: catchEntry });
        // Redirect try errors to catch
        redirectTryErrorsToCatch(container, catchEntry, edges);
      }

      // Rewrite END -> DONE
      rewriteTargets(END(cId), DONE(cId), edges);

      // DONE connects to outside
      edges.push({ from: DONE(cId), fromPort: 'done', to: doneTarget });
      break;
    }

    case 'control.loop':
    case 'control.while': {
      const bodyEntry = getEntry('body');

      // Add NEXT_ITER pseudo node
      nodeIds.add(NEXT_ITER(cId));
      scopeOf.set(NEXT_ITER(cId), cId);

      if (bodyEntry) {
        // Container -> body entry
        edges.push({ from: cId, fromPort: 'body', to: bodyEntry });

        // Body END -> NEXT_ITER (next iteration)
        rewriteTargets(END(cId), NEXT_ITER(cId), edges);

        // NEXT_ITER -> body entry (loop back)
        edges.push({ from: NEXT_ITER(cId), fromPort: 'next', to: bodyEntry });
      }

      // Container done (condition false / items exhausted) -> outside
      edges.push({ from: cId, fromPort: 'done', to: doneTarget });

      // DONE (from break) -> outside
      edges.push({ from: DONE(cId), fromPort: 'done', to: doneTarget });

      // Patch break/continue nodes
      patchBreakContinue(container, cId, edges);
      break;
    }

    case 'control.switch': {
      // Handle all case_* and default ports
      for (const portName of Object.keys(ports)) {
        if (portName.startsWith('case_') || portName === 'default') {
          const entry = getEntry(portName);
          if (entry) {
            edges.push({ from: cId, fromPort: portName, to: entry });
          }
        }
      }

      // Rewrite END -> DONE
      rewriteTargets(END(cId), DONE(cId), edges);
      edges.push({ from: DONE(cId), fromPort: 'done', to: doneTarget });
      break;
    }

    case 'control.parallel': {
      // Handle all branch_* ports
      for (const portName of Object.keys(ports)) {
        if (portName.startsWith('branch_')) {
          const entry = getEntry(portName);
          if (entry) {
            edges.push({ from: cId, fromPort: portName, to: entry });
          }
        }
      }

      // Rewrite END -> DONE (join barrier)
      rewriteTargets(END(cId), DONE(cId), edges);
      edges.push({ from: DONE(cId), fromPort: 'done', to: doneTarget });
      break;
    }

    default: {
      // Generic container: treat as single body region
      const bodyEntry = getEntry('body');
      if (bodyEntry) {
        edges.push({ from: cId, fromPort: 'body', to: bodyEntry });
      }
      rewriteTargets(END(cId), DONE(cId), edges);
      edges.push({ from: DONE(cId), fromPort: 'done', to: doneTarget });
    }
  }

  // Recursively handle nested containers
  for (const child of container.children ?? []) {
    if (child.children?.length) {
      buildContainerScopes(child, cId, nodeIds, edges, scopeOf);
    }
  }
}

/**
 * Rewrite edges targeting fromId to toId
 */
function rewriteTargets(fromId: string, toId: string, edges: Edge[]): void {
  for (const edge of edges) {
    if (edge.to === fromId) {
      edge.to = toId;
    }
  }
}

/**
 * Redirect unhandled try errors to catch entry
 */
function redirectTryErrorsToCatch(
  container: DSLNode,
  catchEntry: string,
  edges: Edge[],
): void {
  const tryIds = new Set(container.scope?.ports?.try?.nodeIds ?? []);
  const cDone = DONE(container.id);

  for (const edge of edges) {
    if (edge.fromPort !== 'error') continue;
    if (!tryIds.has(edge.from)) continue;

    // If error goes to container done (unhandled), redirect to catch
    if (edge.to === cDone) {
      edge.to = catchEntry;
    }
  }
}

/**
 * Patch break and continue nodes within a loop
 */
function patchBreakContinue(
  container: DSLNode,
  loopId: string,
  edges: Edge[],
): void {
  const bodyIds = new Set(container.scope?.ports?.body?.nodeIds ?? []);

  for (const child of container.children ?? []) {
    if (!bodyIds.has(child.id)) continue;

    if (child.type === 'control.break') {
      // Find and update success edge to DONE
      for (const edge of edges) {
        if (edge.from === child.id && edge.fromPort === 'success') {
          edge.to = DONE(loopId);
        }
      }
    }

    if (child.type === 'control.continue') {
      // Find and update success edge to NEXT_ITER
      for (const edge of edges) {
        if (edge.from === child.id && edge.fromPort === 'success') {
          edge.to = NEXT_ITER(loopId);
        }
      }
    }
  }
}

/**
 * Compute adjacency maps from edges
 */
function computeAdjacency(
  edges: Edge[],
): { succ: Map<string, Set<string>>; pred: Map<string, Set<string>> } {
  const succ = new Map<string, Set<string>>();
  const pred = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!succ.has(edge.from)) succ.set(edge.from, new Set());
    if (!pred.has(edge.to)) pred.set(edge.to, new Set());

    succ.get(edge.from)!.add(edge.to);
    pred.get(edge.to)!.add(edge.from);
  }

  return { succ, pred };
}
