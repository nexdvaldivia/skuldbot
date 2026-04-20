'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

// ============================================
// Types
// ============================================

export interface RunLogEvent {
  runId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  nodeId?: string;
  stepIndex?: number;
}

export interface RunStatusEvent {
  runId: string;
  status: string;
  timestamp: string;
}

export interface RunStepEvent {
  runId: string;
  stepIndex: number;
  nodeId: string;
  nodeType: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

export interface RunCompleteEvent {
  runId: string;
  status: 'success' | 'failed' | 'cancelled';
  completedAt: string;
  durationMs: number;
  stepsCompleted: number;
  stepsFailed: number;
  error?: string;
}

export interface RunnerStatusEvent {
  runnerId: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  currentRunId?: string;
  timestamp: string;
}

// ============================================
// WebSocket Connection Manager
// ============================================

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

let socket: Socket | null = null;
let connectionCount = 0;

function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/ws`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[WebSocket] Connected to server');
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
    });
  }
  return socket;
}

function disconnectSocket() {
  if (socket && connectionCount === 0) {
    socket.disconnect();
    socket = null;
  }
}

// ============================================
// Hook: useRunWebSocket
// ============================================

interface UseRunWebSocketOptions {
  onLog?: (event: RunLogEvent) => void;
  onStatus?: (event: RunStatusEvent) => void;
  onStep?: (event: RunStepEvent) => void;
  onComplete?: (event: RunCompleteEvent) => void;
}

export function useRunWebSocket(
  runId: string | undefined,
  options: UseRunWebSocketOptions = {}
) {
  const queryClient = useQueryClient();
  const { onLog, onStatus, onStep, onComplete } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<RunLogEvent[]>([]);
  const [steps, setSteps] = useState<Map<string, RunStepEvent>>(new Map());
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!runId) return;

    const ws = getSocket();
    connectionCount++;

    // Connection status
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    ws.on('connect', handleConnect);
    ws.on('disconnect', handleDisconnect);
    setIsConnected(ws.connected);

    // Subscribe to run events
    ws.emit('subscribe:run', { runId });

    // Event handlers
    const handleLog = (event: RunLogEvent) => {
      if (event.runId !== runId) return;
      setLogs((prev) => [...prev, event]);
      optionsRef.current.onLog?.(event);
    };

    const handleStatus = (event: RunStatusEvent) => {
      if (event.runId !== runId) return;
      setCurrentStatus(event.status);
      optionsRef.current.onStatus?.(event);
      // Invalidate run query to refresh data
      queryClient.invalidateQueries({ queryKey: ['runs', runId] });
    };

    const handleStep = (event: RunStepEvent) => {
      if (event.runId !== runId) return;
      setSteps((prev) => {
        const next = new Map(prev);
        next.set(event.nodeId, event);
        return next;
      });
      optionsRef.current.onStep?.(event);
    };

    const handleComplete = (event: RunCompleteEvent) => {
      if (event.runId !== runId) return;
      setCurrentStatus(event.status);
      optionsRef.current.onComplete?.(event);
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['runs', runId] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    };

    ws.on('run:log', handleLog);
    ws.on('run:status', handleStatus);
    ws.on('run:step', handleStep);
    ws.on('run:complete', handleComplete);

    return () => {
      ws.emit('unsubscribe:run', { runId });
      ws.off('connect', handleConnect);
      ws.off('disconnect', handleDisconnect);
      ws.off('run:log', handleLog);
      ws.off('run:status', handleStatus);
      ws.off('run:step', handleStep);
      ws.off('run:complete', handleComplete);

      connectionCount--;
      disconnectSocket();
    };
  }, [runId, queryClient]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    isConnected,
    logs,
    steps: Array.from(steps.values()),
    currentStatus,
    clearLogs,
  };
}

// ============================================
// Hook: useRunnersWebSocket
// ============================================

interface UseRunnersWebSocketOptions {
  onRunnerStatus?: (event: RunnerStatusEvent) => void;
}

export function useRunnersWebSocket(options: UseRunnersWebSocketOptions = {}) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [runners, setRunners] = useState<Map<string, RunnerStatusEvent>>(
    new Map()
  );

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const ws = getSocket();
    connectionCount++;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    ws.on('connect', handleConnect);
    ws.on('disconnect', handleDisconnect);
    setIsConnected(ws.connected);

    // Subscribe to runner updates
    ws.emit('subscribe:runners');

    const handleRunnerStatus = (event: RunnerStatusEvent) => {
      setRunners((prev) => {
        const next = new Map(prev);
        next.set(event.runnerId, event);
        return next;
      });
      optionsRef.current.onRunnerStatus?.(event);
      // Invalidate runners query
      queryClient.invalidateQueries({ queryKey: ['runners'] });
    };

    ws.on('runner:status', handleRunnerStatus);

    return () => {
      ws.emit('unsubscribe:runners');
      ws.off('connect', handleConnect);
      ws.off('disconnect', handleDisconnect);
      ws.off('runner:status', handleRunnerStatus);

      connectionCount--;
      disconnectSocket();
    };
  }, [queryClient]);

  return {
    isConnected,
    runners: Array.from(runners.values()),
  };
}

// ============================================
// Hook: useWebSocketConnection
// ============================================

export function useWebSocketConnection() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = getSocket();
    connectionCount++;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    ws.on('connect', handleConnect);
    ws.on('disconnect', handleDisconnect);
    setIsConnected(ws.connected);

    return () => {
      ws.off('connect', handleConnect);
      ws.off('disconnect', handleDisconnect);
      connectionCount--;
      disconnectSocket();
    };
  }, []);

  return { isConnected };
}
