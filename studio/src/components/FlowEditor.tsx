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

export default function FlowEditor() {
  const { nodes, edges, setNodes, setEdges, setSelectedNode, selectedNode } = useFlowStore();
  const { screenToFlowPosition } = useReactFlow();
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const [hasPendingNode, setHasPendingNode] = useState(false);

  // Keep nodesRef in sync
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

  // Native drop handler with capture phase - more reliable in WebKit/Tauri
  // Note: Drag & drop doesn't work reliably in Tauri/WebKit, so we use click-to-place as primary method
  useEffect(() => {
    const wrapper = flowWrapperRef.current;
    if (!wrapper) return;

    const handleNativeDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Try to get data from dataTransfer
      let dataStr = event.dataTransfer?.getData("application/reactflow") || "";
      if (!dataStr) dataStr = event.dataTransfer?.getData("text/plain") || "";
      if (!dataStr) dataStr = event.dataTransfer?.getData("text") || "";

      let nodeData = null;
      if (dataStr) {
        try {
          nodeData = JSON.parse(dataStr);
        } catch {
          // Ignore parse errors
        }
      }

      // Fallback to global variable (workaround for WebKit)
      if (!nodeData) {
        nodeData = getDraggedNodeData();
      }

      if (!nodeData) return;

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
          config: nodeData.defaultConfig || {},
          category: nodeData.category,
          icon: nodeData.icon,
        },
      };

      setNodes([...nodesRef.current, newNode]);
      clearDraggedNodeData();
    };

    const handleNativeDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    };

    // Add listeners in capture phase (third param = true)
    wrapper.addEventListener("drop", handleNativeDrop, true);
    wrapper.addEventListener("dragover", handleNativeDragOver, true);

    return () => {
      wrapper.removeEventListener("drop", handleNativeDrop, true);
      wrapper.removeEventListener("dragover", handleNativeDragOver, true);
    };
  }, [screenToFlowPosition, setNodes]);

  // Handle delete key for nodes and edges - using native event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      // Check both target and activeElement (WebKit/Tauri can lose focus on keydown)
      const target = e.target as HTMLElement;
      const activeElement = document.activeElement;

      // Don't delete if event originated from an input field
      const targetTag = target?.tagName?.toLowerCase();
      const activeTag = activeElement?.tagName?.toLowerCase();
      const isTyping = targetTag === 'input' || targetTag === 'textarea' ||
                       activeTag === 'input' || activeTag === 'textarea' ||
                       target?.getAttribute("contenteditable") === "true";

      // Also check if target is inside any modal/panel (not the canvas)
      const isInModal = target?.closest('[data-properties-panel]') !== null ||
                        activeElement?.closest('[data-properties-panel]') !== null;

      // Check if modal is open via DOM or if a node is selected in store (config panel open)
      const modalExists = document.getElementById('node-config-panel') !== null ||
                          document.querySelector('[data-properties-panel]') !== null;

      // Also check the store - if selectedNode exists, the config panel is open
      const configPanelOpen = selectedNode !== null;

      console.log('Delete pressed:', { targetTag, activeTag, isTyping, isInModal, modalExists, configPanelOpen, selectedNode });

      if (isTyping || isInModal || modalExists || configPanelOpen) return;

      // Delete selected nodes
      const selectedNodes = nodes.filter((n) => n.selected);
      if (selectedNodes.length > 0) {
        const selectedIds = selectedNodes.map((n) => n.id);
        setNodes(nodes.filter((n) => !selectedIds.includes(n.id)));
        // Also remove edges connected to deleted nodes
        setEdges(edges.filter((e) => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)));
        setSelectedNode(null);
      }

      // Delete selected edges
      const selectedEdges = edges.filter((e) => e.selected);
      if (selectedEdges.length > 0) {
        const selectedEdgeIds = selectedEdges.map((e) => e.id);
        setEdges(edges.filter((e) => !selectedEdgeIds.includes(e.id)));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, setNodes, setEdges, setSelectedNode, selectedNode]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];
      setNodes(updatedNodes);
    },
    [nodes, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updatedEdges = applyEdgeChanges(changes, edges) as FlowEdge[];
      setEdges(updatedEdges);
    },
    [edges, setEdges]
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
      setEdges(newEdges);
    },
    [edges, setEdges]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => {
      setSelectedNode(node);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    // Check if there's a pending node to place (click-to-place for Tauri)
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
          config: pendingNode.defaultConfig || {},
          category: pendingNode.category,
          icon: pendingNode.icon,
        },
      };

      setNodes([...nodes, newNode]);
      clearPendingNodeTemplate();
      return;
    }

    setSelectedNode(null);
  }, [setSelectedNode, screenToFlowPosition, nodes, setNodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("=== DROP EVENT TRIGGERED ===");
      console.log("clientX:", event.clientX, "clientY:", event.clientY);

      // Try multiple data types for better compatibility
      let dataStr = event.dataTransfer.getData("application/reactflow");
      console.log("dataTransfer application/reactflow:", dataStr);
      if (!dataStr) {
        dataStr = event.dataTransfer.getData("text/plain");
        console.log("dataTransfer text/plain:", dataStr);
      }
      if (!dataStr) {
        dataStr = event.dataTransfer.getData("text");
        console.log("dataTransfer text:", dataStr);
      }

      let nodeData = null;

      if (dataStr) {
        try {
          nodeData = JSON.parse(dataStr);
          console.log("Parsed nodeData from dataTransfer:", nodeData);
        } catch (err) {
          console.error("Error parsing drag data:", err);
        }
      }

      // Fallback to global variable (workaround for WebKit/Tauri)
      if (!nodeData) {
        nodeData = getDraggedNodeData();
        console.log("Fallback to global draggedNodeData:", nodeData);
      }

      if (!nodeData) {
        console.warn("No drag data found - aborting drop");
        return;
      }

      // Get the bounds of the ReactFlow wrapper
      const reactFlowBounds = flowWrapperRef.current?.getBoundingClientRect();
      console.log("reactFlowBounds:", reactFlowBounds);
      if (!reactFlowBounds) {
        console.warn("No reactFlowBounds - aborting");
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      console.log("Calculated position:", position);

      const newNode: FlowNode = {
        id: `${nodeData.type}-${Date.now()}`,
        type: "customNode",
        position,
        data: {
          label: nodeData.label,
          nodeType: nodeData.type,
          config: nodeData.defaultConfig || {},
          category: nodeData.category,
          icon: nodeData.icon,
        },
      };
      console.log("Creating new node:", newNode);

      const newNodes = [...nodes, newNode];
      console.log("Setting nodes, total count:", newNodes.length);
      setNodes(newNodes);
      clearDraggedNodeData();
      console.log("=== DROP COMPLETE ===");
    },
    [screenToFlowPosition, nodes, setNodes]
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
