import { create } from "zustand";

export type LogLevel = "debug" | "info" | "warning" | "error" | "success";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: string | object;
}

interface LogsStore {
  logs: LogEntry[];
  isOpen: boolean;
  addLog: (level: LogLevel, message: string, details?: string | object) => void;
  clearLogs: () => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  debug: (message: string, details?: string | object) => void;
  info: (message: string, details?: string | object) => void;
  warning: (message: string, details?: string | object) => void;
  error: (message: string, details?: string | object) => void;
  success: (message: string, details?: string | object) => void;
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  isOpen: false,

  addLog: (level, message, details) => {
    const log: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    };

    set((state) => ({
      logs: [...state.logs, log],
      // Auto-open panel on errors
      isOpen: level === "error" ? true : state.isOpen,
    }));

    // Limit logs to 500 entries
    set((state) => ({
      logs: state.logs.slice(-500),
    }));
  },

  clearLogs: () => set({ logs: [] }),

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),

  debug: (message, details) =>
    useLogsStore.getState().addLog("debug", message, details),

  info: (message, details) =>
    useLogsStore.getState().addLog("info", message, details),

  warning: (message, details) =>
    useLogsStore.getState().addLog("warning", message, details),

  error: (message, details) =>
    useLogsStore.getState().addLog("error", message, details),

  success: (message, details) =>
    useLogsStore.getState().addLog("success", message, details),
}));


