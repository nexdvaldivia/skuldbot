import { FlowNode, isContainerNodeType } from "../types/flow";

const HEADER_HEIGHT = 52;
const DEFAULT_CONTAINER_WIDTH = 400;
const DEFAULT_CONTAINER_HEIGHT = 250;
const MIN_CONTAINER_WIDTH = 280;
const MIN_CONTAINER_HEIGHT = 180;
const CONTAINER_PADDING_X = 40;
const CONTAINER_PADDING_Y = 36;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getParentId(node: FlowNode): string | undefined {
  const legacyParent = (node as FlowNode & { parentNode?: string }).parentNode;
  const parentId = node.parentId || legacyParent;
  if (!parentId || typeof parentId !== "string") return undefined;
  const normalized = parentId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getNodeWidth(node: FlowNode): number {
  const direct = asNumber((node as FlowNode & { width?: number }).width);
  if (direct) return direct;
  const styleWidth = asNumber((node.style as Record<string, unknown> | undefined)?.width);
  if (styleWidth) return styleWidth;
  return isContainerNodeType(node.data.nodeType) ? DEFAULT_CONTAINER_WIDTH : 280;
}

function getNodeHeight(node: FlowNode): number {
  const direct = asNumber((node as FlowNode & { height?: number }).height);
  if (direct) return direct;
  const styleHeight = asNumber((node.style as Record<string, unknown> | undefined)?.height);
  if (styleHeight) return styleHeight;
  return isContainerNodeType(node.data.nodeType) ? DEFAULT_CONTAINER_HEIGHT : 120;
}

function ensureContainerStyle(node: FlowNode, requiredWidth: number, requiredHeight: number): boolean {
  const currentWidth = Math.max(
    MIN_CONTAINER_WIDTH,
    asNumber((node.style as Record<string, unknown> | undefined)?.width) || DEFAULT_CONTAINER_WIDTH
  );
  const currentHeight = Math.max(
    MIN_CONTAINER_HEIGHT,
    asNumber((node.style as Record<string, unknown> | undefined)?.height) || DEFAULT_CONTAINER_HEIGHT
  );

  const nextWidth = Math.max(currentWidth, requiredWidth, DEFAULT_CONTAINER_WIDTH);
  const nextHeight = Math.max(currentHeight, requiredHeight, DEFAULT_CONTAINER_HEIGHT);

  if (nextWidth === currentWidth && nextHeight === currentHeight) {
    return false;
  }

  node.style = {
    ...(node.style || {}),
    width: nextWidth,
    height: nextHeight,
  };
  return true;
}

function containerContainsPoint(container: FlowNode, x: number, y: number): boolean {
  const width = Math.max(
    MIN_CONTAINER_WIDTH,
    asNumber((container.style as Record<string, unknown> | undefined)?.width) || DEFAULT_CONTAINER_WIDTH
  );
  const height = Math.max(
    MIN_CONTAINER_HEIGHT,
    asNumber((container.style as Record<string, unknown> | undefined)?.height) || DEFAULT_CONTAINER_HEIGHT
  );

  return (
    x >= container.position.x &&
    x <= container.position.x + width &&
    y >= container.position.y + HEADER_HEIGHT &&
    y <= container.position.y + height
  );
}

function normalizeContainerMembership(nodes: FlowNode[]): { nodes: FlowNode[]; changed: boolean } {
  const cloned = nodes.map((node) => ({
    ...node,
    data: { ...node.data },
    ...(node.style ? { style: { ...node.style } } : {}),
  }));

  const byId = new Map(cloned.map((node) => [node.id, node]));
  const containerIds = new Set(
    cloned.filter((node) => node.type === "groupNode" || isContainerNodeType(node.data.nodeType)).map((node) => node.id)
  );
  if (containerIds.size === 0) {
    return { nodes, changed: false };
  }

  let changed = false;
  const childIdsByContainer = new Map<string, Set<string>>();

  // Seed with declared childNodes (valid IDs only).
  for (const containerId of containerIds) {
    const container = byId.get(containerId);
    const existingChildren = Array.isArray(container?.data.childNodes) ? container!.data.childNodes : [];
    const set = new Set<string>();
    for (const childId of existingChildren) {
      if (byId.has(childId) && childId !== containerId) {
        set.add(childId);
      } else {
        changed = true;
      }
    }
    childIdsByContainer.set(containerId, set);
  }

  // parentId relationship is authoritative when present.
  for (const node of cloned) {
    const parentId = getParentId(node);
    if (!parentId) continue;

    if (!containerIds.has(parentId) || parentId === node.id) {
      const mutable = byId.get(node.id)!;
      if (mutable.parentId || (mutable as FlowNode & { parentNode?: string }).parentNode || mutable.extent) {
        delete (mutable as FlowNode & { parentNode?: string }).parentNode;
        delete mutable.parentId;
        delete mutable.extent;
        if (mutable.zIndex !== undefined) {
          mutable.zIndex = undefined;
        }
        changed = true;
      }
      continue;
    }

    childIdsByContainer.get(parentId)?.add(node.id);

    const mutable = byId.get(node.id)!;
    if (mutable.extent !== "parent") {
      mutable.extent = "parent";
      changed = true;
    }
    if (mutable.zIndex === undefined || mutable.zIndex < 1000) {
      mutable.zIndex = 1000;
      changed = true;
    }
    if ((mutable as FlowNode & { parentNode?: string }).parentNode) {
      delete (mutable as FlowNode & { parentNode?: string }).parentNode;
      changed = true;
    }
  }

  // Backfill parentId for nodes declared as children but currently orphaned.
  for (const [containerId, childSet] of childIdsByContainer.entries()) {
    for (const childId of childSet) {
      const child = byId.get(childId);
      if (!child) continue;
      const currentParent = getParentId(child);

      if (!currentParent) {
        child.parentId = containerId;
        child.extent = "parent";
        child.zIndex = child.zIndex && child.zIndex >= 1000 ? child.zIndex : 1000;
        delete (child as FlowNode & { parentNode?: string }).parentNode;
        changed = true;
        continue;
      }

      if (currentParent !== containerId) {
        // Conflicting declaration; keep current parent and clean stale membership.
        childSet.delete(childId);
        changed = true;
      }
    }
  }

  // Persist normalized childNodes order.
  for (const containerId of containerIds) {
    const container = byId.get(containerId);
    if (!container) continue;
    const desiredChildren = Array.from(childIdsByContainer.get(containerId) || []);
    const currentChildren = Array.isArray(container.data.childNodes) ? container.data.childNodes : [];
    if (
      desiredChildren.length !== currentChildren.length ||
      desiredChildren.some((childId, idx) => currentChildren[idx] !== childId)
    ) {
      container.data.childNodes = desiredChildren;
      changed = true;
    }
  }

  // Auto-grow containers to visually encapsulate their children.
  for (const containerId of containerIds) {
    const container = byId.get(containerId);
    if (!container) continue;
    const childIds = Array.from(childIdsByContainer.get(containerId) || []);
    if (childIds.length === 0) {
      // Ensure at least default style if missing.
      const styleChanged = ensureContainerStyle(
        container,
        DEFAULT_CONTAINER_WIDTH,
        DEFAULT_CONTAINER_HEIGHT
      );
      changed = changed || styleChanged;
      continue;
    }

    let maxX = DEFAULT_CONTAINER_WIDTH;
    let maxY = DEFAULT_CONTAINER_HEIGHT;
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      const childWidth = getNodeWidth(child);
      const childHeight = getNodeHeight(child);
      maxX = Math.max(maxX, child.position.x + childWidth + CONTAINER_PADDING_X);
      maxY = Math.max(maxY, child.position.y + childHeight + CONTAINER_PADDING_Y);
    }

    const styleChanged = ensureContainerStyle(container, maxX, maxY);
    changed = changed || styleChanged;
  }

  return { nodes: changed ? cloned : nodes, changed };
}

export function reconcileContainerNodes(nodes: FlowNode[]): FlowNode[] {
  return normalizeContainerMembership(nodes).nodes;
}

export function attachMovedNodesToContainers(
  nodes: FlowNode[],
  movedNodeIds: string[]
): FlowNode[] {
  if (movedNodeIds.length === 0) return reconcileContainerNodes(nodes);

  const normalized = reconcileContainerNodes(nodes);
  const cloned = normalized.map((node) => ({
    ...node,
    data: { ...node.data },
    ...(node.style ? { style: { ...node.style } } : {}),
  }));
  const byId = new Map(cloned.map((node) => [node.id, node]));
  const containers = cloned.filter((node) => node.type === "groupNode" || isContainerNodeType(node.data.nodeType));

  let changed = false;

  for (const movedNodeId of movedNodeIds) {
    const node = byId.get(movedNodeId);
    if (!node) continue;
    if (isContainerNodeType(node.data.nodeType)) continue;
    if (getParentId(node)) continue;

    const nodeCenterX = node.position.x + getNodeWidth(node) / 2;
    const nodeCenterY = node.position.y + getNodeHeight(node) / 2;
    const candidate = containers
      .filter((container) => container.id !== node.id)
      .filter((container) => containerContainsPoint(container, nodeCenterX, nodeCenterY))
      .sort((a, b) => getNodeWidth(a) * getNodeHeight(a) - getNodeWidth(b) * getNodeHeight(b))[0];

    if (!candidate) continue;

    node.parentId = candidate.id;
    node.extent = "parent";
    node.zIndex = node.zIndex && node.zIndex >= 1000 ? node.zIndex : 1000;
    delete (node as FlowNode & { parentNode?: string }).parentNode;

    node.position = {
      x: node.position.x - candidate.position.x,
      y: node.position.y - candidate.position.y,
    };

    const existingChildren = Array.isArray(candidate.data.childNodes) ? candidate.data.childNodes : [];
    if (!existingChildren.includes(node.id)) {
      candidate.data.childNodes = [...existingChildren, node.id];
    }
    changed = true;
  }

  return changed ? reconcileContainerNodes(cloned) : normalized;
}

