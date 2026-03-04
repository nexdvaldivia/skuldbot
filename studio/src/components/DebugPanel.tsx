import { Play, Pause, Square, StepForward, SkipForward, Circle, Trash2, Eye, ChevronDown, ChevronRight, Settings2, CheckCircle2, XCircle, Loader2, Timer } from "lucide-react";
import { useDebugStore, DebugState } from "../store/debugStore";
import { cn } from "../lib/utils";
import { useState } from "react";

interface DebugPanelProps {
  className?: string;
}

export default function DebugPanel({ className }: DebugPanelProps) {
  const {
    state,
    breakpoints,
    executionHistory,
    sessionState,
    pauseRequested,
    globalVariables,
    slowMotion,
    slowMotionDelay,
    useInteractiveDebug,
    liveDebugWaitTimeoutMs,
    startDebug,
    pauseDebug,
    resumeDebug,
    stopDebug,
    stepOver,
    clearBreakpoints,
    clearExecutionHistory,
    setSlowMotion,
    setSlowMotionDelay,
    setUseInteractiveDebug,
    setLiveDebugWaitTimeoutMs,
  } = useDebugStore();

  const [showVariables, setShowVariables] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const isIdle = state === "idle";
  const isRunning = state === "running";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";

  const getStateLabel = (s: DebugState): string => {
    if (pauseRequested && s === "running") return "Pause Requested";
    switch (s) {
      case "idle": return "Ready";
      case "running": return "Running...";
      case "paused": return "Paused";
      case "stopped": return "Stopped";
    }
  };

  const getStateColor = (s: DebugState): string => {
    if (pauseRequested && s === "running") return "text-amber-600";
    switch (s) {
      case "idle": return "text-slate-500";
      case "running": return "text-green-500";
      case "paused": return "text-yellow-500";
      case "stopped": return "text-red-500";
    }
  };

  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const formatValue = (value: any): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  return (
    <div className={cn("bg-white border-b", className)}>
      {/* Debug Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b">
        {/* Play/Pause/Resume */}
        {isIdle || isStopped ? (
          <button
            onClick={startDebug}
            className="p-1.5 rounded hover:bg-green-100 text-green-600 transition-colors"
            title="Start Debug (F5)"
          >
            <Play className="w-4 h-4" />
          </button>
        ) : isRunning ? (
          <button
            onClick={pauseDebug}
            className="p-1.5 rounded hover:bg-yellow-100 text-yellow-600 transition-colors"
            title="Pause (F6)"
          >
            <Pause className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={resumeDebug}
            className="p-1.5 rounded hover:bg-green-100 text-green-600 transition-colors"
            title="Continue (F5)"
          >
            <Play className="w-4 h-4" />
          </button>
        )}

        {/* Stop - Always enabled to allow force stopping hung processes */}
        <button
          onClick={stopDebug}
          className="p-1.5 rounded transition-colors hover:bg-red-100 text-red-600"
          title="Stop (Shift+F5)"
        >
          <Square className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Step Over */}
        <button
          onClick={stepOver}
          disabled={!isPaused}
          className={cn(
            "p-1.5 rounded transition-colors",
            !isPaused
              ? "text-slate-300 cursor-not-allowed"
              : "hover:bg-blue-100 text-blue-600"
          )}
          title="Step Over (F10)"
        >
          <StepForward className="w-4 h-4" />
        </button>

        {/* Skip to Next Breakpoint */}
        <button
          onClick={resumeDebug}
          disabled={!isPaused}
          className={cn(
            "p-1.5 rounded transition-colors",
            !isPaused
              ? "text-slate-300 cursor-not-allowed"
              : "hover:bg-blue-100 text-blue-600"
          )}
          title="Continue to Next Breakpoint (F8)"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* State indicator */}
        <span className={cn("text-xs font-medium", getStateColor(state))}>
          {getStateLabel(state)}
        </span>
        {pauseRequested && isRunning && (
          <span className="text-xs text-amber-600 ml-1">
            (next node boundary)
          </span>
        )}

        {/* Session info */}
        {sessionState && (
          <span className="text-xs text-slate-400 ml-2">
            Node {sessionState.executionOrder.indexOf(sessionState.currentNodeId || "") + 1}/{sessionState.executionOrder.length}
          </span>
        )}

        <div className="flex-1" />

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={cn(
            "p-1.5 rounded transition-colors",
            showSettings ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:text-slate-600"
          )}
          title="Debug Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>

        {/* Variables toggle */}
        <button
          onClick={() => setShowVariables(!showVariables)}
          className={cn(
            "p-1.5 rounded transition-colors",
            showVariables ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600"
          )}
          title="Show Variables"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-3 py-2 border-b bg-slate-50">
          <div className="flex items-center gap-4">
            {/* Interactive debug toggle */}
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={useInteractiveDebug}
                onChange={(e) => setUseInteractiveDebug(e.target.checked)}
                className="rounded border-slate-300"
              />
              Step-by-Step Debug
            </label>

            {/* Slow motion toggle */}
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={slowMotion}
                onChange={(e) => setSlowMotion(e.target.checked)}
                className="rounded border-slate-300"
              />
              Slow Motion
            </label>

            {slowMotion && (
              <input
                type="number"
                value={slowMotionDelay}
                onChange={(e) => setSlowMotionDelay(parseInt(e.target.value) || 500)}
                min={100}
                max={5000}
                step={100}
                className="w-16 px-1.5 py-0.5 text-xs border rounded"
                title="Delay between steps (ms)"
              />
            )}

            <label className="flex items-center gap-1 text-xs text-slate-600">
              <Timer className="w-3 h-3" />
              Live Wait (s)
              <input
                type="number"
                value={Math.round(liveDebugWaitTimeoutMs / 1000)}
                onChange={(e) => {
                  const seconds = parseInt(e.target.value, 10);
                  const safeSeconds = Number.isFinite(seconds) ? seconds : 180;
                  setLiveDebugWaitTimeoutMs(safeSeconds * 1000);
                }}
                min={1}
                max={900}
                step={1}
                className="w-16 px-1.5 py-0.5 text-xs border rounded ml-1"
                title="Tiempo máximo de espera por evento de debug en vivo (segundos)"
              />
            </label>
          </div>
        </div>
      )}

      {/* Breakpoints Section */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-600">
            Breakpoints ({breakpoints.size})
          </span>
          {breakpoints.size > 0 && (
            <button
              onClick={clearBreakpoints}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              title="Clear all breakpoints"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {breakpoints.size === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No breakpoints set. Click on a node to toggle breakpoint.
          </p>
        ) : (
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {Array.from(breakpoints).map((nodeId) => (
              <div
                key={nodeId}
                className="flex items-center gap-2 text-xs text-slate-600 py-0.5"
              >
                <Circle className="w-2 h-2 fill-red-500 text-red-500" />
                <span className="truncate font-mono">{nodeId}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variables Section */}
      {showVariables && sessionState && Object.keys(sessionState.nodeExecutions).length > 0 && (
        <div className="px-3 py-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600">
              Variables
            </span>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {/* Global Variables */}
            {Object.keys(globalVariables).length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => toggleNodeExpand("__global__")}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {expandedNodes.has("__global__") ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Global Variables
                </button>
                {expandedNodes.has("__global__") && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {Object.entries(globalVariables).map(([key, value]) => (
                      <div key={key} className="text-xs font-mono">
                        <span className="text-purple-600">{key}</span>
                        <span className="text-slate-400">: </span>
                        <span className="text-slate-600">{formatValue(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Node Variables */}
            {Object.entries(sessionState.nodeExecutions)
              .filter(([, exec]) => exec.status !== "pending")
              .map(([nodeId, exec]) => (
                <div key={nodeId}>
                  <button
                    onClick={() => toggleNodeExpand(nodeId)}
                    className={cn(
                      "flex items-center gap-1 text-xs font-medium w-full text-left",
                      exec.status === "success" && "text-green-600",
                      exec.status === "error" && "text-red-600",
                      exec.status === "running" && "text-blue-600"
                    )}
                  >
                    {expandedNodes.has(nodeId) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {exec.label || nodeId}
                    <span className="text-slate-400 text-[10px] ml-1">
                      ({exec.status})
                    </span>
                  </button>

                  {expandedNodes.has(nodeId) && exec.variables && (
                    <div className="ml-4 mt-1 space-y-0.5 bg-slate-50 rounded p-1.5">
                      {Object.entries(exec.variables).map(([key, value]) => (
                        <div key={key} className="text-xs font-mono">
                          <span className="text-purple-600">{key}</span>
                          <span className="text-slate-400">: </span>
                          <span className="text-slate-600 break-all">
                            {formatValue(value)}
                          </span>
                        </div>
                      ))}
                      {exec.output && (
                        <div className="text-xs font-mono mt-1 pt-1 border-t border-slate-200">
                          <span className="text-blue-600">output</span>
                          <span className="text-slate-400">: </span>
                          <pre className="text-slate-600 whitespace-pre-wrap text-[10px] mt-0.5">
                            {formatValue(exec.output)}
                          </pre>
                        </div>
                      )}
                      {exec.error && (
                        <div className="text-xs font-mono mt-1 pt-1 border-t border-red-200">
                          <span className="text-red-600">error</span>
                          <span className="text-slate-400">: </span>
                          <span className="text-red-500">{exec.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Execution Timeline (flow-style) */}
      {executionHistory.length > 0 && (() => {
        // Calculate total execution time
        const completedNodes = executionHistory.filter(
          exec => exec.startTime && exec.endTime && (exec.status === "success" || exec.status === "error")
        );
        const totalTime = completedNodes.reduce((acc, exec) => {
          return acc + ((exec.endTime || 0) - (exec.startTime || 0));
        }, 0);

        // Get item counts from nodeExecutions
        const getItemCount = (exec: typeof executionHistory[0]) => {
          const output = sessionState?.nodeExecutions?.[exec.nodeId]?.output;
          if (!output) return null;
          if (Array.isArray(output)) return output.length;
          if (typeof output === "object" && output !== null) {
            if (Array.isArray(output.data)) return output.data.length;
            if (Array.isArray(output.rows)) return output.rows.length;
            if (Array.isArray(output.items)) return output.items.length;
            if (Array.isArray(output.records)) return output.records.length;
          }
          return null;
        };

        return (
          <div className="px-3 py-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Timer className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-medium text-slate-600">
                  Timeline
                </span>
              </div>
              <div className="flex items-center gap-2">
                {totalTime > 0 && (
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    Total: {(totalTime / 1000).toFixed(1)}s
                  </span>
                )}
                <button
                  onClick={clearExecutionHistory}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                  title="Clear timeline"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {executionHistory.map((exec, idx) => {
                const duration = exec.startTime && exec.endTime
                  ? ((exec.endTime - exec.startTime) / 1000).toFixed(1)
                  : null;
                const itemCount = getItemCount(exec);
                const isLast = idx === executionHistory.length - 1;

                return (
                  <div
                    key={`${exec.nodeId}-${idx}`}
                    className="flex items-start gap-1.5"
                  >
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center pt-1">
                      {/* Status icon */}
                      {exec.status === "success" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : exec.status === "error" ? (
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      ) : exec.status === "running" ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                      ) : exec.status === "skipped" ? (
                        <Circle className="w-3.5 h-3.5 text-slate-300" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      {/* Vertical line */}
                      {!isLast && (
                        <div className={cn(
                          "w-0.5 h-full min-h-[16px] mt-0.5",
                          exec.status === "success" ? "bg-green-200" :
                          exec.status === "error" ? "bg-red-200" :
                          "bg-slate-200"
                        )} />
                      )}
                    </div>

                    {/* Node info */}
                    <div className={cn(
                      "flex-1 rounded px-2 py-1 text-xs",
                      exec.status === "success" && "bg-green-50",
                      exec.status === "error" && "bg-red-50",
                      exec.status === "running" && "bg-blue-50",
                      exec.status === "pending" && "bg-slate-50",
                      exec.status === "skipped" && "bg-slate-50/50"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "font-medium truncate",
                          exec.status === "success" && "text-green-700",
                          exec.status === "error" && "text-red-700",
                          exec.status === "running" && "text-blue-700",
                          exec.status === "skipped" && "text-slate-400",
                          exec.status === "pending" && "text-slate-600"
                        )}>
                          {exec.label || exec.nodeId}
                        </span>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          {duration && (
                            <span className={cn(
                              "text-[10px] px-1 py-0.5 rounded",
                              exec.status === "success" ? "text-green-600 bg-green-100" :
                              exec.status === "error" ? "text-red-600 bg-red-100" :
                              "text-slate-500 bg-slate-100"
                            )}>
                              {duration}s
                            </span>
                          )}
                          {itemCount !== null && (
                            <span className={cn(
                              "text-[10px] px-1 py-0.5 rounded",
                              exec.status === "success" ? "text-green-500 bg-green-100/50" :
                              exec.status === "error" ? "text-red-500 bg-red-100/50" :
                              "text-slate-400 bg-slate-100/50"
                            )}>
                              {itemCount} {itemCount === 1 ? "item" : "items"}
                            </span>
                          )}
                        </div>
                      </div>
                      {exec.error && (
                        <div className="text-[10px] text-red-600 mt-0.5 truncate" title={exec.error}>
                          {exec.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Paused at breakpoint indicator */}
      {sessionState?.pausedAtBreakpoint && (
        <div className="px-3 py-2 bg-yellow-50 border-t border-yellow-200">
          <div className="flex items-center gap-2 text-xs text-yellow-700">
            <Circle className="w-2 h-2 fill-red-500 text-red-500" />
            <span>Paused at breakpoint: <strong>{sessionState.currentNodeId}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
