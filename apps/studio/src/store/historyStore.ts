import { create } from "zustand";
import { FlowNode, FlowEdge } from "../types/flow";

interface HistorySnapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
  timestamp: number;
}

interface ClipboardData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface HistoryState {
  // History stack
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  maxHistory: number;

  // Clipboard
  clipboard: ClipboardData | null;

  // Actions
  pushState: (nodes: FlowNode[], edges: FlowEdge[]) => void;
  undo: () => HistorySnapshot | null;
  redo: () => HistorySnapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;

  // Clipboard actions
  copy: (nodes: FlowNode[], edges: FlowEdge[]) => void;
  paste: () => ClipboardData | null;
  hasClipboard: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  maxHistory: 100,
  clipboard: null,

  pushState: (nodes, edges) => {
    const snapshot: HistorySnapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      timestamp: Date.now(),
    };

    set((state) => {
      const newPast = [...state.past, snapshot];
      // Limit history size
      if (newPast.length > state.maxHistory) {
        newPast.shift();
      }
      return {
        past: newPast,
        future: [], // Clear future on new action
      };
    });
  },

  undo: () => {
    const state = get();
    if (state.past.length === 0) return null;

    const newPast = [...state.past];
    const previousState = newPast.pop()!;

    set({
      past: newPast,
      future: [previousState, ...state.future],
    });

    // Return the state to restore (one before the popped one)
    if (newPast.length > 0) {
      return newPast[newPast.length - 1];
    }
    // Return empty state if no more history
    return { nodes: [], edges: [], timestamp: 0 };
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return null;

    const [nextState, ...newFuture] = state.future;

    set({
      past: [...state.past, nextState],
      future: newFuture,
    });

    return nextState;
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  clearHistory: () => {
    set({
      past: [],
      future: [],
    });
  },

  copy: (nodes, edges) => {
    if (nodes.length === 0) return;

    // Get IDs of selected nodes
    const nodeIds = new Set(nodes.map((n) => n.id));

    // Only copy edges that connect selected nodes
    const relevantEdges = edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    set({
      clipboard: {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(relevantEdges)),
      },
    });
  },

  paste: () => {
    return get().clipboard;
  },

  hasClipboard: () => get().clipboard !== null && get().clipboard!.nodes.length > 0,
}));

// Helper to generate new IDs for pasted nodes
export function generatePasteIds(
  clipboard: ClipboardData,
  offset: { x: number; y: number } = { x: 50, y: 50 }
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const idMap = new Map<string, string>();
  const timestamp = Date.now();

  // Generate new IDs for nodes
  const newNodes = clipboard.nodes.map((node, index) => {
    const newId = `${node.data.nodeType}-${timestamp}-${index}`;
    idMap.set(node.id, newId);

    return {
      ...node,
      id: newId,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      selected: true,
    };
  });

  // Update edge references
  const newEdges = clipboard.edges.map((edge) => {
    const newSource = idMap.get(edge.source)!;
    const newTarget = idMap.get(edge.target)!;
    const newId = `${newSource}-${edge.sourceHandle}-${newTarget}`;

    return {
      ...edge,
      id: newId,
      source: newSource,
      target: newTarget,
    };
  });

  return { nodes: newNodes, edges: newEdges };
}

// Helper to duplicate selected nodes
export function duplicateNodes(
  selectedNodes: FlowNode[],
  allEdges: FlowEdge[],
  offset: { x: number; y: number } = { x: 50, y: 50 }
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const idMap = new Map<string, string>();
  const timestamp = Date.now();
  const nodeIds = new Set(selectedNodes.map((n) => n.id));

  // Generate new IDs for nodes
  const newNodes = selectedNodes.map((node, index) => {
    const newId = `${node.data.nodeType}-${timestamp}-${index}`;
    idMap.set(node.id, newId);

    return {
      ...node,
      id: newId,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      selected: false,
    };
  });

  // Only copy edges between selected nodes
  const relevantEdges = allEdges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  // Update edge references
  const newEdges = relevantEdges.map((edge) => {
    const newSource = idMap.get(edge.source)!;
    const newTarget = idMap.get(edge.target)!;
    const newId = `${newSource}-${edge.sourceHandle}-${newTarget}`;

    return {
      ...edge,
      id: newId,
      source: newSource,
      target: newTarget,
    };
  });

  return { nodes: newNodes, edges: newEdges };
}
