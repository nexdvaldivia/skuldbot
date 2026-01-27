import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { FlowState, FlowNode, FlowEdge, FormTriggerConfig } from "../types/flow";
import { useToastStore } from "./toastStore";
import { useLogsStore } from "./logsStore";
import { useDebugStore } from "./debugStore";
import { buildExecutionDSL } from "../lib/dsl";

// Re-export for convenience
export type { FormTriggerConfig } from "../types/flow";

// Tauri command result types
interface CompileResult {
  success: boolean;
  message: string;
  bot_path?: string;
}

interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  logs?: string[];
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
      nodes: [...state.nodes, node],
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
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
      selectedNode: state.selectedNode?.id === id ? null : state.selectedNode,
    }));
  },

  setNodes: (nodes) => set({ nodes }),
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
      position: { x: 250, y: 100 + index * 150 },
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

    let dsl = state.generateDSL();

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
      const errorMsg = String(error);
      logs.error("Compilation error", errorMsg);
      toast.error("Compilation error", errorMsg.substring(0, 100));
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

    let dsl = state.generateDSL();

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
      // Debug: Log the DSL being sent
      const dslString = JSON.stringify(dsl, null, 2);
      console.log("DSL being sent:", dslString);
      logs.info("DSL generated", dslString.substring(0, 500) + "...");
      
      logs.info("Compiling bot...");
      const result = await invoke<ExecutionResult>("run_bot", {
        dsl: JSON.stringify(dsl)
      });

      // Parse and show logs, capture NODE_OUTPUT for schema discovery
      const debugStore = useDebugStore.getState();
      
      console.log("[FlowStore] Run result:", result);
      console.log("[FlowStore] Logs count:", result.logs?.length || 0);
      
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => {
          console.log("[FlowStore] Processing log:", log.substring(0, 100));
          // Check for NODE_OUTPUT to capture node output data
          if (log.includes("NODE_OUTPUT:")) {
            console.log("[FlowStore] Found NODE_OUTPUT in log:", log);
            const outputLine = log.slice(log.indexOf("NODE_OUTPUT:") + "NODE_OUTPUT:".length).trim();
            console.log("[FlowStore] Parsed outputLine:", outputLine);
            let nodeId: string | null = null;
            let payload = outputLine;

            // Format: NODE_OUTPUT:<nodeId>:<json>
            if (!outputLine.startsWith("{") && !outputLine.startsWith("[")) {
              const firstColon = outputLine.indexOf(":");
              if (firstColon > -1) {
                const maybeNodeId = outputLine.slice(0, firstColon).trim();
                const maybeJson = outputLine.slice(firstColon + 1).trim();
                if (maybeNodeId && maybeJson) {
                  nodeId = maybeNodeId;
                  payload = maybeJson;
                }
              }
            }

            try {
              const outputData = JSON.parse(payload);
              console.log("[FlowStore] Parsed output data:", outputData);
              if (nodeId) {
                console.log("[FlowStore] Marking node status for:", nodeId);
                debugStore.markNodeStatus(nodeId, "success", outputData);
                // Discover schema from the actual output
                const flowNode = state.nodes.find(n => n.id === nodeId);
                if (flowNode) {
                  console.log("[FlowStore] Discovering schema for:", nodeId, flowNode.data.nodeType);
                  debugStore.discoverSchema(nodeId, flowNode.data.nodeType, outputData);
                }
              }
            } catch (e) {
              console.error("[FlowStore] Failed to parse NODE_OUTPUT:", e, payload);
              if (nodeId) {
                debugStore.markNodeStatus(nodeId, "success", payload);
              }
            }
          } else if (log.includes("ERROR")) {
            logs.error(log);
          } else if (log.includes("WARNING")) {
            logs.warning(log);
          } else if (log.includes("SUCCESS")) {
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
        logs.error("Bot failed during execution");
        toast.error("Execution failed", "Check the logs for more details");
      }
    } catch (error) {
      const errorMsg = String(error);
      logs.error("Execution error", errorMsg);
      toast.error("Execution error", errorMsg.substring(0, 100));
    }
  },
}));

