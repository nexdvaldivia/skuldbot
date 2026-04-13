'use client';

import { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRunWebSocket, type RunLogEvent, type RunStepEvent } from '@/hooks/use-websocket';
import {
  Terminal,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Wifi,
  WifiOff,
  Download,
  Trash2,
  Pause,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================
// Log Level Styling
// ============================================

const LOG_LEVEL_CONFIG: Record<
  RunLogEvent['level'],
  { icon: typeof Info; color: string; bgColor: string }
> = {
  info: {
    icon: Info,
    color: 'text-info-700',
    bgColor: 'bg-info-100',
  },
  warn: {
    icon: AlertTriangle,
    color: 'text-warning-700',
    bgColor: 'bg-warning-100',
  },
  error: {
    icon: AlertCircle,
    color: 'text-error-700',
    bgColor: 'bg-error-100',
  },
  debug: {
    icon: Bug,
    color: 'text-zinc-600',
    bgColor: 'bg-zinc-100',
  },
};

// ============================================
// Log Entry Component
// ============================================

interface LogEntryProps {
  log: RunLogEvent;
  showTimestamp?: boolean;
  showLevel?: boolean;
  showNodeId?: boolean;
}

function LogEntry({
  log,
  showTimestamp = true,
  showLevel = true,
  showNodeId = true,
}: LogEntryProps) {
  const config = LOG_LEVEL_CONFIG[log.level];
  const Icon = config.icon;

  const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-3 py-1.5 font-mono text-sm hover:bg-zinc-50 transition-colors',
        log.level === 'error' && 'bg-error-50',
      )}
    >
      {showTimestamp && <span className="text-zinc-500 shrink-0 select-all">{timestamp}</span>}
      {showLevel && (
        <span className={cn('shrink-0', config.color)}>
          <Icon className="h-4 w-4" />
        </span>
      )}
      {showNodeId && log.nodeId && (
        <span className="text-brand-700 shrink-0 max-w-[120px] truncate">[{log.nodeId}]</span>
      )}
      <span className="text-zinc-800 whitespace-pre-wrap break-all flex-1">{log.message}</span>
    </div>
  );
}

// ============================================
// Step Progress Component
// ============================================

interface StepProgressProps {
  steps: RunStepEvent[];
}

function StepProgress({ steps }: StepProgressProps) {
  if (steps.length === 0) return null;

  return (
    <div className="border-b border-zinc-200 p-3 bg-zinc-50">
      <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Step Progress</div>
      <div className="flex flex-wrap gap-2">
        {steps.map((step) => (
          <div
            key={step.nodeId}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium',
              step.status === 'running' && 'bg-info-100 text-info-700',
              step.status === 'success' && 'bg-brand-100 text-brand-700',
              step.status === 'failed' && 'bg-error-100 text-error-700',
              step.status === 'skipped' && 'bg-zinc-100 text-zinc-600',
            )}
          >
            <span className="opacity-60">#{step.stepIndex + 1}</span> {step.nodeType}
            {step.status === 'running' && <span className="ml-1 animate-pulse">...</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Main RunLogs Component
// ============================================

interface RunLogsProps {
  runId: string;
  initialLogs?: RunLogEvent[];
  className?: string;
  maxHeight?: string;
  autoScroll?: boolean;
  showStepProgress?: boolean;
  onComplete?: () => void;
}

export function RunLogs({
  runId,
  initialLogs = [],
  className,
  maxHeight = '500px',
  autoScroll: initialAutoScroll = true,
  showStepProgress = true,
  onComplete,
}: RunLogsProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(initialAutoScroll);
  const [filter, setFilter] = useState<RunLogEvent['level'] | 'all'>('all');

  const {
    isConnected,
    logs: wsLogs,
    steps,
    currentStatus,
    clearLogs,
  } = useRunWebSocket(runId, {
    onComplete: () => {
      onComplete?.();
    },
  });

  // Combine initial logs with websocket logs
  const allLogs = [...initialLogs, ...wsLogs];
  const filteredLogs = filter === 'all' ? allLogs : allLogs.filter((log) => log.level === filter);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs.length, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  // Export logs as text file
  const handleExport = () => {
    const content = allLogs
      .map((log) => {
        const timestamp = new Date(log.timestamp).toISOString();
        const node = log.nodeId ? ` [${log.nodeId}]` : '';
        return `${timestamp} [${log.level.toUpperCase()}]${node} ${log.message}`;
      })
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-${runId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Log level counts for filter badges
  const levelCounts = allLogs.reduce(
    (acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div
      className={cn(
        'flex flex-col bg-white rounded-xl border border-zinc-200 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-zinc-500" />
          <span className="font-medium text-zinc-900">Logs</span>
          {/* Connection status */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs',
              isConnected ? 'bg-brand-100 text-brand-700' : 'bg-error-100 text-error-700',
            )}
          >
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span>Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Disconnected</span>
              </>
            )}
          </div>
          {currentStatus && (
            <span className="text-xs text-zinc-500">
              Status: <span className="text-zinc-700">{currentStatus}</span>
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn('text-zinc-500 hover:text-zinc-900', autoScroll && 'text-brand-700')}
          >
            {autoScroll ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="text-zinc-500 hover:text-zinc-900"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearLogs}
            className="text-zinc-500 hover:text-zinc-900"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 bg-zinc-50/70">
        <span className="text-xs text-zinc-500 uppercase tracking-wide mr-2">Filter:</span>
        {(['all', 'info', 'warn', 'error', 'debug'] as const).map((level) => {
          const count = level === 'all' ? allLogs.length : levelCounts[level] || 0;
          const isActive = filter === level;
          return (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                isActive
                  ? level === 'all'
                    ? 'bg-zinc-200 text-zinc-900'
                    : cn(LOG_LEVEL_CONFIG[level].bgColor, LOG_LEVEL_CONFIG[level].color)
                  : 'bg-white text-zinc-500 hover:bg-zinc-100',
              )}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
              {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Step progress */}
      {showStepProgress && <StepProgress steps={steps} />}

      {/* Logs container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <Terminal className="h-8 w-8 mb-2 opacity-50" />
            <p>Waiting for logs...</p>
            {!isConnected && (
              <p className="text-xs mt-1 text-error-600">
                WebSocket disconnected - attempting to reconnect
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredLogs.map((log, index) => (
              <LogEntry key={`${log.timestamp}-${index}`} log={log} />
            ))}
          </div>
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Footer with stats */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
        <span>
          {filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}
          {filter !== 'all' && ` (filtered from ${allLogs.length})`}
        </span>
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-brand-700 hover:text-brand-800"
          >
            Jump to bottom
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Compact variant for dashboard
// ============================================

interface RunLogsCompactProps {
  runId: string;
  maxLines?: number;
  className?: string;
}

export function RunLogsCompact({ runId, maxLines = 10, className }: RunLogsCompactProps) {
  const { isConnected, logs } = useRunWebSocket(runId);
  const recentLogs = logs.slice(-maxLines);

  return (
    <div className={cn('bg-white rounded-xl border border-zinc-200 overflow-hidden', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-zinc-500" />
          <span className="text-sm text-zinc-800">Recent Logs</span>
        </div>
        <div
          className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-brand-500' : 'bg-error-500')}
        />
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {recentLogs.length === 0 ? (
          <div className="px-3 py-4 text-center text-zinc-500 text-sm">No logs yet</div>
        ) : (
          recentLogs.map((log, index) => (
            <LogEntry key={`${log.timestamp}-${index}`} log={log} showNodeId={false} />
          ))
        )}
      </div>
    </div>
  );
}
