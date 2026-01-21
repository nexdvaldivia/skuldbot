import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { useFlowStore } from "./flowStore";
import { useProjectStore } from "./projectStore";
import { useLogsStore } from "./logsStore";
import { useToastStore } from "./toastStore";

export type DebugState = "idle" | "running" | "paused" | "stopped";

interface NodeExecutionState {
  nodeId: string;
  nodeType: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  startTime?: number;
  endTime?: number;
  output?: any;
  error?: string;
  variables?: Record<string, any>;
}

interface DebugSessionState {
  sessionId: string;
  state: string;
  currentNodeId: string | null;
  breakpoints: string[];
  executionOrder: string[];
  nodeExecutions: Record<string, NodeExecutionState>;
  globalVariables: Record<string, any>;
  startTime: number;
  pausedAtBreakpoint: boolean;
}

interface DebugCommandResult {
  success: boolean;
  message?: string;
  sessionState?: DebugSessionState;
  lastEvent?: any;
}

interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  logs?: string[];
}

// Pinned data for n8n-style data pinning
interface PinnedDataEntry {
  nodeId: string;
  data: any;
  pinnedAt: number;
  label: string;
}

interface DebugStoreState {
  // Debug state
  state: DebugState;
  currentNodeId: string | null;
  breakpoints: Set<string>;
  executionHistory: NodeExecutionState[];

  // Session state from backend
  sessionState: DebugSessionState | null;

  // Variables watch
  watchVariables: Map<string, any>;
  globalVariables: Record<string, any>;

  // Data Pinning (n8n-style)
  pinnedData: Map<string, PinnedDataEntry>;

  // Settings
  slowMotion: boolean;
  slowMotionDelay: number;
  useInteractiveDebug: boolean; // Toggle between old and new debug mode

  // Actions
  setBreakpoint: (nodeId: string) => void;
  removeBreakpoint: (nodeId: string) => void;
  toggleBreakpoint: (nodeId: string) => void;
  hasBreakpoint: (nodeId: string) => boolean;
  clearBreakpoints: () => void;

  // Debug control
  startDebug: () => Promise<void>;
  pauseDebug: () => void;
  resumeDebug: () => Promise<void>;
  stopDebug: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => void;
  stepOut: () => void;
  runToCursor: (nodeId: string) => void;
  runSingleNode: (nodeId: string) => Promise<void>;

  // Execution tracking
  setCurrentNode: (nodeId: string | null) => void;
  markNodeStatus: (nodeId: string, status: NodeExecutionState["status"], output?: any, error?: string) => void;
  clearExecutionHistory: () => void;

  // Variables
  setWatchVariable: (name: string, value: any) => void;
  clearWatchVariables: () => void;
  getNodeVariables: (nodeId: string) => Promise<Record<string, any>>;

  // Settings
  setSlowMotion: (enabled: boolean) => void;
  setSlowMotionDelay: (delay: number) => void;
  setUseInteractiveDebug: (enabled: boolean) => void;

  // Data Pinning (n8n-style)
  pinNodeData: (nodeId: string, data: any, label: string) => void;
  unpinNodeData: (nodeId: string) => void;
  clearAllPinnedData: () => void;
  isPinned: (nodeId: string) => boolean;
  getPinnedData: (nodeId: string) => PinnedDataEntry | undefined;

  // Internal
  _syncFromSession: (session: DebugSessionState) => void;
}

export const useDebugStore = create<DebugStoreState>((set, get) => ({
  state: "idle",
  currentNodeId: null,
  breakpoints: new Set(),
  executionHistory: [],
  sessionState: null,
  watchVariables: new Map(),
  globalVariables: {},
  pinnedData: new Map(),
  slowMotion: false,
  slowMotionDelay: 500,
  useInteractiveDebug: true, // Default to new interactive debug mode

  // Breakpoint management
  setBreakpoint: (nodeId) => {
    set((state) => {
      const newBreakpoints = new Set(state.breakpoints);
      newBreakpoints.add(nodeId);
      return { breakpoints: newBreakpoints };
    });
  },

  removeBreakpoint: (nodeId) => {
    set((state) => {
      const newBreakpoints = new Set(state.breakpoints);
      newBreakpoints.delete(nodeId);
      return { breakpoints: newBreakpoints };
    });
  },

  toggleBreakpoint: (nodeId) => {
    const { breakpoints } = get();
    if (breakpoints.has(nodeId)) {
      get().removeBreakpoint(nodeId);
    } else {
      get().setBreakpoint(nodeId);
    }
  },

  hasBreakpoint: (nodeId) => {
    return get().breakpoints.has(nodeId);
  },

  clearBreakpoints: () => {
    set({ breakpoints: new Set() });
  },

  // Sync state from backend session
  _syncFromSession: (session: DebugSessionState) => {
    const history: NodeExecutionState[] = [];

    for (const [_nodeId, exec] of Object.entries(session.nodeExecutions)) {
      history.push({
        nodeId: exec.nodeId,
        nodeType: exec.nodeType,
        label: exec.label,
        status: exec.status as NodeExecutionState["status"],
        startTime: exec.startTime,
        endTime: exec.endTime,
        output: exec.output,
        error: exec.error,
        variables: exec.variables,
      });
    }

    // Map session state to debug state
    let debugState: DebugState = "idle";
    if (session.state === "running") debugState = "running";
    else if (session.state === "paused") debugState = "paused";
    else if (session.state === "stopped" || session.state === "error") debugState = "stopped";
    else if (session.state === "completed") debugState = "stopped";

    set({
      state: debugState,
      currentNodeId: session.currentNodeId,
      sessionState: session,
      executionHistory: history,
      globalVariables: session.globalVariables || {},
      breakpoints: new Set(session.breakpoints),
    });
  },

  // Debug control - Interactive mode
  startDebug: async () => {
    console.log("🚀 [debugStore] startDebug called!");
    const flowStore = useFlowStore.getState();
    const projectStore = useProjectStore.getState();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();
    const { useInteractiveDebug, breakpoints } = get();

    // Sync flowStore with projectStore data before generating DSL
    // This ensures AI Model connections and other special edges are available
    const activeBot = projectStore.activeBotId ? projectStore.bots.get(projectStore.activeBotId) : null;
    if (activeBot) {
      console.log("[debugStore] BEFORE sync - projectStore edges:", activeBot.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        edgeType: e.data?.edgeType
      })));

      flowStore.setNodes(activeBot.nodes);
      flowStore.setEdges(activeBot.edges);

      // Verify sync worked - get fresh state
      const syncedState = useFlowStore.getState();
      console.log("[debugStore] AFTER sync - flowStore edges:", syncedState.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        edgeType: e.data?.edgeType
      })));
    }

    // Get fresh state after sync
    const currentFlowState = useFlowStore.getState();

    if (currentFlowState.nodes.length === 0) {
      toast.warning("No nodes", "Add at least one node before debugging");
      return;
    }

    // Reset state
    set({
      state: "running",
      currentNodeId: null,
      executionHistory: [],
      sessionState: null,
      globalVariables: {},
    });

    // Mark all nodes as pending
    const nodeIds = currentFlowState.nodes.map((n) => n.id);
    nodeIds.forEach((nodeId) => {
      get().markNodeStatus(nodeId, "pending");
    });

    logs.info("Starting debug execution...");
    logs.openPanel();

    // Check for triggers and auto-add Manual if none exists
    const hasTrigger = currentFlowState.nodes.some(
      (node) => node.data.category === "trigger"
    );

    // Generate DSL from fresh state
    let dsl = currentFlowState.generateDSL();

    // Debug: Log the generated DSL to verify model_config_ is present
    console.log("[debugStore] Generated DSL:", JSON.stringify(dsl, null, 2));
    const aiClassifyNode = dsl.nodes.find((n: any) => n.type === 'ai.classify');
    if (aiClassifyNode) {
      console.log("[debugStore] AI Classify node:", aiClassifyNode);
      console.log("[debugStore] model_config_:", aiClassifyNode.model_config_);
    }

    if (!hasTrigger) {
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

    // Use interactive debug mode with breakpoints
    if (useInteractiveDebug) {
      try {
        logs.info("Starting interactive debug session...");

        const result = await invoke<DebugCommandResult>("debug_start", {
          dsl: JSON.stringify(dsl),
          breakpoints: Array.from(breakpoints),
        });

        if (result.success && result.sessionState) {
          get()._syncFromSession(result.sessionState);
          logs.success("Debug session started - paused at first node");
          toast.info("Debug Started", "Use Step (F10) or Continue (F5) to execute");
        } else {
          logs.error("Failed to start debug session: " + (result.message || "Unknown error"));
          toast.error("Debug Error", result.message || "Failed to start");
          set({ state: "stopped" });
        }
      } catch (error) {
        const errorMsg = String(error);
        logs.error("Debug error: " + errorMsg);
        toast.error("Debug Error", errorMsg.substring(0, 100));
        set({ state: "stopped" });
      }
    } else {
      // Legacy mode - run all at once
      try {
        logs.info("Compiling and executing bot...");

        const result = await invoke<ExecutionResult>("run_bot", {
          dsl: JSON.stringify(dsl)
        });

        // Parse and show logs
        if (result.logs && Array.isArray(result.logs)) {
          result.logs.forEach((log: string) => {
            // Try to extract node info from log lines
            const nodeMatch = log.match(/\[NODE:(\w+[-\w]*)\]/);
            if (nodeMatch) {
              const nodeId = nodeMatch[1];
              get().setCurrentNode(nodeId);
              get().markNodeStatus(nodeId, "running");
            }

            // Check for NODE_OUTPUT to capture node output data
            const outputMatch = log.match(/NODE_OUTPUT:([^:]+):(.+)$/);
            if (outputMatch) {
              const nodeId = outputMatch[1];
              const jsonData = outputMatch[2];
              try {
                const outputData = JSON.parse(jsonData);
                get().markNodeStatus(nodeId, "success", outputData);
              } catch {
                // If JSON parse fails, use raw string
                get().markNodeStatus(nodeId, "success", jsonData);
              }
            }

            if (log.includes("ERROR") || log.includes("FAIL")) {
              logs.error(log);
            } else if (log.includes("WARNING") || log.includes("WARN")) {
              logs.warning(log);
            } else if (log.includes("PASS") || log.includes("SUCCESS")) {
              logs.success(log);
            } else if (!log.includes("NODE_OUTPUT:")) {
              // Don't show NODE_OUTPUT lines in logs (already captured as data)
              logs.info(log);
            }
          });
        } else if (result.output) {
          logs.info("Bot output", result.output);
        }

        if (result.success) {
          // Mark all nodes as success
          nodeIds.forEach((nodeId) => {
            get().markNodeStatus(nodeId, "success");
          });
          logs.success("Debug execution completed successfully");
          toast.success("Debug complete", "Bot executed successfully");
          set({ state: "stopped" });
        } else {
          logs.error("Debug execution failed");
          toast.error("Debug failed", "Check the logs for details");
          set({ state: "stopped" });
        }
      } catch (error) {
        const errorMsg = String(error);
        logs.error("Debug error", errorMsg);
        toast.error("Debug error", errorMsg.substring(0, 100));
        set({ state: "stopped" });
      }
    }
  },

  pauseDebug: () => {
    set({ state: "paused" });
  },

  resumeDebug: async () => {
    const { sessionState, useInteractiveDebug } = get();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();

    if (!useInteractiveDebug || !sessionState) {
      set({ state: "running" });
      return;
    }

    try {
      logs.info("Continuing execution...");
      set({ state: "running" });

      const result = await invoke<DebugCommandResult>("debug_continue", {
        sessionStateJson: JSON.stringify(sessionState),
      });

      if (result.success && result.sessionState) {
        get()._syncFromSession(result.sessionState);

        if (result.sessionState.state === "completed") {
          logs.success("Execution completed");
          toast.success("Complete", "All nodes executed");
        } else if (result.sessionState.pausedAtBreakpoint) {
          logs.info(`Paused at breakpoint: ${result.sessionState.currentNodeId}`);
          toast.info("Breakpoint", `Paused at ${result.sessionState.currentNodeId}`);
        }
      } else {
        logs.error("Continue failed: " + (result.message || "Unknown error"));
      }
    } catch (error) {
      const errorMsg = String(error);
      logs.error("Continue error: " + errorMsg);
      toast.error("Error", errorMsg.substring(0, 100));
      set({ state: "paused" });
    }
  },

  stopDebug: async () => {
    const logs = useLogsStore.getState();

    try {
      // Stop both interactive debug session and any running bot process
      await Promise.all([
        invoke<DebugCommandResult>("debug_stop").catch(() => {}),
        invoke<boolean>("stop_bot").catch(() => {}),
      ]);
      logs.info("Execution stopped");
    } catch (error) {
      // Ignore errors when stopping
    }

    set({
      state: "stopped",
      currentNodeId: null,
      sessionState: null,
    });
  },

  stepOver: async () => {
    const { sessionState, useInteractiveDebug } = get();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();

    if (!useInteractiveDebug || !sessionState) {
      // Legacy: just pause
      set({ state: "paused" });
      return;
    }

    try {
      logs.info("Stepping to next node...");

      const result = await invoke<DebugCommandResult>("debug_step", {
        sessionStateJson: JSON.stringify(sessionState),
      });

      if (result.success && result.sessionState) {
        get()._syncFromSession(result.sessionState);

        // Log what happened
        const currentNode = result.sessionState.currentNodeId;
        const nodeExec = currentNode ? result.sessionState.nodeExecutions[currentNode] : null;

        if (nodeExec) {
          if (nodeExec.status === "success") {
            logs.success(`Node "${nodeExec.label}" executed successfully`);
          } else if (nodeExec.status === "error") {
            logs.error(`Node "${nodeExec.label}" failed: ${nodeExec.error}`);
          }
        }

        if (result.sessionState.state === "completed") {
          logs.success("All nodes executed");
          toast.success("Complete", "Debug execution finished");
        }
      } else {
        logs.error("Step failed: " + (result.message || "Unknown error"));
      }
    } catch (error) {
      const errorMsg = String(error);
      logs.error("Step error: " + errorMsg);
      toast.error("Step Error", errorMsg.substring(0, 100));
    }
  },

  stepInto: () => {
    // Step into subprocess - same as stepOver for now
    get().stepOver();
  },

  stepOut: () => {
    // Step out of subprocess - same as continue for now
    get().resumeDebug();
  },

  runToCursor: (_nodeId) => {
    // Run until reaching the specified node
    // TODO: Implement with backend support
    set({ state: "running" });
  },

  runSingleNode: async (nodeId: string) => {
    const flowStore = useFlowStore.getState();
    const projectStore = useProjectStore.getState();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();

    // Sync flowStore with projectStore data
    const activeBot = projectStore.activeBotId ? projectStore.bots.get(projectStore.activeBotId) : null;
    if (activeBot) {
      flowStore.setNodes(activeBot.nodes);
      flowStore.setEdges(activeBot.edges);
    }

    const currentFlowState = useFlowStore.getState();
    const node = currentFlowState.nodes.find(n => n.id === nodeId);

    if (!node) {
      toast.error("Node not found", "Cannot execute node");
      return;
    }

    // Mark node as running
    get().markNodeStatus(nodeId, "running");
    get().setCurrentNode(nodeId);
    logs.info(`Executing node: ${node.data.label}`);
    logs.openPanel();

    try {
      // Generate a mini DSL with just this node and its dependencies
      // For now, we'll create a minimal DSL
      const nodeDsl = {
        version: "1.0",
        bot: {
          id: `test-${nodeId}`,
          name: `Test: ${node.data.label}`,
          description: "Single node test execution",
        },
        nodes: [
          {
            id: nodeId,
            type: node.data.nodeType,
            config: node.data.config || {},
            outputs: {
              success: nodeId,
              error: nodeId,
            },
            label: node.data.label,
          },
        ],
        triggers: [nodeId],
        start_node: nodeId,
        variables: {},
      };

      // Find any connected config nodes (AI Model, MS365 Connection, etc.)
      const configEdges = currentFlowState.edges.filter(e =>
        e.target === nodeId &&
        (e.targetHandle === "model" || e.targetHandle === "connection" || e.targetHandle === "embeddings" || e.targetHandle === "memory")
      );

      for (const edge of configEdges) {
        const configNode = currentFlowState.nodes.find(n => n.id === edge.source);
        if (configNode) {
          // Add config node to DSL
          const configDslNode: any = {
            id: configNode.id,
            type: configNode.data.nodeType,
            config: configNode.data.config || {},
            label: configNode.data.label,
          };

          // Only add outputs for non-config nodes (AI config nodes don't have outputs)
          // But ms365.connection DOES have outputs (it produces a connection)
          const AI_CONFIG_NODES = ["ai.model", "ai.embeddings", "vectordb.memory"];
          if (!AI_CONFIG_NODES.includes(configNode.data.nodeType)) {
            configDslNode.outputs = { success: configNode.id, error: configNode.id };
          }

          nodeDsl.nodes.unshift(configDslNode);

          // Add the config to the main node
          const mainNodeIndex = nodeDsl.nodes.findIndex(n => n.id === nodeId);
          if (mainNodeIndex >= 0) {
            const handleName = edge.targetHandle || "model";

            // For connection nodes (like ms365.connection), pass the actual config
            // so the trigger can use it directly
            if (configNode.data.nodeType === "ms365.connection") {
              (nodeDsl.nodes[mainNodeIndex] as any).connection_config = configNode.data.config || {};
            } else {
              // For other config nodes, pass a reference
              (nodeDsl.nodes[mainNodeIndex] as any)[`${handleName}_config_`] = {
                nodeId: configNode.id,
                handleId: edge.sourceHandle || "default",
              };
            }
          }
        }
      }

      const result = await invoke<ExecutionResult>("run_bot", {
        dsl: JSON.stringify(nodeDsl),
      });

      if (result.success) {
        // Use output if available, otherwise use message, otherwise use a default
        const outputToShow = result.output || result.message || "Execution completed successfully";
        get().markNodeStatus(nodeId, "success", outputToShow);
        logs.success(`Node "${node.data.label}" executed successfully`);
        toast.success("Node executed", result.message || "Success");
      } else {
        const errorToShow = result.message || "Unknown error";
        get().markNodeStatus(nodeId, "error", undefined, errorToShow);
        logs.error(`Node "${node.data.label}" failed: ${errorToShow}`);
        toast.error("Node failed", errorToShow);
      }

      // Log output if available
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => {
          if (log.includes("ERROR") || log.includes("FAIL")) {
            logs.error(log);
          } else if (log.includes("WARNING") || log.includes("WARN")) {
            logs.warning(log);
          } else if (log.includes("PASS") || log.includes("SUCCESS")) {
            logs.success(log);
          } else {
            logs.info(log);
          }
        });
      }
    } catch (error) {
      const errorMsg = String(error);
      get().markNodeStatus(nodeId, "error", undefined, errorMsg);
      logs.error(`Node execution error: ${errorMsg}`);
      toast.error("Execution error", errorMsg.substring(0, 100));
    }

    get().setCurrentNode(null);
  },

  // Execution tracking
  setCurrentNode: (nodeId) => {
    set({ currentNodeId: nodeId });
  },

  markNodeStatus: (nodeId, status, output, error) => {
    set((state) => {
      const existingIndex = state.executionHistory.findIndex(
        (e) => e.nodeId === nodeId
      );

      const nodeState: NodeExecutionState = {
        nodeId,
        nodeType: "",
        label: nodeId,
        status,
        startTime: status === "running" ? Date.now() : undefined,
        endTime: status !== "running" && status !== "pending" ? Date.now() : undefined,
        output,
        error,
      };

      if (existingIndex >= 0) {
        const newHistory = [...state.executionHistory];
        newHistory[existingIndex] = {
          ...newHistory[existingIndex],
          ...nodeState,
        };
        return { executionHistory: newHistory };
      }

      return {
        executionHistory: [...state.executionHistory, nodeState],
      };
    });
  },

  clearExecutionHistory: () => {
    set({ executionHistory: [] });
  },

  // Variables
  setWatchVariable: (name, value) => {
    set((state) => {
      const newVars = new Map(state.watchVariables);
      newVars.set(name, value);
      return { watchVariables: newVars };
    });
  },

  clearWatchVariables: () => {
    set({ watchVariables: new Map() });
  },

  getNodeVariables: async (nodeId: string): Promise<Record<string, any>> => {
    const { sessionState } = get();

    if (!sessionState) {
      return {};
    }

    try {
      const variables = await invoke<Record<string, any>>("debug_get_variables", {
        sessionStateJson: JSON.stringify(sessionState),
        nodeId,
      });
      return variables;
    } catch {
      return {};
    }
  },

  // Settings
  setSlowMotion: (enabled) => {
    set({ slowMotion: enabled });
  },

  setSlowMotionDelay: (delay) => {
    set({ slowMotionDelay: delay });
  },

  setUseInteractiveDebug: (enabled) => {
    set({ useInteractiveDebug: enabled });
  },

  // Data Pinning (n8n-style)
  pinNodeData: (nodeId, data, label) => {
    set((state) => {
      const newPinnedData = new Map(state.pinnedData);
      newPinnedData.set(nodeId, {
        nodeId,
        data,
        pinnedAt: Date.now(),
        label,
      });
      return { pinnedData: newPinnedData };
    });
  },

  unpinNodeData: (nodeId) => {
    set((state) => {
      const newPinnedData = new Map(state.pinnedData);
      newPinnedData.delete(nodeId);
      return { pinnedData: newPinnedData };
    });
  },

  clearAllPinnedData: () => {
    set({ pinnedData: new Map() });
  },

  isPinned: (nodeId) => {
    return get().pinnedData.has(nodeId);
  },

  getPinnedData: (nodeId) => {
    return get().pinnedData.get(nodeId);
  },
}));

// Helper hook for getting node debug state
export function useNodeDebugState(nodeId: string) {
  const { currentNodeId, breakpoints, executionHistory, state, sessionState, pinnedData } = useDebugStore();

  // Try to get from session state first (more accurate)
  const sessionExec = sessionState?.nodeExecutions[nodeId];
  const execution = sessionExec || executionHistory.find((e) => e.nodeId === nodeId);

  const isCurrentNode = currentNodeId === nodeId;
  const hasBreakpoint = breakpoints.has(nodeId);
  const isDebugging = state !== "idle";
  const isPinned = pinnedData.has(nodeId);
  const pinnedDataEntry = pinnedData.get(nodeId);

  return {
    isCurrentNode,
    hasBreakpoint,
    isDebugging,
    status: execution?.status || "pending",
    output: execution?.output,
    error: execution?.error,
    variables: execution?.variables,
    isPinned,
    pinnedData: pinnedDataEntry?.data,
  };
}
