import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { useFlowStore } from "./flowStore";
import { useLogsStore } from "./logsStore";
import { useToastStore } from "./toastStore";

export type DebugState = "idle" | "running" | "paused" | "stopped";

interface NodeExecutionState {
  nodeId: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  startTime?: number;
  endTime?: number;
  output?: any;
  error?: string;
}

interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  logs?: string[];
}

interface DebugStoreState {
  // Debug state
  state: DebugState;
  currentNodeId: string | null;
  breakpoints: Set<string>;
  executionHistory: NodeExecutionState[];

  // Variables watch
  watchVariables: Map<string, any>;

  // Settings
  slowMotion: boolean;
  slowMotionDelay: number;

  // Actions
  setBreakpoint: (nodeId: string) => void;
  removeBreakpoint: (nodeId: string) => void;
  toggleBreakpoint: (nodeId: string) => void;
  hasBreakpoint: (nodeId: string) => boolean;
  clearBreakpoints: () => void;

  // Debug control
  startDebug: () => Promise<void>;
  pauseDebug: () => void;
  resumeDebug: () => void;
  stopDebug: () => void;
  stepOver: () => void;
  stepInto: () => void;
  stepOut: () => void;
  runToCursor: (nodeId: string) => void;

  // Execution tracking
  setCurrentNode: (nodeId: string | null) => void;
  markNodeStatus: (nodeId: string, status: NodeExecutionState["status"], output?: any, error?: string) => void;
  clearExecutionHistory: () => void;

  // Variables
  setWatchVariable: (name: string, value: any) => void;
  clearWatchVariables: () => void;

  // Settings
  setSlowMotion: (enabled: boolean) => void;
  setSlowMotionDelay: (delay: number) => void;
}

export const useDebugStore = create<DebugStoreState>((set, get) => ({
  state: "idle",
  currentNodeId: null,
  breakpoints: new Set(),
  executionHistory: [],
  watchVariables: new Map(),
  slowMotion: false,
  slowMotionDelay: 500,

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

  // Debug control
  startDebug: async () => {
    const flowStore = useFlowStore.getState();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();

    if (flowStore.nodes.length === 0) {
      toast.warning("No nodes", "Add at least one node before debugging");
      return;
    }

    // Reset state
    set({
      state: "running",
      currentNodeId: null,
      executionHistory: [],
    });

    // Mark all nodes as pending
    const nodeIds = flowStore.nodes.map((n) => n.id);
    nodeIds.forEach((nodeId) => {
      get().markNodeStatus(nodeId, "pending");
    });

    logs.info("Starting debug execution...");
    logs.openPanel();

    // Check for triggers and auto-add Manual if none exists
    const hasTrigger = flowStore.nodes.some(
      (node) => node.data.category === "trigger"
    );

    let dsl = flowStore.generateDSL();

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
  },

  pauseDebug: () => {
    set({ state: "paused" });
  },

  resumeDebug: () => {
    set({ state: "running" });
  },

  stopDebug: () => {
    set({
      state: "stopped",
      currentNodeId: null,
    });
  },

  stepOver: () => {
    // Step over will be implemented when connected to the actual executor
    set({ state: "paused" });
  },

  stepInto: () => {
    // Step into subprocess
    set({ state: "paused" });
  },

  stepOut: () => {
    // Step out of subprocess
    set({ state: "paused" });
  },

  runToCursor: (_nodeId) => {
    // Run until reaching the specified node
    // TODO: Implement when connected to actual executor
    set({ state: "running" });
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

  // Settings
  setSlowMotion: (enabled) => {
    set({ slowMotion: enabled });
  },

  setSlowMotionDelay: (delay) => {
    set({ slowMotionDelay: delay });
  },
}));

// Helper hook for getting node debug state
export function useNodeDebugState(nodeId: string) {
  const { currentNodeId, breakpoints, executionHistory, state } = useDebugStore();

  const execution = executionHistory.find((e) => e.nodeId === nodeId);
  const isCurrentNode = currentNodeId === nodeId;
  const hasBreakpoint = breakpoints.has(nodeId);
  const isDebugging = state !== "idle";

  return {
    isCurrentNode,
    hasBreakpoint,
    isDebugging,
    status: execution?.status || "pending",
    output: execution?.output,
    error: execution?.error,
  };
}
