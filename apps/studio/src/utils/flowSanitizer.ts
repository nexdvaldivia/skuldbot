import type { FlowEdge, FlowNode } from "../types/flow";

const FALLBACK_START_X = 180;
const FALLBACK_START_Y = 120;
const FALLBACK_STEP_Y = 140;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeNodePosition(node: FlowNode, index: number): FlowNode {
  const x = node.position?.x;
  const y = node.position?.y;
  if (isFiniteNumber(x) && isFiniteNumber(y)) {
    return node;
  }

  return {
    ...node,
    position: {
      x: isFiniteNumber(x) ? x : FALLBACK_START_X,
      y: isFiniteNumber(y) ? y : FALLBACK_START_Y + index * FALLBACK_STEP_Y,
    },
  };
}

function sanitizeManualRoute(edge: FlowEdge): FlowEdge {
  const route = edge.data?.route;
  if (!route) return edge;
  if (route.manual !== true) return edge;
  if (isFiniteNumber(route.centerX) && isFiniteNumber(route.centerY)) return edge;
  if (!edge.data) return edge;

  return {
    ...edge,
    data: {
      ...edge.data,
      route: undefined,
    },
  };
}

export function sanitizeFlowGraph(nodes: FlowNode[], edges: FlowEdge[]): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  if (nodes.length === 0 && edges.length === 0) {
    return { nodes, edges };
  }

  const sanitizedNodes = nodes.map((node, index) => sanitizeNodePosition(node, index));
  const nodeIds = new Set(sanitizedNodes.map((node) => node.id));

  const seenEdgeIds = new Set<string>();
  const sanitizedEdges: FlowEdge[] = [];

  for (let index = 0; index < edges.length; index += 1) {
    const edge = sanitizeManualRoute(edges[index]);
    if (!edge.source || !edge.target) continue;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;

    const baseId = edge.id && edge.id.trim().length > 0
      ? edge.id
      : `${edge.source}-${edge.sourceHandle || "default"}-${edge.target}-${edge.targetHandle || "default"}`;

    let edgeId = baseId;
    let suffix = 1;
    while (seenEdgeIds.has(edgeId)) {
      edgeId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seenEdgeIds.add(edgeId);

    sanitizedEdges.push(edgeId === edge.id ? edge : { ...edge, id: edgeId });
  }

  return { nodes: sanitizedNodes, edges: sanitizedEdges };
}
