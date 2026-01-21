import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { FlowState, FlowNode, FlowEdge, BotDSL, DSLNode, FormTriggerConfig } from "../types/flow";
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

    // AI sub-nodes (config nodes) that don't have their own execution flow
    // These provide configuration to other nodes via visual connections
    const AI_CONFIG_NODES = ["ai.model", "ai.embeddings"];

    // Filter out AI config nodes from the execution flow
    const executableNodes = state.nodes.filter(
      (node) => !AI_CONFIG_NODES.includes(node.data.nodeType)
    );

    const dslNodes = executableNodes.map((node) => {
      // Find outgoing edges
      const successEdge = state.edges.find(
        (e) => e.source === node.id && e.sourceHandle === "success"
      );
      const errorEdge = state.edges.find(
        (e) => e.source === node.id && e.sourceHandle === "error"
      );

      // AI nodes that can receive model configuration via visual connection
      const AI_NODES_WITH_MODEL = [
        "ai.agent",
        "ai.extract_data",
        "ai.summarize",
        "ai.classify",
        "ai.translate",
        "ai.sentiment",
        "ai.vision",
        "ai.repair_data",
        "ai.suggest_repairs",
      ];

      // For AI nodes: find model connections
      // For AI Agent specifically: also find tool and memory connections
      let tools: { nodeId: string; name: string; description: string }[] | undefined;
      let memory: Record<string, any> | undefined;
      let model_config: Record<string, any> | undefined;

      // Process model connection for ALL AI nodes that support it
      if (AI_NODES_WITH_MODEL.includes(node.data.nodeType)) {
        // Find model connection (edge coming INTO this node's "model" handle)
        const allEdgesToNode = state.edges.filter(e => e.target === node.id);
        console.log(`[flowStore] Node ${node.id} (${node.data.nodeType}) - all incoming edges:`, allEdgesToNode.map(e => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          edgeType: e.data?.edgeType
        })));

        const modelEdge = state.edges.find(
          (e) => e.target === node.id && e.targetHandle === "model" && e.data?.edgeType === "model"
        );
        console.log(`[flowStore] Model edge for ${node.id}:`, modelEdge ? { source: modelEdge.source, targetHandle: modelEdge.targetHandle, edgeType: modelEdge.data?.edgeType } : 'NOT FOUND');
        if (modelEdge) {
          const modelNode = state.nodes.find((n) => n.id === modelEdge.source);
          if (modelNode && modelNode.data.nodeType === "ai.model") {
            // Extract model config from the connected AI Model node
            const modConfig = modelNode.data.config || {};
            model_config = {
              provider: modConfig.provider || "openai",
              model: modConfig.model || "gpt-4o",
              temperature: modConfig.temperature ?? 0.7,
            };
            // Add optional max_tokens if specified
            if (modConfig.max_tokens) {
              model_config.max_tokens = modConfig.max_tokens;
            }
            // Add provider-specific params
            if (modConfig.provider === "openai") {
              model_config.api_key = modConfig.api_key;
            } else if (modConfig.provider === "anthropic") {
              model_config.api_key = modConfig.api_key;
            } else if (modConfig.provider === "azure") {
              model_config.api_key = modConfig.api_key;
              model_config.base_url = modConfig.base_url;
              model_config.api_version = modConfig.api_version;
            } else if (modConfig.provider === "ollama") {
              model_config.base_url = modConfig.base_url || "http://localhost:11434";
            } else if (modConfig.provider === "google") {
              model_config.api_key = modConfig.api_key;
            } else if (modConfig.provider === "aws") {
              model_config.aws_access_key = modConfig.aws_access_key;
              model_config.aws_secret_key = modConfig.aws_secret_key;
              model_config.region = modConfig.region;
            } else if (modConfig.provider === "groq") {
              model_config.api_key = modConfig.api_key;
            } else if (modConfig.provider === "mistral") {
              model_config.api_key = modConfig.api_key;
            }
          }
        }
      }

      // AI Agent-specific connections: tools and memory
      if (node.data.nodeType === "ai.agent") {
        // Find tool connections
        const toolEdges = state.edges.filter(
          (e) => e.target === node.id && e.targetHandle === "tools" && e.data?.edgeType === "tool"
        );
        if (toolEdges.length > 0) {
          tools = toolEdges.map((edge) => {
            const sourceNode = state.nodes.find((n) => n.id === edge.source);
            return {
              nodeId: edge.source,
              name: edge.data?.toolName || sourceNode?.data.label.toLowerCase().replace(/\s+/g, "_") || "unknown_tool",
              description: edge.data?.toolDescription || `Execute ${sourceNode?.data.label || "node"}`,
            };
          });
        }

        // Find memory connections (edges coming INTO this node's "memory" handle)
        const memoryEdge = state.edges.find(
          (e) => e.target === node.id && e.targetHandle === "memory" && e.data?.edgeType === "memory"
        );
        if (memoryEdge) {
          const memoryNode = state.nodes.find((n) => n.id === memoryEdge.source);
          if (memoryNode && memoryNode.data.nodeType === "vectordb.memory") {
            // Extract memory config from the connected Vector Memory node
            const memConfig = memoryNode.data.config || {};
            memory = {
              provider: memConfig.provider || "chroma",
              collection: memConfig.collection || "agent_memory",
              memory_type: memoryEdge.data?.memoryType || memConfig.memory_type || "both",
              top_k: memConfig.top_k || 5,
              min_score: memConfig.min_score || 0.5,
            };
            // Add connection params based on provider
            if (memConfig.provider === "pgvector") {
              memory.connection_params = {
                host: memConfig.host,
                port: memConfig.port,
                database: memConfig.database,
                user: memConfig.user,
                password: memConfig.password,
                table: memConfig.table,
              };
            } else if (memConfig.provider === "supabase") {
              memory.connection_params = {
                url: memConfig.url,
                api_key: memConfig.api_key,
                table: memConfig.table,
              };
            } else if (memConfig.provider === "pinecone") {
              memory.connection_params = {
                api_key: memConfig.api_key,
                index_name: memConfig.index_name,
                namespace: memConfig.namespace,
              };
            } else if (memConfig.provider === "qdrant") {
              memory.connection_params = {
                host: memConfig.host,
                port: memConfig.port,
                api_key: memConfig.api_key,
                collection: memConfig.collection,
              };
            }
            // ChromaDB uses persist_directory if provided
            else if (memConfig.provider === "chroma" && memConfig.persist_directory) {
              memory.connection_params = {
                persist_directory: memConfig.persist_directory,
              };
            }
          }
        }
      }

      // Find embeddings connections (edges coming INTO this node's "embeddings" handle)
      // This applies to AI Agent and Vector Memory nodes
      let embeddings: Record<string, any> | undefined;
      const embeddingsEdge = state.edges.find(
        (e) => e.target === node.id && e.targetHandle === "embeddings" && e.data?.edgeType === "embeddings"
      );
      if (embeddingsEdge) {
        const embeddingsNode = state.nodes.find((n) => n.id === embeddingsEdge.source);
        if (embeddingsNode && embeddingsNode.data.nodeType === "ai.embeddings") {
          // Extract embeddings config from the connected Embeddings node
          const embConfig = embeddingsNode.data.config || {};
          embeddings = {
            provider: embConfig.provider || "openai",
            model: embConfig.model || "text-embedding-3-small",
            dimension: embConfig.dimension || 1536,
          };
          // Add provider-specific params
          if (embConfig.provider === "openai") {
            embeddings.api_key = embConfig.api_key;
          } else if (embConfig.provider === "azure") {
            embeddings.api_key = embConfig.api_key;
            embeddings.base_url = embConfig.base_url;
            embeddings.api_version = embConfig.api_version;
          } else if (embConfig.provider === "ollama") {
            embeddings.base_url = embConfig.base_url || "http://localhost:11434";
          } else if (embConfig.provider === "cohere") {
            embeddings.api_key = embConfig.api_key;
          } else if (embConfig.provider === "huggingface") {
            embeddings.api_key = embConfig.api_key;
            embeddings.base_url = embConfig.base_url;
          } else if (embConfig.provider === "google") {
            embeddings.api_key = embConfig.api_key;
            embeddings.project_id = embConfig.project_id;
            embeddings.location = embConfig.location;
          } else if (embConfig.provider === "aws") {
            embeddings.aws_access_key = embConfig.aws_access_key;
            embeddings.aws_secret_key = embConfig.aws_secret_key;
            embeddings.region = embConfig.region;
          }
        }
      }

      // Find connection edges (e.g., MS365 Connection -> MS365 Trigger)
      // Nodes that need a connection: trigger.ms365_email
      const NODES_WITH_CONNECTION = ["trigger.ms365_email"];
      let connection_config: Record<string, any> | undefined;

      if (NODES_WITH_CONNECTION.includes(node.data.nodeType)) {
        const connectionEdge = state.edges.find(
          (e) => e.target === node.id && e.targetHandle === "connection" && e.data?.edgeType === "connection"
        );
        if (connectionEdge) {
          const connectionNode = state.nodes.find((n) => n.id === connectionEdge.source);
          if (connectionNode && connectionNode.data.nodeType === "ms365.connection") {
            // Extract connection config from the connected MS365 Connection node
            const connConfig = connectionNode.data.config || {};
            connection_config = {
              tenant_id: connConfig.tenant_id,
              client_id: connConfig.client_id,
              client_secret: connConfig.client_secret,
              user_email: connConfig.user_email,
            };
          }
        }
      }

      // Build DSL node
      const dslNode: DSLNode = {
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

      // Add tools array only for AI Agent nodes that have tools connected
      if (tools && tools.length > 0) {
        dslNode.tools = tools;
      }

      // Add model config for AI nodes that have AI Model connected
      // Note: template uses model_config_ (with underscore) to avoid conflicts with Python reserved words
      if (model_config) {
        dslNode.model_config_ = model_config as DSLNode["model_config_"];
      }

      // Add memory config only for AI Agent nodes that have Vector Memory connected
      if (memory) {
        dslNode.memory = memory as DSLNode["memory"];
      }

      // Add embeddings config for nodes that have Embeddings model connected
      if (embeddings) {
        dslNode.embeddings = embeddings as DSLNode["embeddings"];
      }

      // Add connection config for nodes that have service connection (MS365, etc.)
      if (connection_config) {
        (dslNode as any).connection_config = connection_config;
      }

      return dslNode;
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

