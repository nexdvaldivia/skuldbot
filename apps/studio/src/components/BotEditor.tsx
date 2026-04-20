import { useCallback, useRef, useEffect, useState, useMemo } from "react";
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

import { dslToFlowNodes, useProjectStore } from "../store/projectStore";
import { useTabsStore } from "../store/tabsStore";
import { useFlowStore, getDraggedNodeData, clearDraggedNodeData, getPendingNodeTemplate, clearPendingNodeTemplate } from "../store/flowStore";
import { useHistoryStore, generatePasteIds, duplicateNodes } from "../store/historyStore";
import { useDebugStore } from "../store/debugStore";
import { useToastStore } from "../store/toastStore";
import CustomNode from "./CustomNode";
import GroupNode from "./GroupNode";
import AnimatedEdge from "./AnimatedEdge";
import EmptyState from "./EmptyState";
import NodeSearchDialog from "./NodeSearchDialog";
import { useNodeSearch } from "../hooks/useNodeSearch";
import { BotDSL, FlowNode, FlowEdge, isContainerNodeType, NodeCategory } from "../types/flow";
import { PlanStep } from "../types/ai-planner";
import { getNodeTemplate } from "../data/nodeTemplates";
import { attachMovedNodesToContainers, reconcileContainerNodes } from "../utils/containerNodes";
import { shiftManualEdgeRoutesForMovedContainers } from "../utils/containerEdgeRoutes";
import { sanitizeFlowGraph } from "../utils/flowSanitizer";

const nodeTypes: NodeTypes = {
  customNode: CustomNode,
  groupNode: GroupNode,
};

const EMPTY_NODES: FlowNode[] = [];
const EMPTY_EDGES: FlowEdge[] = [];

// Helper to find if a position is inside a GroupNode (container)
function findParentGroupNode(
  position: { x: number; y: number },
  nodes: FlowNode[]
): FlowNode | null {
  // Only consider GroupNodes (containers)
  const groupNodes = nodes.filter((n) => n.type === "groupNode");

  // Check each group node to see if position is inside it
  // We need to account for the header height (~52px) when determining drop zone
  const HEADER_HEIGHT = 52;

  for (const group of groupNodes) {
    const width = (group.style?.width as number) || 400;
    const height = (group.style?.height as number) || 250;

    // Check if position is inside the group's drop zone (below header)
    if (
      position.x >= group.position.x &&
      position.x <= group.position.x + width &&
      position.y >= group.position.y + HEADER_HEIGHT &&
      position.y <= group.position.y + height
    ) {
      return group;
    }
  }
  return null;
}

function detachNodeFromContainer(nodes: FlowNode[], nodeId: string): FlowNode[] {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return nodes;

  const parentId = node.parentId || node.parentNode;
  if (!parentId) return nodes;

  const parent = nodes.find((candidate) => candidate.id === parentId);
  if (!parent) return nodes;

  const parentWidth =
    typeof parent.style?.width === "number" ? (parent.style.width as number) : 400;

  const detachedPosition = {
    x: parent.position.x + parentWidth + 80,
    y: parent.position.y + Math.max(60, node.position.y),
  };

  return nodes.map((candidate) => {
    if (candidate.id === nodeId) {
      const { parentId: _parentId, parentNode: _parentNode, extent: _extent, ...rest } =
        candidate as FlowNode & { parentNode?: string };
      return {
        ...rest,
        position: detachedPosition,
        zIndex: undefined,
      };
    }

    if (candidate.id === parentId) {
      const currentChildren = Array.isArray(candidate.data.childNodes)
        ? candidate.data.childNodes
        : [];
      return {
        ...candidate,
        data: {
          ...candidate.data,
          childNodes: currentChildren.filter((childId) => childId !== nodeId),
        },
      };
    }

    return candidate;
  });
}

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

export default function BotEditor() {
  const { bots, activeBotId, updateActiveBotNodes, updateActiveBotEdges, saveBot } = useProjectStore();
  const { setTabDirty } = useTabsStore();
  const { setSelectedNode, selectedNode } = useFlowStore();
  const { pushState, undo, redo, canUndo, canRedo, copy, paste, hasClipboard } = useHistoryStore();
  const { toggleBreakpoint } = useDebugStore();
  const toast = useToastStore();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  const [hasPendingNode, setHasPendingNode] = useState(false);
  const isUndoRedoRef = useRef(false);
  const { isSearchOpen, closeSearch } = useNodeSearch();

  // Get active bot
  const activeBot = activeBotId ? bots.get(activeBotId) : null;
  const nodes = activeBot?.nodes ?? EMPTY_NODES;
  const edges = activeBot?.edges ?? EMPTY_EDGES;
  const { nodes: safeNodes, edges: safeEdges } = useMemo(
    () => sanitizeFlowGraph(nodes, edges),
    [nodes, edges]
  );

  // Keep refs in sync
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Handle ReactFlow initialization - fit view when flow is ready
  const onInit = useCallback(() => {
    // Small delay to ensure nodes are fully rendered
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 100);
  }, [fitView]);

  // Listen for pending node changes
  useEffect(() => {
    const handlePendingChange = (e: CustomEvent) => {
      setHasPendingNode(!!e.detail);
    };
    window.addEventListener('pendingNodeChange', handlePendingChange as EventListener);
    return () => window.removeEventListener('pendingNodeChange', handlePendingChange as EventListener);
  }, []);

  // Listen for AI Planner apply event - creates nodes and edges from plan
  useEffect(() => {
    const handleAIPlannerApply = (e: CustomEvent<{ planSteps?: PlanStep[]; dsl?: BotDSL }>) => {
      const { planSteps = [], dsl } = e.detail || {};

      if (dsl && Array.isArray(dsl.nodes) && dsl.nodes.length > 0) {
        // Push current state to history for undo
        pushState(nodesRef.current, edgesRef.current);

        const existingNodes = nodesRef.current;
        const existingEdges = edgesRef.current;
        const { nodes: dslNodes, edges: dslEdges } = dslToFlowNodes(dsl);

        if (dslNodes.length > 0) {
          // Place imported DSL to the right of existing flow while preserving relative layout
          const startX = existingNodes.length > 0
            ? Math.max(...existingNodes.map((n) => n.position.x)) + 300
            : 100;
          const startY = 100;

          const minX = Math.min(...dslNodes.map((n) => n.position.x));
          const minY = Math.min(...dslNodes.map((n) => n.position.y));
          const offsetX = startX - minX;
          const offsetY = startY - minY;

          // Remap node IDs to avoid collisions with existing canvas
          const stamp = Date.now();
          const idMap = new Map<string, string>();
          dslNodes.forEach((node, idx) => {
            idMap.set(node.id, `${node.id}-${stamp}-${idx}`);
          });

          const remappedNodes: FlowNode[] = dslNodes.map((node) => {
            const mappedId = idMap.get(node.id) || node.id;
            const mappedParentId = node.parentId ? idMap.get(node.parentId) : undefined;
            const mappedParentNode = (node as any).parentNode ? idMap.get((node as any).parentNode) : undefined;

            return {
              ...node,
              id: mappedId,
              position: {
                x: node.position.x + offsetX,
                y: node.position.y + offsetY,
              },
              ...(mappedParentId ? { parentId: mappedParentId } : {}),
              ...(mappedParentNode ? { parentNode: mappedParentNode } : {}),
              data: {
                ...node.data,
                ...(node.data.childNodes && {
                  childNodes: node.data.childNodes.map((childId) => idMap.get(childId) || childId),
                }),
              },
            };
          });

          const remappedEdges: FlowEdge[] = dslEdges.map((edge, idx) => ({
            ...edge,
            id: `${edge.id}-${stamp}-${idx}`,
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
          }));

          updateActiveBotNodes([...existingNodes, ...remappedNodes]);
          updateActiveBotEdges([...existingEdges, ...remappedEdges]);

          if (activeBotId) {
            setTabDirty(`bot-${activeBotId}`, true);
          }

          setTimeout(() => {
            fitView({ padding: 0.2, duration: 300 });
          }, 100);
        }
        return;
      }

      if (!planSteps || planSteps.length === 0) return;

      // Push current state to history for undo
      pushState(nodesRef.current, edgesRef.current);

      // Calculate starting position for new nodes
      const existingNodes = nodesRef.current;
      const startX = existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.position.x)) + 300
        : 100;
      const startY = 100;
      const nodeSpacing = 180; // Vertical spacing between nodes

      // Create nodes from plan steps
      const newNodes: FlowNode[] = [];
      const stepIdToNodeId: Map<string, string> = new Map();

      planSteps.forEach((step, index) => {
        const template = getNodeTemplate(step.nodeType);
        const nodeId = `${step.nodeType}-${Date.now()}-${index}`;

        // Store mapping of canonical plan step ID -> canvas node ID
        stepIdToNodeId.set(step.id, nodeId);

        // Determine node type (groupNode for containers, customNode for regular)
        const isContainer = isContainerNodeType(step.nodeType);

        // Position: AI nodes (embeddings, memory) go to the left of agent
        let xOffset = 0;
        let yOffset = index * nodeSpacing;

        // Special positioning for AI flow pattern
        if (step.nodeType === "ai.embeddings") {
          xOffset = -250;
          yOffset = (index - 1) * nodeSpacing + 60;
        } else if (step.nodeType === "vectordb.memory") {
          xOffset = -250;
          yOffset = (index - 1) * nodeSpacing + 180;
        }

        const newNode: FlowNode = {
          id: nodeId,
          type: isContainer ? "groupNode" : "customNode",
          position: { x: startX + xOffset, y: startY + yOffset },
          ...(isContainer && { style: { width: 400, height: 250 } }),
          data: {
            label: step.label,
            nodeType: step.nodeType,
            config: { ...template?.defaultConfig, ...step.config },
            category: (template?.category || step.nodeType.split(".")[0]) as NodeCategory,
            icon: template?.icon || "Box",
          },
        };

        newNodes.push(newNode);
      });

      // Create edges: standard flow edges (success connections)
      const newEdges: FlowEdge[] = [];
      const pushUniqueEdge = (edge: FlowEdge) => {
        const exists = newEdges.some((e) =>
          e.source === edge.source &&
          e.target === edge.target &&
          e.sourceHandle === edge.sourceHandle &&
          e.targetHandle === edge.targetHandle &&
          e.data?.edgeType === edge.data?.edgeType
        );
        if (!exists) {
          newEdges.push(edge);
        }
      };

      // Build control-flow edges from canonical outputs; fallback to sequential by plan order
      planSteps.forEach((step, index) => {
        const sourceId = stepIdToNodeId.get(step.id);
        if (!sourceId) return;

        const successRef = step.outputs?.success;
        const errorRef = step.outputs?.error;

        const successTarget = successRef
          ? (successRef === "END" ? null : stepIdToNodeId.get(successRef))
          : (() => {
              const nextStepId = planSteps[index + 1]?.id;
              return nextStepId ? stepIdToNodeId.get(nextStepId) : null;
            })();

        if (successTarget && successTarget !== sourceId) {
          pushUniqueEdge({
            id: `${sourceId}-success-${successTarget}`,
            source: sourceId,
            target: successTarget,
            sourceHandle: "success",
            targetHandle: null,
            type: "animated",
            data: { edgeType: "success" as const },
          });
        }

        const errorTarget = errorRef
          ? (errorRef === "END" ? null : stepIdToNodeId.get(errorRef))
          : null;

        if (errorTarget && errorTarget !== sourceId) {
          pushUniqueEdge({
            id: `${sourceId}-error-${errorTarget}`,
            source: sourceId,
            target: errorTarget,
            sourceHandle: "error",
            targetHandle: null,
            type: "animated",
            data: { edgeType: "error" as const },
          });
        }
      });

      // Canonical AI/service connections from step.connections
      planSteps.forEach((step) => {
        const targetId = stepIdToNodeId.get(step.id);
        if (!targetId || !step.connections) return;

        const connections = step.connections;

        if (connections.model) {
          const sourceId = stepIdToNodeId.get(connections.model);
          if (sourceId) {
            pushUniqueEdge({
              id: `${sourceId}-model-${targetId}`,
              source: sourceId,
              target: targetId,
              sourceHandle: "model-out",
              targetHandle: "model",
              type: "animated",
              data: { edgeType: "model" as const },
            });
          }
        }

        if (connections.embeddings) {
          const sourceId = stepIdToNodeId.get(connections.embeddings);
          if (sourceId) {
            pushUniqueEdge({
              id: `${sourceId}-embeddings-${targetId}`,
              source: sourceId,
              target: targetId,
              sourceHandle: "embeddings-out",
              targetHandle: "embeddings",
              type: "animated",
              data: { edgeType: "embeddings" as const },
            });
          }
        }

        if (connections.memory) {
          const sourceId = stepIdToNodeId.get(connections.memory);
          if (sourceId) {
            pushUniqueEdge({
              id: `${sourceId}-memory-${targetId}`,
              source: sourceId,
              target: targetId,
              sourceHandle: "memory-out",
              targetHandle: "memory",
              type: "animated",
              data: { edgeType: "memory" as const, memoryType: "both" },
            });
          }
        }

        if (connections.connection) {
          const sourceId = stepIdToNodeId.get(connections.connection);
          if (sourceId) {
            pushUniqueEdge({
              id: `${sourceId}-connection-${targetId}`,
              source: sourceId,
              target: targetId,
              sourceHandle: "connection-out",
              targetHandle: "connection",
              type: "animated",
              data: { edgeType: "connection" as const },
            });
          }
        }

        if (connections.tools?.length) {
          connections.tools.forEach((toolRef) => {
            const sourceId = stepIdToNodeId.get(toolRef);
            if (sourceId) {
              pushUniqueEdge({
                id: `${sourceId}-tool-${targetId}`,
                source: sourceId,
                target: targetId,
                sourceHandle: "success",
                targetHandle: "tools",
                type: "animated",
                data: { edgeType: "tool" as const, toolName: "Tool" },
              });
            }
          });
        }
      });

      // Auto-detect AI patterns and create connections if not explicitly defined
      const modelNode = newNodes.find(n => n.data.nodeType === "ai.model");
      const embeddingsNode = newNodes.find(n => n.data.nodeType === "ai.embeddings");
      const memoryNode = newNodes.find(n => n.data.nodeType === "vectordb.memory");
      const agentNode = newNodes.find(n => n.data.nodeType === "ai.agent");
      const aiTaskNodes = newNodes.filter(n =>
        [
          "ai.extract_data",
          "ai.summarize",
          "ai.classify",
          "ai.translate",
          "ai.sentiment",
          "ai.vision",
          "ai.repair_data",
          "ai.suggest_repairs",
        ].includes(n.data.nodeType)
      );

      // Model → Agent (if both exist and no explicit connection)
      if (modelNode && agentNode) {
        const hasModelToAgent = newEdges.some(e =>
          e.source === modelNode.id && e.target === agentNode.id && e.data?.edgeType === "model"
        );
        if (!hasModelToAgent) {
          newEdges.push({
            id: `${modelNode.id}-model-${agentNode.id}`,
            source: modelNode.id,
            target: agentNode.id,
            sourceHandle: "model-out",
            targetHandle: "model",
            type: "animated",
            data: { edgeType: "model" as const },
          });
        }
      }

      // Model → AI Task Nodes (if model exists and no explicit connection)
      if (modelNode && aiTaskNodes.length > 0) {
        aiTaskNodes.forEach((taskNode) => {
          const hasModelToTask = newEdges.some(e =>
            e.source === modelNode.id && e.target === taskNode.id && e.data?.edgeType === "model"
          );
          if (!hasModelToTask) {
            newEdges.push({
              id: `${modelNode.id}-model-${taskNode.id}`,
              source: modelNode.id,
              target: taskNode.id,
              sourceHandle: "model-out",
              targetHandle: "model",
              type: "animated",
              data: { edgeType: "model" as const },
            });
          }
        });
      }

      // Embeddings → Agent (if both exist and no explicit connection)
      if (embeddingsNode && agentNode) {
        const hasEmbeddingsToAgent = newEdges.some(e =>
          e.source === embeddingsNode.id && e.target === agentNode.id && e.data?.edgeType === "embeddings"
        );
        if (!hasEmbeddingsToAgent) {
          newEdges.push({
            id: `${embeddingsNode.id}-embeddings-${agentNode.id}`,
            source: embeddingsNode.id,
            target: agentNode.id,
            sourceHandle: "embeddings-out",
            targetHandle: "embeddings",
            type: "animated",
            data: { edgeType: "embeddings" as const },
          });
        }
      }

      // Embeddings → Memory (if both exist and no agent, or explicit)
      if (embeddingsNode && memoryNode) {
        const hasEmbeddingsToMemory = newEdges.some(e =>
          e.source === embeddingsNode.id && e.target === memoryNode.id && e.data?.edgeType === "embeddings"
        );
        if (!hasEmbeddingsToMemory) {
          newEdges.push({
            id: `${embeddingsNode.id}-embeddings-${memoryNode.id}`,
            source: embeddingsNode.id,
            target: memoryNode.id,
            sourceHandle: "embeddings-out",
            targetHandle: "embeddings",
            type: "animated",
            data: { edgeType: "embeddings" as const },
          });
        }
      }

      // Memory → Agent (if both exist and no explicit connection)
      if (memoryNode && agentNode) {
        const hasMemoryToAgent = newEdges.some(e =>
          e.source === memoryNode.id && e.target === agentNode.id && e.data?.edgeType === "memory"
        );
        if (!hasMemoryToAgent) {
          newEdges.push({
            id: `${memoryNode.id}-memory-${agentNode.id}`,
            source: memoryNode.id,
            target: agentNode.id,
            sourceHandle: "memory-out",
            targetHandle: "memory",
            type: "animated",
            data: { edgeType: "memory" as const, memoryType: "both" },
          });
        }
      }

      // Update store with new nodes and edges
      updateActiveBotNodes([...existingNodes, ...newNodes]);
      updateActiveBotEdges([...edgesRef.current, ...newEdges]);

      // Mark as dirty
      if (activeBotId) {
        setTabDirty(`bot-${activeBotId}`, true);
      }

      // Fit view to show all nodes
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 100);
    };

    window.addEventListener('ai-planner-apply', handleAIPlannerApply as EventListener);
    return () => window.removeEventListener('ai-planner-apply', handleAIPlannerApply as EventListener);
  }, [updateActiveBotNodes, updateActiveBotEdges, activeBotId, setTabDirty, fitView, pushState]);

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

      // F9 = Toggle breakpoint on selected node(s)
      if (e.key === 'F9') {
        e.preventDefault();
        const selectedNodes = nodes.filter((n) => n.selected);
        if (selectedNodes.length > 0) {
          selectedNodes.forEach((node) => toggleBreakpoint(node.id));
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, handleSave, nodes, updateActiveBotNodes, setSelectedNode, toggleBreakpoint]);

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

      // Use groupNode type for container nodes (Loop, While, If, Try/Catch)
      const isContainer = isContainerNodeType(nodeData.type);

      // Check if dropping inside a GroupNode (container) - only for non-container nodes
      const parentGroup = !isContainer ? findParentGroupNode(position, nodesRef.current) : null;

      // Calculate position relative to parent if dropping inside a container
      let finalPosition = position;
      if (parentGroup) {
        finalPosition = {
          x: position.x - parentGroup.position.x,
          y: position.y - parentGroup.position.y,
        };
      }

      const newNode: FlowNode = {
        id: `${nodeData.type}-${Date.now()}`,
        type: isContainer ? "groupNode" : "customNode",
        position: finalPosition,
        // Container nodes need explicit dimensions
        ...(isContainer && {
          style: { width: 400, height: 250 },
        }),
        // Set parent if dropping inside a container
        ...(parentGroup && {
          parentId: parentGroup.id,
          extent: "parent" as const,
        }),
        // Child nodes need higher zIndex to render edges above container
        zIndex: parentGroup ? 1000 : undefined,
        data: {
          label: nodeData.label,
          nodeType: nodeData.type,
          config: { ...(nodeData.defaultConfig || {}) },
          category: nodeData.category,
          icon: nodeData.icon,
        },
      };

      // If adding to a parent, update parent's childNodes array
      let updatedNodes = [...nodesRef.current];
      if (parentGroup) {
        updatedNodes = updatedNodes.map((n) =>
          n.id === parentGroup.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  childNodes: [...(n.data.childNodes || []), newNode.id],
                },
              }
            : n
        );
      }

      updateActiveBotNodes([...updatedNodes, newNode]);
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

      if (isTyping || isInModal) return;

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

  // Handle explicit "detach from container" action coming from CustomNode toolbar
  useEffect(() => {
    const handleDetachNode = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId?: string }>;
      const nodeId = customEvent.detail?.nodeId;
      if (!nodeId) return;

      const before = nodesRef.current;
      const detached = detachNodeFromContainer(before, nodeId);
      if (detached === before) return;

      pushToHistory();
      updateActiveBotNodes(detached);
      markDirty();
      toast.success("Node detached", "Node moved out of container");
    };

    window.addEventListener("detach-node-from-container", handleDetachNode as EventListener);
    return () =>
      window.removeEventListener("detach-node-from-container", handleDetachNode as EventListener);
  }, [updateActiveBotNodes, pushToHistory, markDirty, toast]);

  // Track if we need to push history on node drag end
  const isDraggingRef = useRef(false);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const beforeNodes = nodes;
      let updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];

      // Ensure child nodes always have high zIndex for proper edge rendering
      updatedNodes = updatedNodes.map(node => {
        if (node.parentId && (node.zIndex === undefined || node.zIndex < 1000)) {
          return { ...node, zIndex: 1000 };
        }
        return node;
      });

      const movedNodeIds = Array.from(
        new Set(
          changes.flatMap((change) =>
            change.type === "position" && change.dragging === false && "id" in change
              ? [String(change.id)]
              : []
          )
        )
      );
      if (movedNodeIds.length > 0) {
        updatedNodes = attachMovedNodesToContainers(updatedNodes, movedNodeIds);
      } else {
        updatedNodes = reconcileContainerNodes(updatedNodes);
      }

      const shiftedRoutes = shiftManualEdgeRoutesForMovedContainers(
        beforeNodes,
        updatedNodes,
        edgesRef.current,
        movedNodeIds
      );

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
      if (shiftedRoutes.changed) {
        updateActiveBotEdges(shiftedRoutes.edges);
      }

      // Check if any change is not just selection
      const hasRealChange = changes.some(c => c.type !== 'select');
      if (hasRealChange) {
        markDirty();
      }
    },
    [nodes, updateActiveBotEdges, updateActiveBotNodes, markDirty, pushToHistory]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Push history for edge removal
      const hasRemoval = changes.some(c => c.type === 'remove');
      if (hasRemoval) {
        pushToHistory();
      }

      const updatedEdges = applyEdgeChanges(changes, edgesRef.current) as FlowEdge[];
      updateActiveBotEdges(updatedEdges);

      const hasRealChange = changes.some(c => c.type !== 'select');
      if (hasRealChange) {
        markDirty();
      }
    },
    [updateActiveBotEdges, markDirty, pushToHistory]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      pushToHistory();

      // Determine edge type based on source/target handles
      let edgeType: string = connection.sourceHandle || "success";

      // Map special handle names to proper edge types
      if (connection.sourceHandle === "model-out" && connection.targetHandle === "model") {
        edgeType = "model";
      } else if (connection.sourceHandle === "embeddings-out" && connection.targetHandle === "embeddings") {
        edgeType = "embeddings";
      } else if (connection.sourceHandle === "memory-out" && connection.targetHandle === "memory") {
        edgeType = "memory";
      } else if (connection.targetHandle === "tools") {
        edgeType = "tool";
      } else if (connection.sourceHandle === "connection-out" && connection.targetHandle === "connection") {
        edgeType = "connection";
      }

      const edge: FlowEdge = {
        id: `${connection.source}-${connection.sourceHandle}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: "animated",
        data: {
          edgeType: edgeType as "success" | "error" | "model" | "embeddings" | "memory" | "tool" | "connection",
        },
      };

      const newEdges = addEdge(edge, edgesRef.current) as FlowEdge[];
      updateActiveBotEdges(newEdges);
      markDirty();
    },
    [updateActiveBotEdges, markDirty, pushToHistory]
  );

  // Single click just selects the node (React Flow handles this automatically)
  const onNodeClick = useCallback(
    () => {
      // Don't open config panel on single click - let React Flow handle selection
    },
    []
  );

  // Double click opens the configuration panel
  const onNodeDoubleClick = useCallback(
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

      // Use groupNode type for container nodes
      const isContainer = isContainerNodeType(pendingNode.type);

      // Check if clicking inside a GroupNode (container) - only for non-container nodes
      const parentGroup = !isContainer ? findParentGroupNode(position, nodes) : null;

      // Calculate position relative to parent if inside a container
      let finalPosition = position;
      if (parentGroup) {
        finalPosition = {
          x: position.x - parentGroup.position.x,
          y: position.y - parentGroup.position.y,
        };
      }

      const newNode: FlowNode = {
        id: `${pendingNode.type}-${Date.now()}`,
        type: isContainer ? "groupNode" : "customNode",
        position: finalPosition,
        // Container nodes need explicit dimensions
        ...(isContainer && {
          style: { width: 400, height: 250 },
        }),
        // Set parent if inside a container
        ...(parentGroup && {
          parentId: parentGroup.id,
          extent: "parent" as const,
        }),
        // Child nodes need higher zIndex to render edges above container
        zIndex: parentGroup ? 1000 : undefined,
        data: {
          label: pendingNode.label,
          nodeType: pendingNode.type,
          config: { ...(pendingNode.defaultConfig || {}) },
          category: pendingNode.category,
          icon: pendingNode.icon,
        },
      };

      // If adding to a parent, update parent's childNodes array
      let updatedNodes = [...nodes];
      if (parentGroup) {
        updatedNodes = updatedNodes.map((n) =>
          n.id === parentGroup.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  childNodes: [...(n.data.childNodes || []), newNode.id],
                },
              }
            : n
        );
      }

      updateActiveBotNodes([...updatedNodes, newNode]);
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

      // Use groupNode type for container nodes
      const isContainer = isContainerNodeType(nodeData.type);

      // Check if dropping inside a GroupNode (container) - only for non-container nodes
      const parentGroup = !isContainer ? findParentGroupNode(position, nodesRef.current) : null;

      // Calculate position relative to parent if dropping inside a container
      let finalPosition = position;
      if (parentGroup) {
        finalPosition = {
          x: position.x - parentGroup.position.x,
          y: position.y - parentGroup.position.y,
        };
      }

      const newNode: FlowNode = {
        id: `${nodeData.type}-${Date.now()}`,
        type: isContainer ? "groupNode" : "customNode",
        position: finalPosition,
        // Container nodes need explicit dimensions
        ...(isContainer && {
          style: { width: 400, height: 250 },
        }),
        // Set parent if dropping inside a container
        ...(parentGroup && {
          parentId: parentGroup.id,
          extent: "parent" as const,
        }),
        // Child nodes need higher zIndex to render edges above container
        zIndex: parentGroup ? 1000 : undefined,
        data: {
          label: nodeData.label,
          nodeType: nodeData.type,
          config: { ...(nodeData.defaultConfig || {}) },
          category: nodeData.category,
          icon: nodeData.icon,
        },
      };

      // If adding to a parent, update parent's childNodes array
      let updatedNodes = [...nodesRef.current];
      if (parentGroup) {
        updatedNodes = updatedNodes.map((n) =>
          n.id === parentGroup.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  childNodes: [...(n.data.childNodes || []), newNode.id],
                },
              }
            : n
        );
      }

      updateActiveBotNodes([...updatedNodes, newNode]);
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
        nodes={safeNodes}
        edges={safeEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={onInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        elevateEdgesOnSelect={true}
        defaultEdgeOptions={{
          type: "animated",
          zIndex: 1000,
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

      {safeNodes.length === 0 && <EmptyState />}

      {/* Node Search Dialog */}
      <NodeSearchDialog isOpen={isSearchOpen} onClose={closeSearch} />
    </div>
  );
}
