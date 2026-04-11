import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { useFlowStore } from "./flowStore";
import { useProjectStore } from "./projectStore";
import { useLogsStore } from "./logsStore";
import { useToastStore } from "./toastStore";
import {
  parseNodeRuntimeTelemetryLine,
  extractLatestNodeInputTelemetry,
  extractLatestNodeRuntimeTelemetry,
  getSchemaCandidateFromNodeData,
} from "../utils/nodeRuntimeTelemetry";
import {
  buildExpressionNormalizationIndex,
  normalizeN8nExpressionsInValue,
} from "../utils/expressionSyntax";

export type DebugState = "idle" | "running" | "paused" | "stopped";

interface NodeExecutionState {
  nodeId: string;
  nodeType: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  startTime?: number;
  endTime?: number;
  input?: any;
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

// Discovered schema for a field
interface DiscoveredField {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "null";
  items?: DiscoveredField[]; // For arrays - schema of items
  fields?: DiscoveredField[]; // For objects - nested fields
}

// Discovered schema entry for a node
interface DiscoveredSchema {
  nodeId: string;
  nodeType: string;
  fields: DiscoveredField[];
  discoveredAt: number;
  sampleCount: number;
}

// Infer schema from any data value
function inferSchema(data: any, maxDepth: number = 3): DiscoveredField[] {
  if (data === null || data === undefined) return [];
  
  if (Array.isArray(data)) {
    // For arrays, analyze items to discover common schema
    if (data.length === 0) return [];
    
    // Sample first few items to infer schema
    const sampleSize = Math.min(data.length, 5);
    const itemSchemas: Map<string, DiscoveredField> = new Map();
    
    for (let i = 0; i < sampleSize; i++) {
      const item = data[i];
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const itemFields = inferSchema(item, maxDepth - 1);
        for (const field of itemFields) {
          if (!itemSchemas.has(field.name)) {
            itemSchemas.set(field.name, field);
          }
        }
      }
    }
    
    return Array.from(itemSchemas.values());
  }
  
  if (typeof data === 'object') {
    const fields: DiscoveredField[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      const field: DiscoveredField = {
        name: key,
        type: inferType(value),
      };
      
      if (maxDepth > 0) {
        if (Array.isArray(value) && value.length > 0) {
          field.items = inferSchema(value, maxDepth - 1);
        } else if (typeof value === 'object' && value !== null) {
          field.fields = inferSchema(value, maxDepth - 1);
        }
      }
      
      fields.push(field);
    }
    
    return fields;
  }
  
  return [];
}

function inferType(value: any): DiscoveredField['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'string';
}

// Pinned data for flow-style data pinning
interface PinnedDataEntry {
  nodeId: string;
  data: any;
  pinnedAt: number;
  label: string;
}

const LIVE_DEBUG_WAIT_TIMEOUT_MIN_MS = 1000;
const LIVE_DEBUG_WAIT_TIMEOUT_MAX_MS = 900000;
const LIVE_DEBUG_WAIT_TIMEOUT_DEFAULT_MS = 180000;
const LIVE_DEBUG_WAIT_TIMEOUT_STORAGE_KEY = "skuldbot_live_debug_wait_timeout_ms";

function clampLiveDebugWaitTimeoutMs(value: number): number {
  if (!Number.isFinite(value)) return LIVE_DEBUG_WAIT_TIMEOUT_DEFAULT_MS;
  return Math.min(
    LIVE_DEBUG_WAIT_TIMEOUT_MAX_MS,
    Math.max(LIVE_DEBUG_WAIT_TIMEOUT_MIN_MS, Math.round(value))
  );
}

function loadLiveDebugWaitTimeoutMs(): number {
  try {
    const raw = localStorage.getItem(LIVE_DEBUG_WAIT_TIMEOUT_STORAGE_KEY);
    if (!raw) return LIVE_DEBUG_WAIT_TIMEOUT_DEFAULT_MS;
    const parsed = Number(raw);
    return clampLiveDebugWaitTimeoutMs(parsed);
  } catch {
    return LIVE_DEBUG_WAIT_TIMEOUT_DEFAULT_MS;
  }
}

interface DebugStoreState {
  // Debug state
  state: DebugState;
  currentNodeId: string | null;
  pauseRequested: boolean;
  breakpoints: Set<string>;
  executionHistory: NodeExecutionState[];

  // Session state from backend
  sessionState: DebugSessionState | null;

  // Variables watch
  watchVariables: Map<string, any>;
  globalVariables: Record<string, any>;

  // Data Pinning (flow-style)
  pinnedData: Map<string, PinnedDataEntry>;
  
  // Schema Discovery - automatically inferred schemas from execution
  discoveredSchemas: Map<string, DiscoveredSchema>;

  // Settings
  slowMotion: boolean;
  slowMotionDelay: number;
  useInteractiveDebug: boolean; // Toggle between old and new debug mode
  liveDebugWaitTimeoutMs: number;

  // Actions
  setBreakpoint: (nodeId: string) => void;
  removeBreakpoint: (nodeId: string) => void;
  toggleBreakpoint: (nodeId: string) => void;
  hasBreakpoint: (nodeId: string) => boolean;
  clearBreakpoints: () => void;

  // Debug control
  startDebug: () => Promise<void>;
  pauseDebug: () => Promise<void>;
  resumeDebug: () => Promise<void>;
  stopDebug: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => void;
  stepOut: () => void;
  runToCursor: (nodeId: string) => Promise<void>;
  runSingleNode: (nodeId: string) => Promise<void>;

  // Execution tracking
  setCurrentNode: (nodeId: string | null) => void;
  markNodeStatus: (nodeId: string, status: NodeExecutionState["status"], output?: any, error?: string) => void;
  markNodeInput: (nodeId: string, input?: any) => void;
  clearExecutionHistory: () => void;

  // Variables
  setWatchVariable: (name: string, value: any) => void;
  clearWatchVariables: () => void;
  getNodeVariables: (nodeId: string) => Promise<Record<string, any>>;

  // Settings
  setSlowMotion: (enabled: boolean) => void;
  setSlowMotionDelay: (delay: number) => void;
  setUseInteractiveDebug: (enabled: boolean) => void;
  setLiveDebugWaitTimeoutMs: (timeoutMs: number) => void;

  // Data Pinning (flow-style)
  pinNodeData: (nodeId: string, data: any, label: string) => void;
  unpinNodeData: (nodeId: string) => void;
  clearAllPinnedData: () => void;
  isPinned: (nodeId: string) => boolean;
  getPinnedData: (nodeId: string) => PinnedDataEntry | undefined;

  // Schema Discovery
  discoverSchema: (nodeId: string, nodeType: string, data: any) => void;
  getDiscoveredSchema: (nodeId: string, nodeType?: string) => DiscoveredSchema | undefined;
  clearDiscoveredSchemas: () => void;

  // Internal
  _syncFromSession: (session: DebugSessionState) => void;
}

export const useDebugStore = create<DebugStoreState>((set, get) => ({
  state: "idle",
  currentNodeId: null,
  pauseRequested: false,
  breakpoints: new Set(),
  executionHistory: [],
  sessionState: null,
  watchVariables: new Map(),
  globalVariables: {},
  pinnedData: new Map(),
  discoveredSchemas: (() => {
    // Hydrate from localStorage on init
    try {
      const stored = localStorage.getItem('skuldbot_discovered_schemas');
      if (stored) {
        const allSchemas = JSON.parse(stored) as Record<string, DiscoveredSchema>;
        return new Map(Object.entries(allSchemas));
      }
    } catch (e) {
      console.warn('Failed to hydrate schemas from localStorage:', e);
    }
    return new Map();
  })(),
  slowMotion: false,
  slowMotionDelay: 500,
  useInteractiveDebug: true,
  liveDebugWaitTimeoutMs: loadLiveDebugWaitTimeoutMs(),

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

    for (const [, exec] of Object.entries(session.nodeExecutions)) {
      history.push({
        nodeId: exec.nodeId,
        nodeType: exec.nodeType,
        label: exec.label,
        status: exec.status as NodeExecutionState["status"],
        startTime: exec.startTime,
        endTime: exec.endTime,
        input: exec.input,
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

    set((state) => ({
      state: debugState,
      currentNodeId: session.currentNodeId,
      sessionState: session,
      executionHistory: history,
      globalVariables: session.globalVariables || {},
      breakpoints: new Set(session.breakpoints),
      pauseRequested:
        session.state === "paused" ||
        session.state === "completed" ||
        session.state === "stopped" ||
        session.state === "error"
          ? false
          : state.pauseRequested,
    }));
  },

  // Debug control - Interactive mode
  startDebug: async () => {
    console.log("🚀 [debugStore] startDebug called!");
    const flowStore = useFlowStore.getState();
    const projectStore = useProjectStore.getState();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();
    const { useInteractiveDebug, breakpoints, liveDebugWaitTimeoutMs } = get();

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
      pauseRequested: false,
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
    const dsl = currentFlowState.generateDSL();

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
          timeoutMs: liveDebugWaitTimeoutMs,
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

            const runtimeTelemetry = parseNodeRuntimeTelemetryLine(log);
            if (runtimeTelemetry?.nodeId) {
              const { nodeId, data, channel } = runtimeTelemetry;
              if (channel === "input") {
                get().markNodeInput(nodeId, data);
              } else {
                get().markNodeStatus(nodeId, "success", data);
                const flowNodes = useFlowStore.getState().nodes;
                const flowNode = flowNodes.find((n) => n.id === nodeId);
                const schemaCandidate = getSchemaCandidateFromNodeData(data);
                if (flowNode && schemaCandidate && typeof schemaCandidate === "object") {
                  get().discoverSchema(nodeId, flowNode.data.nodeType, schemaCandidate);
                }
              }
            } else if (log.includes("ERROR") || log.includes("FAIL")) {
              logs.error(log);
            } else if (log.includes("WARNING") || log.includes("WARN")) {
              logs.warning(log);
            } else if (log.includes("PASS") || log.includes("SUCCESS")) {
              logs.success(log);
            } else if (!log.includes("NODE_OUTPUT:") && !log.includes("NODE_ENVELOPE:") && !log.includes("NODE_INPUT:")) {
              // Don't show telemetry lines in logs (already captured as runtime data)
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

  pauseDebug: async () => {
    const { sessionState, useInteractiveDebug } = get();
    const logs = useLogsStore.getState();

    if (!useInteractiveDebug || !sessionState) {
      set({ state: "paused" });
      return;
    }

    try {
      const result = await invoke<DebugCommandResult>("debug_pause");
      if (result.success && result.sessionState) {
        get()._syncFromSession(result.sessionState);
        set({
          pauseRequested: result.sessionState.state !== "paused",
        });
        logs.info(result.message || "Pause requested");
      } else {
        logs.error("Pause failed: " + (result.message || "Unknown error"));
      }
    } catch (error) {
      const errorMsg = String(error);
      logs.error("Pause error: " + errorMsg);
    }
  },

  resumeDebug: async () => {
    const { sessionState, useInteractiveDebug, liveDebugWaitTimeoutMs } = get();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();

    if (!useInteractiveDebug || !sessionState) {
      set({ state: "running" });
      return;
    }

    try {
      logs.info("Continuing execution...");
      set({ state: "running", pauseRequested: false });

      const result = await invoke<DebugCommandResult>("debug_continue", {
        sessionStateJson: JSON.stringify(sessionState),
        timeoutMs: liveDebugWaitTimeoutMs,
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

    // IMMEDIATELY reset state to idle so Run button becomes enabled
    set({
      state: "idle",
      currentNodeId: null,
      pauseRequested: false,
    });

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

      // Keep session state for inspection but ensure state is idle
      set({
        state: "idle",
        pauseRequested: false,
      });
  },

  stepOver: async () => {
    const { sessionState, useInteractiveDebug, liveDebugWaitTimeoutMs } = get();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();

    if (!useInteractiveDebug || !sessionState) {
      // Legacy: just pause
      set({ state: "paused" });
      return;
    }

    try {
      logs.info("Stepping to next node...");
      set({ pauseRequested: false });

      const result = await invoke<DebugCommandResult>("debug_step", {
        sessionStateJson: JSON.stringify(sessionState),
        timeoutMs: liveDebugWaitTimeoutMs,
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

  runToCursor: async (nodeId) => {
    const { sessionState, useInteractiveDebug, liveDebugWaitTimeoutMs } = get();
    const logs = useLogsStore.getState();
    const toast = useToastStore.getState();

    if (!useInteractiveDebug || !sessionState) {
      await get().resumeDebug();
      return;
    }

    const targetExists = sessionState.executionOrder.includes(nodeId);
    if (!targetExists) {
      logs.error(`Run to cursor failed: node ${nodeId} is not in execution order`);
      toast.error("Run to Cursor", "Target node is not part of the current debug session");
      return;
    }

    logs.info(`Running to cursor: ${nodeId}`);
    set({ state: "running", pauseRequested: false });

    try {
      let currentSession = sessionState;
      const maxSteps = Math.max(currentSession.executionOrder.length * 3, 50);

      for (let step = 0; step < maxSteps; step++) {
        const result = await invoke<DebugCommandResult>("debug_step", {
          sessionStateJson: JSON.stringify(currentSession),
          timeoutMs: liveDebugWaitTimeoutMs,
        });

        if (!result.success || !result.sessionState) {
          const msg = result.message || "Unknown debug step error";
          logs.error(`Run to cursor failed: ${msg}`);
          toast.error("Run to Cursor", msg.substring(0, 120));
          set({ state: "paused" });
          return;
        }

        currentSession = result.sessionState;
        get()._syncFromSession(currentSession);

        if (currentSession.currentNodeId === nodeId) {
          logs.info(`Reached cursor at node: ${nodeId}`);
          toast.info("Run to Cursor", `Paused at ${nodeId}`);
          set({ state: "paused" });
          return;
        }

        if (currentSession.state === "completed") {
          logs.warning(`Execution completed before reaching node: ${nodeId}`);
          toast.warning("Run to Cursor", "Execution finished before reaching target node");
          return;
        }
      }

      logs.error("Run to cursor hit safety step limit");
      toast.error("Run to Cursor", "Step limit reached before hitting target node");
      set({ state: "paused" });
    } catch (error) {
      const errorMsg = String(error);
      logs.error("Run to cursor error: " + errorMsg);
      toast.error("Run to Cursor", errorMsg.substring(0, 120));
      set({ state: "paused" });
    }
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
      const expressionIndex = buildExpressionNormalizationIndex(currentFlowState.nodes);
      const normalizedMainConfig = normalizeN8nExpressionsInValue(
        node.data.config || {},
        expressionIndex,
        nodeId
      ) as Record<string, any>;
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
            config: normalizedMainConfig,
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
          const normalizedConfigNodeConfig = normalizeN8nExpressionsInValue(
            configNode.data.config || {},
            expressionIndex,
            configNode.id
          ) as Record<string, any>;
          // Add config node to DSL
          const configDslNode: any = {
            id: configNode.id,
            type: configNode.data.nodeType,
            config: normalizedConfigNodeConfig,
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
              (nodeDsl.nodes[mainNodeIndex] as any).connection_config = normalizedConfigNodeConfig;
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
        const runtimeInputTelemetry = extractLatestNodeInputTelemetry(result.output);
        if (runtimeInputTelemetry?.data !== undefined) {
          get().markNodeInput(nodeId, runtimeInputTelemetry.data);
        }
        const runtimeTelemetry = extractLatestNodeRuntimeTelemetry(result.output);
        const runtimeData = runtimeTelemetry?.data;
        // Prefer telemetry payload (NODE_ENVELOPE over NODE_OUTPUT), otherwise fallback
        const outputToShow = runtimeData ?? result.output ?? result.message ?? "Execution completed successfully";
        get().markNodeStatus(nodeId, "success", outputToShow);
        // Discover schema from business payload (json/items/result), not raw wrapper
        const schemaCandidate = getSchemaCandidateFromNodeData(outputToShow);
        if (schemaCandidate && typeof schemaCandidate === "object") {
          get().discoverSchema(nodeId, node.data.nodeType, schemaCandidate);
        }
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
          if (log.includes("NODE_INPUT:") || log.includes("NODE_OUTPUT:") || log.includes("NODE_ENVELOPE:")) {
            return;
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
    console.log("[DebugStore] markNodeStatus called:", { nodeId, status, output: typeof output === 'object' ? JSON.stringify(output).substring(0, 100) : output, error });
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
      console.log("[DebugStore] executionHistory will have:", state.executionHistory.length + (existingIndex >= 0 ? 0 : 1), "entries");

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

  markNodeInput: (nodeId, input) => {
    set((state) => {
      const existingIndex = state.executionHistory.findIndex((e) => e.nodeId === nodeId);
      if (existingIndex >= 0) {
        const newHistory = [...state.executionHistory];
        newHistory[existingIndex] = {
          ...newHistory[existingIndex],
          input,
        };
        return { executionHistory: newHistory };
      }

      const nodeState: NodeExecutionState = {
        nodeId,
        nodeType: "",
        label: nodeId,
        status: "pending",
        input,
      };
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

  setLiveDebugWaitTimeoutMs: (timeoutMs) => {
    const bounded = clampLiveDebugWaitTimeoutMs(timeoutMs);
    try {
      localStorage.setItem(LIVE_DEBUG_WAIT_TIMEOUT_STORAGE_KEY, String(bounded));
    } catch {
      // ignore persistence errors
    }
    set({ liveDebugWaitTimeoutMs: bounded });
  },

  // Data Pinning (flow-style)
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

  // Schema Discovery with localStorage persistence
  // Stores by BOTH nodeId (specific) and nodeType (global for all nodes of same type)
  discoverSchema: (nodeId, nodeType, data) => {
    if (!data) return;
    
    const fields = inferSchema(data, 4);
    if (fields.length === 0) return;
    
    const schema: DiscoveredSchema = {
      nodeId,
      nodeType,
      fields,
      discoveredAt: Date.now(),
      sampleCount: (get().discoveredSchemas.get(nodeId)?.sampleCount || 0) + 1,
    };
    
    set((state) => {
      const newSchemas = new Map(state.discoveredSchemas);
      // Store by nodeId (specific instance)
      newSchemas.set(nodeId, schema);
      // Also store by nodeType (benefits ALL nodes of this type)
      newSchemas.set(`type:${nodeType}`, schema);
      
      // Persist to localStorage
      try {
        const allSchemas: Record<string, DiscoveredSchema> = {};
        newSchemas.forEach((s, id) => { allSchemas[id] = s; });
        localStorage.setItem('skuldbot_discovered_schemas', JSON.stringify(allSchemas));
      } catch (e) {
        console.warn('Failed to persist schemas to localStorage:', e);
      }
      
      return { discoveredSchemas: newSchemas };
    });
  },

  getDiscoveredSchema: (nodeId, nodeType?: string) => {
    const state = get();
    
    // First check specific nodeId
    const nodeSchema = state.discoveredSchemas.get(nodeId);
    if (nodeSchema) return nodeSchema;
    
    // Then check by nodeType (global schema for this type)
    if (nodeType) {
      const typeSchema = state.discoveredSchemas.get(`type:${nodeType}`);
      if (typeSchema) return typeSchema;
    }
    
    // Try to load from localStorage if not in memory
    try {
      const stored = localStorage.getItem('skuldbot_discovered_schemas');
      if (stored) {
        const allSchemas = JSON.parse(stored) as Record<string, DiscoveredSchema>;
        
        // Check nodeId first
        if (allSchemas[nodeId]) {
          set((s) => {
            const newSchemas = new Map(s.discoveredSchemas);
            newSchemas.set(nodeId, allSchemas[nodeId]);
            return { discoveredSchemas: newSchemas };
          });
          return allSchemas[nodeId];
        }
        
        // Check nodeType
        if (nodeType && allSchemas[`type:${nodeType}`]) {
          set((s) => {
            const newSchemas = new Map(s.discoveredSchemas);
            newSchemas.set(`type:${nodeType}`, allSchemas[`type:${nodeType}`]);
            return { discoveredSchemas: newSchemas };
          });
          return allSchemas[`type:${nodeType}`];
        }
      }
    } catch (e) {
      console.warn('Failed to load schema from localStorage:', e);
    }
    
    return undefined;
  },

  clearDiscoveredSchemas: () => {
    set({ discoveredSchemas: new Map() });
    try {
      localStorage.removeItem('skuldbot_discovered_schemas');
    } catch (e) {
      console.warn('Failed to clear schemas from localStorage:', e);
    }
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
