import { ChevronDown, ChevronUp, Trash2, Copy, Download, Terminal, Filter } from "lucide-react";
import { useLogsStore, type LogEntry } from "../store/logsStore";
import { useToastStore } from "../store/toastStore";
import { useState, useRef, useEffect } from "react";

type LogLevel = "debug" | "info" | "warning" | "error" | "success";

const logLevelConfig: Record<LogLevel, { color: string; bg: string; icon: string }> = {
  debug: { color: "text-neutral-400", bg: "bg-neutral-500/20", icon: "DBG" },
  info: { color: "text-sky-400", bg: "bg-sky-500/20", icon: "INF" },
  warning: { color: "text-amber-400", bg: "bg-amber-500/20", icon: "WRN" },
  error: { color: "text-rose-400", bg: "bg-rose-500/20", icon: "ERR" },
  success: { color: "text-emerald-400", bg: "bg-emerald-500/20", icon: "OK" },
};

export default function LogsPanel() {
  const { logs, isOpen, togglePanel, clearLogs } = useLogsStore();
  const { success } = useToastStore();
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final cuando hay nuevos logs
  useEffect(() => {
    if (logsEndRef.current && isOpen) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, isOpen]);

  const handleCopyLogs = () => {
    const text = logs
      .map((log) => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    success("Logs copied");
  };

  const handleDownloadLogs = () => {
    const text = logs
      .map((log) => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skuldbot-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    success("Logs downloaded");
  };

  const filteredLogs = filter === "all"
    ? logs
    : logs.filter(log => log.level === filter);

  const infoCount = logs.filter(l => l.level === "info").length;
  const warningCount = logs.filter(l => l.level === "warning").length;
  const errorCount = logs.filter(l => l.level === "error").length;

  if (!isOpen) {
    return (
      <div className="h-12 bg-background border-t border-border flex-shrink-0 p-1">
        <div className="h-full bg-neutral-900 rounded-lg flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-neutral-500" />
              <span className="text-xs font-medium text-neutral-400">Console</span>
            </div>

            {logs.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded font-mono">
                  {logs.length}
                </span>
                {errorCount > 0 && (
                  <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-medium">
                    {errorCount} errors
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                    {warningCount} warnings
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={togglePanel}
            className="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
          >
            <ChevronUp size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 bg-background border-t border-border flex-shrink-0 p-1">
      <div className="h-full bg-neutral-900 rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-neutral-500" />
              <span className="text-xs font-medium text-neutral-400">Console</span>
            </div>

            {logs.length > 0 && (
              <span className="text-[10px] bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded font-mono">
                {filteredLogs.length}{filter !== "all" && ` / ${logs.length}`}
              </span>
            )}

            {/* Filtros por categoría */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setFilter("all")}
                className={`
                  px-2 py-0.5 text-[10px] font-medium rounded transition-colors
                  ${filter === "all"
                    ? "bg-neutral-700 text-neutral-200"
                    : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
                  }
                `}
              >
                All
              </button>
              <button
                onClick={() => setFilter("info")}
                className={`
                  px-2 py-0.5 text-[10px] font-medium rounded transition-colors flex items-center gap-1
                  ${filter === "info"
                    ? "bg-sky-500/30 text-sky-300"
                    : infoCount > 0
                      ? "text-sky-400/70 hover:text-sky-300 hover:bg-sky-500/20"
                      : "text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800"
                  }
                `}
              >
                Info
                {infoCount > 0 && <span className="font-mono">{infoCount}</span>}
              </button>
              <button
                onClick={() => setFilter("warning")}
                className={`
                  px-2 py-0.5 text-[10px] font-medium rounded transition-colors flex items-center gap-1
                  ${filter === "warning"
                    ? "bg-amber-500/30 text-amber-300"
                    : warningCount > 0
                      ? "text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/20"
                      : "text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800"
                  }
                `}
              >
                Warnings
                {warningCount > 0 && <span className="font-mono">{warningCount}</span>}
              </button>
              <button
                onClick={() => setFilter("error")}
                className={`
                  px-2 py-0.5 text-[10px] font-medium rounded transition-colors flex items-center gap-1
                  ${filter === "error"
                    ? "bg-rose-500/30 text-rose-300"
                    : errorCount > 0
                      ? "text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/20"
                      : "text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800"
                  }
                `}
              >
                Errors
                {errorCount > 0 && <span className="font-mono">{errorCount}</span>}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={handleCopyLogs}
              className="p-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Copy logs"
              disabled={logs.length === 0}
            >
              <Copy size={14} strokeWidth={2} />
            </button>
            <button
              onClick={handleDownloadLogs}
              className="p-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Download logs"
              disabled={logs.length === 0}
            >
              <Download size={14} strokeWidth={2} />
            </button>
            <button
              onClick={clearLogs}
              className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Clear logs"
              disabled={logs.length === 0}
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
            <div className="w-px h-4 bg-neutral-800 mx-1" />
            <button
              onClick={togglePanel}
              className="p-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
              title="Minimize"
            >
              <ChevronDown size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Logs Content */}
        <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-600">
              <Terminal size={32} className="mb-2 opacity-50" />
              <p className="text-xs">No logs yet</p>
              <p className="text-[10px] text-neutral-700 mt-1">Run or compile a bot to see output here</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-600">
              <Filter size={24} className="mb-2 opacity-50" />
              <p className="text-xs">No {filter} logs</p>
            </div>
          ) : (
            <>
              {filteredLogs.map((log) => (
                <LogEntryComponent key={log.id} log={log} />
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LogEntryComponent({ log }: { log: LogEntry }) {
  const time = new Date(log.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const config = logLevelConfig[log.level as LogLevel] || logLevelConfig.info;

  return (
    <div className="group px-2 py-1 hover:bg-neutral-800/50 rounded transition-colors">
      <div className="flex items-start gap-2">
        {/* Timestamp */}
        <span className="text-neutral-600 flex-shrink-0 select-none">{time}</span>

        {/* Level badge */}
        <span className={`
          flex-shrink-0 px-1 py-0 rounded text-[9px] font-bold tracking-wide
          ${config.bg} ${config.color}
        `}>
          {config.icon}
        </span>

        {/* Message */}
        <span className="text-neutral-300 break-all">{log.message}</span>
      </div>

      {log.details && (
        <pre className={`
          mt-1.5 ml-[72px] text-[10px] whitespace-pre-wrap
          pl-3 border-l-2 border-neutral-800
          ${config.color} opacity-70
        `}>
          {typeof log.details === "string"
            ? log.details
            : JSON.stringify(log.details, null, 2)}
        </pre>
      )}
    </div>
  );
}
