import { create } from "zustand";

export type DebugState = "idle" | "running" | "paused" | "stopped";

interface NodeExecutionState {
  nodeId: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  startTime?: number;
  endTime?: number;
  output?: any;
  error?: string;
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
  startDebug: () => void;
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
  startDebug: () => {
    set({
      state: "running",
      currentNodeId: null,
      executionHistory: [],
    });
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
