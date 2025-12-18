import { Play, Pause, Square, StepForward, SkipForward, Circle, Trash2 } from "lucide-react";
import { useDebugStore, DebugState } from "../store/debugStore";
import { cn } from "../lib/utils";

interface DebugPanelProps {
  className?: string;
}

export default function DebugPanel({ className }: DebugPanelProps) {
  const {
    state,
    breakpoints,
    executionHistory,
    slowMotion,
    slowMotionDelay,
    startDebug,
    pauseDebug,
    resumeDebug,
    stopDebug,
    stepOver,
    clearBreakpoints,
    clearExecutionHistory,
    setSlowMotion,
    setSlowMotionDelay,
  } = useDebugStore();

  const isIdle = state === "idle";
  const isRunning = state === "running";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";

  const getStateLabel = (s: DebugState): string => {
    switch (s) {
      case "idle": return "Ready";
      case "running": return "Running...";
      case "paused": return "Paused";
      case "stopped": return "Stopped";
    }
  };

  const getStateColor = (s: DebugState): string => {
    switch (s) {
      case "idle": return "text-slate-500";
      case "running": return "text-green-500";
      case "paused": return "text-yellow-500";
      case "stopped": return "text-red-500";
    }
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

        {/* Stop */}
        <button
          onClick={stopDebug}
          disabled={isIdle}
          className={cn(
            "p-1.5 rounded transition-colors",
            isIdle
              ? "text-slate-300 cursor-not-allowed"
              : "hover:bg-red-100 text-red-600"
          )}
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

        <div className="flex-1" />

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
      </div>

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
            No breakpoints set. Click on the left edge of a node or press F9.
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

      {/* Execution History */}
      {executionHistory.length > 0 && (
        <div className="px-3 py-2 border-t">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600">
              Execution History ({executionHistory.length})
            </span>
            <button
              onClick={clearExecutionHistory}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              title="Clear history"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1 max-h-32 overflow-y-auto">
            {executionHistory.map((exec, idx) => (
              <div
                key={`${exec.nodeId}-${idx}`}
                className={cn(
                  "flex items-center gap-2 text-xs py-0.5 px-1.5 rounded",
                  exec.status === "success" && "bg-green-50 text-green-700",
                  exec.status === "error" && "bg-red-50 text-red-700",
                  exec.status === "running" && "bg-blue-50 text-blue-700",
                  exec.status === "pending" && "bg-slate-50 text-slate-600",
                  exec.status === "skipped" && "bg-slate-50 text-slate-400"
                )}
              >
                <span className="w-4 text-center font-mono text-[10px]">
                  {idx + 1}
                </span>
                <span className="truncate flex-1 font-mono">{exec.nodeId}</span>
                <span className="capitalize text-[10px]">{exec.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
