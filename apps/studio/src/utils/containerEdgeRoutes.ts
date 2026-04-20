import type { FlowEdge, FlowNode } from "../types/flow";
import { isContainerNodeType } from "../types/flow";

type Delta = { dx: number; dy: number };

function getParentId(node: FlowNode | undefined): string | undefined {
  if (!node) return undefined;
  const legacyParent = (node as FlowNode & { parentNode?: string }).parentNode;
  const parentId = node.parentId || legacyParent;
  if (!parentId || typeof parentId !== "string") return undefined;
  const normalized = parentId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isNodeInsideContainer(
  nodeId: string,
  containerId: string,
  byId: Map<string, FlowNode>
): boolean {
  let cursor = byId.get(nodeId);
  let guard = 0;

  while (cursor && guard < 128) {
    const parentId = getParentId(cursor);
    if (!parentId) return false;
    if (parentId === containerId) return true;
    cursor = byId.get(parentId);
    guard += 1;
  }

  return false;
}

function isNodeAnchoredToContainer(
  nodeId: string,
  containerId: string,
  byId: Map<string, FlowNode>
): boolean {
  if (nodeId === containerId) return true;
  return isNodeInsideContainer(nodeId, containerId, byId);
}

function getMovedContainerDeltas(
  beforeNodes: FlowNode[],
  afterNodes: FlowNode[],
): Map<string, Delta> {
  const beforeById = new Map(beforeNodes.map((node) => [node.id, node]));
  const afterById = new Map(afterNodes.map((node) => [node.id, node]));
  const deltas = new Map<string, Delta>();
  const containerIds = new Set<string>();

  for (const node of beforeNodes) {
    if (node.type === "groupNode" || isContainerNodeType(node.data.nodeType)) {
      containerIds.add(node.id);
    }
  }
  for (const node of afterNodes) {
    if (node.type === "groupNode" || isContainerNodeType(node.data.nodeType)) {
      containerIds.add(node.id);
    }
  }

  for (const containerId of containerIds) {
    const before = beforeById.get(containerId);
    const after = afterById.get(containerId);
    if (!before || !after) continue;

    const dx = after.position.x - before.position.x;
    const dy = after.position.y - before.position.y;

    if (Math.abs(dx) <= 0.01 && Math.abs(dy) <= 0.01) continue;
    deltas.set(containerId, { dx, dy });
  }

  return deltas;
}

export function shiftManualEdgeRoutesForMovedContainers(
  beforeNodes: FlowNode[],
  afterNodes: FlowNode[],
  edges: FlowEdge[],
  movedNodeIds: string[]
): { edges: FlowEdge[]; changed: boolean } {
  void movedNodeIds;
  if (edges.length === 0) {
    return { edges, changed: false };
  }

  const movedContainerDeltas = getMovedContainerDeltas(beforeNodes, afterNodes);
  if (movedContainerDeltas.size === 0) {
    return { edges, changed: false };
  }

  const afterById = new Map(afterNodes.map((node) => [node.id, node]));
  let changed = false;

  const shifted = edges.map((edge) => {
    const route = edge.data?.route;
    if (
      route?.manual !== true ||
      !Number.isFinite(route.centerX) ||
      !Number.isFinite(route.centerY)
    ) {
      return edge;
    }

    let shiftX = 0;
    let shiftY = 0;

    for (const [containerId, delta] of movedContainerDeltas.entries()) {
      const sourceAnchored = isNodeAnchoredToContainer(edge.source, containerId, afterById);
      const targetAnchored = isNodeAnchoredToContainer(edge.target, containerId, afterById);
      if (!sourceAnchored && !targetAnchored) continue;

      const weight = sourceAnchored && targetAnchored ? 1 : 0.5;
      shiftX += delta.dx * weight;
      shiftY += delta.dy * weight;
    }

    if (Math.abs(shiftX) > 0.01 || Math.abs(shiftY) > 0.01) {
      changed = true;
      return {
        ...edge,
        data: {
          ...(edge.data || {}),
          route: {
            centerX: route.centerX + shiftX,
            centerY: route.centerY + shiftY,
            manual: true,
          },
        },
      };
    }

    return edge;
  }) as FlowEdge[];

  return changed ? { edges: shifted, changed: true } : { edges, changed: false };
}
