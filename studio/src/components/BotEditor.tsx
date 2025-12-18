import { useCallback, useRef, useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  NodeTypes,
  EdgeTypes,
  BackgroundVariant,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";

import { useProjectStore } from "../store/projectStore";
import { useTabsStore } from "../store/tabsStore";
import { useFlowStore, getDraggedNodeData, clearDraggedNodeData, getPendingNodeTemplate, clearPendingNodeTemplate } from "../store/flowStore";
import { useHistoryStore, generatePasteIds, duplicateNodes } from "../store/historyStore";
import { useToastStore } from "../store/toastStore";
import CustomNode from "./CustomNode";
import AnimatedEdge from "./AnimatedEdge";
import EmptyState from "./EmptyState";
import { FlowNode, FlowEdge } from "../types/flow";

const nodeTypes: NodeTypes = {
  customNode: CustomNode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

export default function BotEditor() {
  const { bots, activeBotId, updateActiveBotNodes, updateActiveBotEdges, saveBot } = useProjectStore();
  const { setTabDirty } = useTabsStore();
  const { setSelectedNode, selectedNode } = useFlowStore();
  const { pushState, undo, redo, canUndo, canRedo, copy, paste, hasClipboard } = useHistoryStore();
  const toast = useToastStore();
  const { screenToFlowPosition } = useReactFlow();
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  const [hasPendingNode, setHasPendingNode] = useState(false);
  const isUndoRedoRef = useRef(false);

  // Get active bot
  const activeBot = activeBotId ? bots.get(activeBotId) : null;
  const nodes = activeBot?.nodes || [];
  const edges = activeBot?.edges || [];

  // Keep refs in sync
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Listen for pending node changes
  useEffect(() => {
    const handlePendingChange = (e: CustomEvent) => {
      setHasPendingNode(!!e.detail);
    };
    window.addEventListener('pendingNodeChange', handlePendingChange as EventListener);
    return () => window.removeEventListener('pendingNodeChange', handlePendingChange as EventListener);
  }, []);

  // Mark tab as dirty and push to history
  const markDirty = useCallback(() => {
    if (activeBotId) {
      setTabDirty(`bot-${activeBotId}`, true);
    }
  }, [activeBotId, setTabDirty]);

  // Push state to history (for undo/redo)
  const pushToHistory = useCallback(() => {
    if (!isUndoRedoRef.current) {
      pushState(nodesRef.current, edgesRef.current);
    }
  }, [pushState]);

  // Handle undo
  const handleUndo = useCallback(() => {
    if (!canUndo()) return;
    isUndoRedoRef.current = true;
    const previousState = undo();
    if (previousState) {
      updateActiveBotNodes(previousState.nodes);
      updateActiveBotEdges(previousState.edges);
      markDirty();
    }
    isUndoRedoRef.current = false;
  }, [canUndo, undo, updateActiveBotNodes, updateActiveBotEdges, markDirty]);

  // Handle redo
  const handleRedo = useCallback(() => {
    if (!canRedo()) return;
    isUndoRedoRef.current = true;
    const nextState = redo();
    if (nextState) {
      updateActiveBotNodes(nextState.nodes);
      updateActiveBotEdges(nextState.edges);
      markDirty();
    }
    isUndoRedoRef.current = false;
  }, [canRedo, redo, updateActiveBotNodes, updateActiveBotEdges, markDirty]);

  // Handle copy
  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    copy(selectedNodes, edges);
    toast.success("Copied", `${selectedNodes.length} node(s) copied`);
  }, [nodes, edges, copy, toast]);

  // Handle paste
  const handlePaste = useCallback(() => {
    if (!hasClipboard()) return;
    const clipboardData = paste();
    if (!clipboardData) return;

    pushToHistory();
    const { nodes: newNodes, edges: newEdges } = generatePasteIds(clipboardData);

    // Deselect all existing nodes
    const deselectedNodes = nodes.map((n) => ({ ...n, selected: false }));

    updateActiveBotNodes([...deselectedNodes, ...newNodes]);
    updateActiveBotEdges([...edges, ...newEdges]);
    markDirty();
    toast.success("Pasted", `${newNodes.length} node(s) pasted`);
  }, [hasClipboard, paste, pushToHistory, nodes, edges, updateActiveBotNodes, updateActiveBotEdges, markDirty, toast]);

  // Handle duplicate (Ctrl+D)
  const handleDuplicate = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    pushToHistory();
    const { nodes: newNodes, edges: newEdges } = duplicateNodes(selectedNodes, edges);

    // Deselect original nodes, select duplicates
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));

    updateActiveBotNodes([...updatedNodes, ...newNodes.map((n) => ({ ...n, selected: true }))]);
    updateActiveBotEdges([...edges, ...newEdges]);
    markDirty();
  }, [nodes, edges, pushToHistory, updateActiveBotNodes, updateActiveBotEdges, markDirty]);

  // Handle save (Ctrl+S)
  const handleSave = useCallback(async () => {
    if (activeBotId) {
      await saveBot(activeBotId);
      setTabDirty(`bot-${activeBotId}`, false);
    }
  }, [activeBotId, saveBot, setTabDirty]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const targetTag = target?.tagName?.toLowerCase();
      const isTyping = targetTag === 'input' || targetTag === 'textarea' ||
                       target?.getAttribute("contenteditable") === "true";

      // Allow Ctrl+S even when typing
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Skip other shortcuts when typing
      if (isTyping) return;

      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl/Cmd + C = Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      // Ctrl/Cmd + V = Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Ctrl/Cmd + D = Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      // Ctrl/Cmd + A = Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const allSelected = nodes.map((n) => ({ ...n, selected: true }));
        updateActiveBotNodes(allSelected);
        return;
      }

      // Escape = Deselect all
      if (e.key === 'Escape') {
        const allDeselected = nodes.map((n) => ({ ...n, selected: false }));
        updateActiveBotNodes(allDeselected);
        setSelectedNode(null);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, handleSave, nodes, updateActiveBotNodes, setSelectedNode]);

  // WebKit/Tauri workaround: drop event doesn't fire, so we use dragend event
  // Listen globally for dragend and check if mouse is over the canvas
  useEffect(() => {
    const wrapper = flowWrapperRef.current;
    if (!wrapper) return;

    const createNodeFromDrag = (clientX: number, clientY: number) => {
      const nodeData = getDraggedNodeData();
      if (!nodeData) return false;

      // Clear immediately to prevent duplicate creation
      clearDraggedNodeData();

      const rect = wrapper.getBoundingClientRect();
      // Check if mouse is inside the canvas
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return false;
      }

      pushToHistory();

      const position = screenToFlowPosition({ x: clientX, y: clientY });

      const newNode: FlowNode = {
        id: `${nodeData.type}-${Date.now()}`,
        type: "customNode",
        position,
        data: {
          label: nodeData.label,
          nodeType: nodeData.type,
          config: { ...(nodeData.defaultConfig || {}) },
          category: nodeData.category,
          icon: nodeData.icon,
        },
      };

      updateActiveBotNodes([...nodesRef.current, newNode]);
      markDirty();
      return true;
    };

    // Track last mouse position during drag
    let lastMousePos = { x: 0, y: 0 };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      lastMousePos = { x: event.clientX, y: event.clientY };
    };

    // Listen for dragend on window - this fires when drag ends anywhere
    const handleDragEnd = (event: DragEvent) => {
      // Use the last known mouse position since dragend might not have accurate coords
      const x = event.clientX || lastMousePos.x;
      const y = event.clientY || lastMousePos.y;

      if (getDraggedNodeData()) {
        createNodeFromDrag(x, y);
      }
    };

    // Also try native drop (works in some environments)
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      createNodeFromDrag(event.clientX, event.clientY);
    };

    wrapper.addEventListener("dragover", handleDragOver, true);
    wrapper.addEventListener("drop", handleDrop, true);
    window.addEventListener("dragend", handleDragEnd, true);

    return () => {
      wrapper.removeEventListener("dragover", handleDragOver, true);
      wrapper.removeEventListener("drop", handleDrop, true);
      window.removeEventListener("dragend", handleDragEnd, true);
    };
  }, [screenToFlowPosition, updateActiveBotNodes, markDirty, pushToHistory]);

  // Handle delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const target = e.target as HTMLElement;
      const activeElement = document.activeElement;
      const targetTag = target?.tagName?.toLowerCase();
      const activeTag = activeElement?.tagName?.toLowerCase();

      const isTyping = targetTag === 'input' || targetTag === 'textarea' ||
                       activeTag === 'input' || activeTag === 'textarea' ||
                       target?.getAttribute("contenteditable") === "true";

      const isInModal = target?.closest('[data-properties-panel]') !== null ||
                        activeElement?.closest('[data-properties-panel]') !== null;

      const modalExists = document.getElementById('node-config-panel') !== null ||
                          document.querySelector('[data-properties-panel]') !== null;

      const configPanelOpen = selectedNode !== null;

      if (isTyping || isInModal || modalExists || configPanelOpen) return;

      const selectedNodes = nodes.filter((n) => n.selected);
      if (selectedNodes.length > 0) {
        pushToHistory();
        const selectedIds = selectedNodes.map((n) => n.id);
        updateActiveBotNodes(nodes.filter((n) => !selectedIds.includes(n.id)));
        updateActiveBotEdges(edges.filter((e) => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)));
        setSelectedNode(null);
        markDirty();
      }

      const selectedEdges = edges.filter((e) => e.selected);
      if (selectedEdges.length > 0) {
        pushToHistory();
        const selectedEdgeIds = selectedEdges.map((e) => e.id);
        updateActiveBotEdges(edges.filter((e) => !selectedEdgeIds.includes(e.id)));
        markDirty();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, updateActiveBotNodes, updateActiveBotEdges, setSelectedNode, selectedNode, markDirty, pushToHistory]);

  // Track if we need to push history on node drag end
  const isDraggingRef = useRef(false);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];

      // Check for drag start
      const hasDragStart = changes.some(c => c.type === 'position' && c.dragging === true);
      if (hasDragStart && !isDraggingRef.current) {
        isDraggingRef.current = true;
        pushToHistory();
      }

      // Check for drag end
      const hasDragEnd = changes.some(c => c.type === 'position' && c.dragging === false);
      if (hasDragEnd) {
        isDraggingRef.current = false;
      }

      updateActiveBotNodes(updatedNodes);

      // Check if any change is not just selection
      const hasRealChange = changes.some(c => c.type !== 'select');
      if (hasRealChange) {
        markDirty();
      }
    },
    [nodes, updateActiveBotNodes, markDirty, pushToHistory]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Push history for edge removal
      const hasRemoval = changes.some(c => c.type === 'remove');
      if (hasRemoval) {
        pushToHistory();
      }

      const updatedEdges = applyEdgeChanges(changes, edges) as FlowEdge[];
      updateActiveBotEdges(updatedEdges);

      const hasRealChange = changes.some(c => c.type !== 'select');
      if (hasRealChange) {
        markDirty();
      }
    },
    [edges, updateActiveBotEdges, markDirty, pushToHistory]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      pushToHistory();

      const edge: FlowEdge = {
        id: `${connection.source}-${connection.sourceHandle}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: "animated",
        data: {
          edgeType: connection.sourceHandle as "success" | "error",
        },
      };

      const newEdges = addEdge(edge, edges) as FlowEdge[];
      updateActiveBotEdges(newEdges);
      markDirty();
    },
    [edges, updateActiveBotEdges, markDirty, pushToHistory]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => {
      setSelectedNode(node);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    const pendingNode = getPendingNodeTemplate();
    if (pendingNode) {
      pushToHistory();

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: FlowNode = {
        id: `${pendingNode.type}-${Date.now()}`,
        type: "customNode",
        position,
        data: {
          label: pendingNode.label,
          nodeType: pendingNode.type,
          config: { ...(pendingNode.defaultConfig || {}) },
          category: pendingNode.category,
          icon: pendingNode.icon,
        },
      };

      updateActiveBotNodes([...nodes, newNode]);
      markDirty();
      clearPendingNodeTemplate();
      return;
    }

    setSelectedNode(null);
  }, [setSelectedNode, screenToFlowPosition, nodes, updateActiveBotNodes, markDirty, pushToHistory]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Check if node was already created by dragend workaround
      const nodeData = getDraggedNodeData();
      if (!nodeData) {
        // Already processed by dragend or no data
        return;
      }

      pushToHistory();

      const reactFlowBounds = flowWrapperRef.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: FlowNode = {
        id: `${nodeData.type}-${Date.now()}`,
        type: "customNode",
        position,
        data: {
          label: nodeData.label,
          nodeType: nodeData.type,
          config: { ...(nodeData.defaultConfig || {}) },
          category: nodeData.category,
          icon: nodeData.icon,
        },
      };

      updateActiveBotNodes([...nodesRef.current, newNode]);
      markDirty();
      clearDraggedNodeData();
    },
    [screenToFlowPosition, updateActiveBotNodes, markDirty, pushToHistory]
  );

  return (
    <div
      ref={flowWrapperRef}
      className={`w-full h-full relative ${hasPendingNode ? 'cursor-crosshair' : ''}`}
      style={{ width: '100%', height: '100%', minHeight: '100%', backgroundColor: '#f1f5f9' }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "animated",
        }}
        connectionLineStyle={{
          strokeWidth: 2,
          strokeDasharray: "6 4",
        }}
      >
        <Background
          color="#cbd5e1"
          gap={20}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <Controls
          className="!bottom-4 !left-4 !shadow-sm !border !rounded-lg !bg-card"
          showInteractive={false}
        />
        <MiniMap
          className="!bottom-4 !right-4 !border !shadow-sm !rounded-lg !bg-white"
          maskColor="rgba(100, 116, 139, 0.1)"
          nodeColor="#64748b"
        />
      </ReactFlow>

      {nodes.length === 0 && <EmptyState />}
    </div>
  );
}
