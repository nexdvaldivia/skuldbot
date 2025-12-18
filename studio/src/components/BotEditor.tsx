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
  const { bots, activeBotId, updateActiveBotNodes, updateActiveBotEdges } = useProjectStore();
  const { setTabDirty } = useTabsStore();
  const { setSelectedNode, selectedNode } = useFlowStore();
  const { screenToFlowPosition } = useReactFlow();
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  const [hasPendingNode, setHasPendingNode] = useState(false);

  // Get active bot
  const activeBot = activeBotId ? bots.get(activeBotId) : null;
  const nodes = activeBot?.nodes || [];
  const edges = activeBot?.edges || [];

  // Keep refs in sync
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Listen for pending node changes
  useEffect(() => {
    const handlePendingChange = (e: CustomEvent) => {
      setHasPendingNode(!!e.detail);
    };
    window.addEventListener('pendingNodeChange', handlePendingChange as EventListener);
    return () => window.removeEventListener('pendingNodeChange', handlePendingChange as EventListener);
  }, []);

  // Mark tab as dirty
  const markDirty = useCallback(() => {
    if (activeBotId) {
      setTabDirty(`bot-${activeBotId}`, true);
    }
  }, [activeBotId, setTabDirty]);

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
  }, [screenToFlowPosition, updateActiveBotNodes, markDirty]);

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
        const selectedIds = selectedNodes.map((n) => n.id);
        updateActiveBotNodes(nodes.filter((n) => !selectedIds.includes(n.id)));
        updateActiveBotEdges(edges.filter((e) => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)));
        setSelectedNode(null);
        markDirty();
      }

      const selectedEdges = edges.filter((e) => e.selected);
      if (selectedEdges.length > 0) {
        const selectedEdgeIds = selectedEdges.map((e) => e.id);
        updateActiveBotEdges(edges.filter((e) => !selectedEdgeIds.includes(e.id)));
        markDirty();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, updateActiveBotNodes, updateActiveBotEdges, setSelectedNode, selectedNode, markDirty]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];
      updateActiveBotNodes(updatedNodes);

      // Check if any change is not just selection
      const hasRealChange = changes.some(c => c.type !== 'select');
      if (hasRealChange) {
        markDirty();
      }
    },
    [nodes, updateActiveBotNodes, markDirty]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updatedEdges = applyEdgeChanges(changes, edges) as FlowEdge[];
      updateActiveBotEdges(updatedEdges);

      const hasRealChange = changes.some(c => c.type !== 'select');
      if (hasRealChange) {
        markDirty();
      }
    },
    [edges, updateActiveBotEdges, markDirty]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
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
    [edges, updateActiveBotEdges, markDirty]
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
  }, [setSelectedNode, screenToFlowPosition, nodes, updateActiveBotNodes, markDirty]);

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
    [screenToFlowPosition, updateActiveBotNodes, markDirty]
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
