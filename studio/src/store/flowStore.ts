import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { FlowState, FlowNode, FlowEdge, BotDSL, FormFieldDefinition, FormTriggerConfig } from "../types/flow";
import { useToastStore } from "./toastStore";
import { useLogsStore } from "./logsStore";

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
    const dslNodes = state.nodes.map((node) => {
      // Find outgoing edges
      const successEdge = state.edges.find(
        (e) => e.source === node.id && e.sourceHandle === "success"
      );
      const errorEdge = state.edges.find(
        (e) => e.source === node.id && e.sourceHandle === "error"
      );

      return {
        id: node.id,
        type: node.data.nodeType,
        config: node.data.config,
        outputs: {
          // Use "END" when no edge connected (implicit flow termination)
          success: successEdge?.target || "END",
          error: errorEdge?.target || "END",
        },
        label: node.data.label,
      };
    });

    // Find all trigger nodes
    const triggerNodes = state.nodes.filter(
      (node) => node.data.category === "trigger"
    );
    const triggerIds = triggerNodes.map((node) => node.id);

    const dsl: BotDSL = {
      version: "1.0",
      bot: state.botInfo,
      nodes: dslNodes,
      triggers: triggerIds.length > 0 ? triggerIds : undefined,
      start_node: state.nodes.length > 0 ? state.nodes[0].id : undefined,
    };

    return dsl;
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
      logs.info("Compiling bot...");
      const result = await invoke<ExecutionResult>("run_bot", {
        dsl: JSON.stringify(dsl)
      });

      // Parse and show logs
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => {
          if (log.includes("ERROR")) {
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

