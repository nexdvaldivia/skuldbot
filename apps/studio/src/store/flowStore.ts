import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { FlowState, FlowNode, FlowEdge, FormTriggerConfig } from "../types/flow";
import { useToastStore } from "./toastStore";
import { useLogsStore } from "./logsStore";
import { useDebugStore } from "./debugStore";
import { buildExecutionDSL } from "../lib/dsl";
import { ExecutionResult } from "../types/execution";
import {
  mergeExecutionFailureContext,
  normalizeInvokeErrorMessage,
} from "../utils/executionError";
import { reconcileContainerNodes } from "../utils/containerNodes";
import {
  getSchemaCandidateFromNodeData,
  parseNodeRuntimeTelemetryLine,
} from "../utils/nodeRuntimeTelemetry";

// Re-export for convenience
export type { FormTriggerConfig } from "../types/flow";

// Tauri command result types
interface CompileResult {
  success: boolean;
  message: string;
  bot_path?: string;
}

// Global variable to store dragged node data (workaround for WebKit/Tauri dataTransfer bug)
let draggedNodeData: any = null;

export const setDraggedNodeData = (data: any) => {
  draggedNodeData = data;
};

export const getDraggedNodeData = () => {
  return draggedNodeData;
};

export const clearDraggedNodeData = () => {
  draggedNodeData = null;
};

// Pending node for click-to-place (Tauri workaround)
let pendingNodeTemplate: any = null;

export const setPendingNodeTemplate = (data: any) => {
  pendingNodeTemplate = data;
  // Dispatch custom event so FlowEditor can update cursor
  window.dispatchEvent(new CustomEvent('pendingNodeChange', { detail: data }));
};

export const getPendingNodeTemplate = () => {
  return pendingNodeTemplate;
};

export const clearPendingNodeTemplate = () => {
  pendingNodeTemplate = null;
  window.dispatchEvent(new CustomEvent('pendingNodeChange', { detail: null }));
};

const NODE_REFERENCE_PATTERN = /\$\{node:([^|}]+)\|[^}]+\}/g;

type CleanupResult<T> = {
  value: T;
  changed: boolean;
  removedReferenceCount: number;
};

const cleanupDeletedNodeReferencesInString = (
  value: string,
  deletedNodeIds: Set<string>
): CleanupResult<string> => {
  let removedReferenceCount = 0;
  const cleaned = value.replace(NODE_REFERENCE_PATTERN, (match, nodeId) => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!deletedNodeIds.has(normalizedNodeId)) return match;
    removedReferenceCount += 1;
    return "";
  });

  return {
    value: cleaned,
    changed: removedReferenceCount > 0,
    removedReferenceCount,
  };
};

const cleanupDeletedNodeReferencesInValue = (
  value: any,
  deletedNodeIds: Set<string>
): CleanupResult<any> => {
  if (typeof value === "string") {
    return cleanupDeletedNodeReferencesInString(value, deletedNodeIds);
  }

  if (Array.isArray(value)) {
    let changed = false;
    let removedReferenceCount = 0;
    const cleanedArray = value.map((item) => {
      const cleanedItem = cleanupDeletedNodeReferencesInValue(item, deletedNodeIds);
      changed = changed || cleanedItem.changed;
      removedReferenceCount += cleanedItem.removedReferenceCount;
      return cleanedItem.value;
    });

    return { value: cleanedArray, changed, removedReferenceCount };
  }

  if (value && typeof value === "object") {
    let changed = false;
    let removedReferenceCount = 0;
    const cleanedObject: Record<string, any> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const cleanedNested = cleanupDeletedNodeReferencesInValue(nestedValue, deletedNodeIds);
      cleanedObject[key] = cleanedNested.value;
      changed = changed || cleanedNested.changed;
      removedReferenceCount += cleanedNested.removedReferenceCount;
    }

    return { value: cleanedObject, changed, removedReferenceCount };
  }

  return { value, changed: false, removedReferenceCount: 0 };
};

const cleanupDeletedNodeConnections = (
  connections: Record<string, any> | undefined,
  deletedNodeIds: Set<string>
): CleanupResult<Record<string, any> | undefined> => {
  if (!connections || typeof connections !== "object") {
    return { value: connections, changed: false, removedReferenceCount: 0 };
  }

  let changed = false;
  let removedReferenceCount = 0;
  const cleanedConnections: Record<string, any> = {};

  for (const [key, rawValue] of Object.entries(connections)) {
    if (typeof rawValue === "string") {
      if (deletedNodeIds.has(rawValue)) {
        changed = true;
        removedReferenceCount += 1;
        continue;
      }
      cleanedConnections[key] = rawValue;
      continue;
    }

    if (Array.isArray(rawValue)) {
      const filtered = rawValue.filter(
        (item) => !(typeof item === "string" && deletedNodeIds.has(item))
      );
      if (filtered.length !== rawValue.length) {
        changed = true;
        removedReferenceCount += rawValue.length - filtered.length;
      }
      if (filtered.length > 0) {
        cleanedConnections[key] = filtered;
      }
      continue;
    }

    cleanedConnections[key] = rawValue;
  }

  return { value: cleanedConnections, changed, removedReferenceCount };
};

const sanitizeNodesAfterDeletion = (
  nodes: FlowNode[],
  deletedNodeIds: Set<string>
): { nodes: FlowNode[]; changedNodeCount: number; removedReferenceCount: number } => {
  if (deletedNodeIds.size === 0) {
    return { nodes, changedNodeCount: 0, removedReferenceCount: 0 };
  }

  let changedNodeCount = 0;
  let removedReferenceCount = 0;

  const sanitizedNodes = nodes.map((node) => {
    let nodeChanged = false;
    let nextData = node.data;

    const cleanedConfig = cleanupDeletedNodeReferencesInValue(
      node.data?.config ?? {},
      deletedNodeIds
    );
    if (cleanedConfig.changed) {
      nodeChanged = true;
      removedReferenceCount += cleanedConfig.removedReferenceCount;
      nextData = { ...nextData, config: cleanedConfig.value };
    }

    const cleanedConnections = cleanupDeletedNodeConnections(
      (nextData as any)?.connections,
      deletedNodeIds
    );
    if (cleanedConnections.changed) {
      nodeChanged = true;
      removedReferenceCount += cleanedConnections.removedReferenceCount;
      nextData = { ...nextData, connections: cleanedConnections.value };
    }

    const childNodes = Array.isArray((nextData as any)?.childNodes)
      ? ((nextData as any).childNodes as string[])
      : null;
    if (childNodes) {
      const filteredChildren = childNodes.filter(
        (childNodeId) => !deletedNodeIds.has(childNodeId)
      );
      if (filteredChildren.length !== childNodes.length) {
        nodeChanged = true;
        nextData = { ...nextData, childNodes: filteredChildren };
      }
    }

    if (!nodeChanged) return node;

    changedNodeCount += 1;
    return { ...node, data: nextData };
  });

  return {
    nodes: sanitizedNodes,
    changedNodeCount,
    removedReferenceCount,
  };
};

// Helper function to find form trigger in nodes
export const findFormTrigger = (nodes: FlowNode[]): FlowNode | null => {
  return nodes.find(
    (node) => node.data.nodeType === "trigger.form"
  ) || null;
};

// Helper function to get form trigger config
export const getFormTriggerConfig = (node: FlowNode): FormTriggerConfig | null => {
  if (node.data.nodeType !== "trigger.form") return null;

  const config = node.data.config || {};
  return {
    formTitle: config.formTitle || "Form Input",
    formDescription: config.formDescription || "",
    submitButtonLabel: config.submitButtonLabel || "Run Bot",
    fields: config.fields || [],
  };
};

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  botInfo: {
    id: `bot-${Date.now()}`,
    name: "New Bot",
    description: "Bot description",
  },

  // Node Operations
  addNode: (node) => {
    set((state) => ({
      nodes: reconcileContainerNodes([...state.nodes, node]),
    }));
  },

  updateNode: (id, data) => {
    set((state) => {
      const updatedNodes = state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      );
      // Also update selectedNode if it's the one being edited
      const updatedSelectedNode = state.selectedNode?.id === id
        ? { ...state.selectedNode, data: { ...state.selectedNode.data, ...data } }
        : state.selectedNode;
      return {
        nodes: updatedNodes,
        selectedNode: updatedSelectedNode,
      };
    });
  },

  deleteNode: (id) => {
    let removedReferenceCount = 0;
    set((state) => {
      const remainingNodes = state.nodes.filter((node) => node.id !== id);
      const sanitized = sanitizeNodesAfterDeletion(remainingNodes, new Set([id]));
      removedReferenceCount = sanitized.removedReferenceCount;

      const nextSelectedNode =
        state.selectedNode?.id === id
          ? null
          : state.selectedNode
            ? sanitized.nodes.find((node) => node.id === state.selectedNode?.id) || null
            : null;

      return {
        nodes: reconcileContainerNodes(sanitized.nodes),
        edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
        selectedNode: nextSelectedNode,
      };
    });

    if (removedReferenceCount > 0) {
      const plural = removedReferenceCount === 1 ? "" : "s";
      useToastStore
        .getState()
        .warning(
          "References cleaned",
          `${removedReferenceCount} stale node reference${plural} removed after deleting node.`
        );
    }
  },

  setNodes: (nodes) => {
    let removedReferenceCount = 0;

    set((state) => {
      const deletedNodeIds = new Set(
        state.nodes
          .filter((prevNode) => !nodes.some((nextNode) => nextNode.id === prevNode.id))
          .map((node) => node.id)
      );

      if (deletedNodeIds.size === 0) {
        const reconciled = reconcileContainerNodes(nodes);
        const nextSelectedNode = state.selectedNode
          ? reconciled.find((node) => node.id === state.selectedNode?.id) || null
          : null;
        return {
          nodes: reconciled,
          selectedNode: nextSelectedNode,
        };
      }

      const sanitized = sanitizeNodesAfterDeletion(nodes, deletedNodeIds);
      removedReferenceCount = sanitized.removedReferenceCount;
      const reconciled = reconcileContainerNodes(sanitized.nodes);

      const nextSelectedNode = state.selectedNode
        ? reconciled.find((node) => node.id === state.selectedNode?.id) || null
        : null;

      return {
        nodes: reconciled,
        selectedNode: nextSelectedNode,
      };
    });

    if (removedReferenceCount > 0) {
      const plural = removedReferenceCount === 1 ? "" : "s";
      useToastStore
        .getState()
        .warning(
          "References cleaned",
          `${removedReferenceCount} stale node reference${plural} removed after deleting node.`
        );
    }
  },
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setBotInfo: (info) => set((state) => ({ botInfo: { ...state.botInfo, ...info } })),

  // DSL Operations
  generateDSL: () => {
    const state = get();
    return buildExecutionDSL(state.botInfo, state.nodes, state.edges);
  },

  loadFromDSL: (dsl) => {
    // Convert DSL nodes to Flow nodes
    const flowNodes: FlowNode[] = dsl.nodes.map((dslNode, index) => ({
      id: dslNode.id,
      type: "customNode",
      position: dslNode.position || { x: 250, y: 100 + index * 150 },
      data: {
        label: dslNode.label || dslNode.type,
        nodeType: dslNode.type,
        config: dslNode.config,
        category: dslNode.type.split(".")[0] as any,
      },
    }));

    // Convert DSL outputs to edges
    // Skip edges that point to "END" (implicit termination) or to the same node (legacy self-reference)
    const flowEdges: FlowEdge[] = [];
    dsl.nodes.forEach((dslNode) => {
      if (dslNode.outputs.success !== dslNode.id && dslNode.outputs.success !== "END") {
        flowEdges.push({
          id: `${dslNode.id}-success-${dslNode.outputs.success}`,
          source: dslNode.id,
          target: dslNode.outputs.success,
          sourceHandle: "success",
          type: "smoothstep",
          animated: true,
          data: { edgeType: "success" },
          style: { stroke: "#10b981" },
        });
      }

      if (dslNode.outputs.error !== dslNode.id && dslNode.outputs.error !== "END") {
        flowEdges.push({
          id: `${dslNode.id}-error-${dslNode.outputs.error}`,
          source: dslNode.id,
          target: dslNode.outputs.error,
          sourceHandle: "error",
          type: "smoothstep",
          data: { edgeType: "error" },
          style: { stroke: "#ef4444" },
        });
      }
    });

    set({
      nodes: flowNodes,
      edges: flowEdges,
      botInfo: {
        id: dsl.bot.id,
        name: dsl.bot.name,
        description: dsl.bot.description || "",
      },
    });
  },

  // Bot Operations
  compileBot: async () => {
    const state = get();
    const toast = useToastStore.getState();
    const logs = useLogsStore.getState();

    if (state.nodes.length === 0) {
      toast.warning("No nodes", "Add at least one node before compiling");
      return;
    }

    // Check for triggers and auto-add Manual if none exists
    const hasTrigger = state.nodes.some(
      (node) => node.data.category === "trigger"
    );

    const dsl = state.generateDSL();

    if (!hasTrigger) {
      // Auto-add Manual Trigger to the DSL
      const manualTriggerId = `trigger-manual-${Date.now()}`;
      const firstNodeId = dsl.nodes[0]?.id;

      const manualTriggerNode = {
        id: manualTriggerId,
        type: "trigger.manual",
        config: {},
        outputs: {
          success: firstNodeId || manualTriggerId,
          error: manualTriggerId,
        },
        label: "Manual Trigger",
      };

      // Insert at beginning
      dsl.nodes.unshift(manualTriggerNode);
      dsl.triggers = [manualTriggerId];
      dsl.start_node = manualTriggerId;

      logs.info("Auto-added Manual Trigger (no trigger defined)");
      toast.info("Trigger added", "Manual Trigger added automatically");
    }

    logs.info("Starting compilation...");
    logs.openPanel();

    try {
      logs.info("Validating DSL...");
      const result = await invoke<CompileResult>("compile_dsl", {
        dsl: JSON.stringify(dsl)
      });

      logs.success("Bot compiled successfully", result.bot_path);
      toast.success(
        "Bot compiled",
        `Package generated at: ${result.bot_path?.substring(result.bot_path.lastIndexOf('/') + 1) || 'temp'}`
      );
    } catch (error) {
      const errorMsg = normalizeInvokeErrorMessage(error);
      logs.error("Compilation error", errorMsg);
      toast.error("Compilation error", errorMsg);
    }
  },

  // Check if bot requires form input before running
  requiresFormInput: () => {
    const state = get();
    const formTrigger = findFormTrigger(state.nodes);
    return formTrigger !== null;
  },

  // Get form trigger configuration
  getFormTriggerConfig: () => {
    const state = get();
    const formTrigger = findFormTrigger(state.nodes);
    if (!formTrigger) return null;
    return getFormTriggerConfig(formTrigger);
  },

  // Run bot with optional form data
  runBot: async (formData?: Record<string, any>) => {
    const state = get();
    const toast = useToastStore.getState();
    const logs = useLogsStore.getState();

    if (state.nodes.length === 0) {
      toast.warning("No nodes", "Add at least one node before running");
      return;
    }

    // Check for triggers and auto-add Manual if none exists
    const hasTrigger = state.nodes.some(
      (node) => node.data.category === "trigger"
    );

    const dsl = state.generateDSL();

    if (!hasTrigger) {
      // Auto-add Manual Trigger to the DSL
      const manualTriggerId = `trigger-manual-${Date.now()}`;
      const firstNodeId = dsl.nodes[0]?.id;

      const manualTriggerNode = {
        id: manualTriggerId,
        type: "trigger.manual",
        config: {},
        outputs: {
          success: firstNodeId || manualTriggerId,
          error: manualTriggerId,
        },
        label: "Manual Trigger",
      };

      dsl.nodes.unshift(manualTriggerNode);
      dsl.triggers = [manualTriggerId];
      dsl.start_node = manualTriggerId;

      logs.info("Auto-added Manual Trigger");
    }

    // Add form data to DSL variables if provided
    if (formData && Object.keys(formData).length > 0) {
      dsl.variables = {
        ...dsl.variables,
        formData: {
          type: "json" as const,
          value: formData,
        },
      };
      logs.info("Form data received", JSON.stringify(formData));
    }

    logs.info("Starting bot execution...");
    logs.openPanel();

    try {
      logs.info("Compiling bot...");
      const result = await invoke<ExecutionResult>("run_bot", {
        dsl: JSON.stringify(dsl)
      });

      // Parse and show logs, capture runtime telemetry for schema discovery
      const debugStore = useDebugStore.getState();

      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => {
          // Check for runtime node telemetry (NODE_INPUT / NODE_ENVELOPE / NODE_OUTPUT)
          const runtimeTelemetry = parseNodeRuntimeTelemetryLine(log);
          if (runtimeTelemetry) {
            const { nodeId, data, channel } = runtimeTelemetry;
            if (nodeId) {
              if (channel === "input") {
                debugStore.markNodeInput(nodeId, data);
              } else {
                debugStore.markNodeStatus(nodeId, "success", data);

                const flowNode = state.nodes.find((n) => n.id === nodeId);
                const schemaCandidate = getSchemaCandidateFromNodeData(data);
                if (flowNode && schemaCandidate && typeof schemaCandidate === "object") {
                  debugStore.discoverSchema(nodeId, flowNode.data.nodeType, schemaCandidate);
                }
              }
            }
          } else if (log.includes("ERROR") || log.includes("FAIL")) {
            logs.error(log);
          } else if (log.includes("WARNING") || log.includes("WARN")) {
            logs.warning(log);
          } else if (log.includes("SUCCESS") || log.includes("PASS")) {
            logs.success(log);
          } else {
            logs.info(log);
          }
        });
      } else if (result.output) {
        logs.info("Bot output", result.output);
      }

      if (result.success) {
        logs.success("Bot executed successfully");
        toast.success("Execution successful", "The bot ran correctly");
      } else {
        const failure = mergeExecutionFailureContext(result, "Bot failed during execution");
        if (failure.nodeId) {
          debugStore.markNodeStatus(failure.nodeId, "error", undefined, failure.message);
        }
        logs.error("Bot failed during execution", failure.details);
        toast.error("Execution failed", failure.toast);
      }
    } catch (error) {
      const errorMsg = normalizeInvokeErrorMessage(error);
      logs.error("Execution error", errorMsg);
      toast.error("Execution error", errorMsg);
    }
  },
}));
