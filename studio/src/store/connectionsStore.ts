/**
 * Connections Store
 * Manages LLM connections (n8n-style credentials) for AI Planner
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/tauri";
import { 
  LLMProvider, 
  LLMConnection, 
  ProviderConfig,
  TestConnectionResult,
  LLMConnectionHealthStatus
} from "../types/ai-planner";

// ============================================================
// Types
// ============================================================

export interface ConnectionFormData {
  name: string;
  provider: LLMProvider;
  config: ProviderConfig;
}

interface ConnectionsStoreState {
  // State
  connections: LLMConnection[];
  selectedConnectionId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadConnections: () => Promise<void>;
  addConnection: (data: ConnectionFormData) => Promise<LLMConnection>;
  updateConnection: (id: string, data: Partial<ConnectionFormData>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  selectConnection: (id: string | null) => void;
  setDefaultConnection: (id: string) => void;
  testConnection: (config: ProviderConfig) => Promise<TestConnectionResult>;
  testConnectionById: (id: string) => Promise<TestConnectionResult>;
  checkHealth: (id: string) => Promise<void>;
  getHealthStatus: (id: string) => LLMConnectionHealthStatus | undefined;
  getSelectedConnection: () => LLMConnection | null;
  getConnectionById: (id: string) => LLMConnection | null;
  getConnectionsByProvider: (provider: LLMProvider) => LLMConnection[];
  updateLastUsed: (id: string) => void;
}

// ============================================================
// Helper Functions
// ============================================================

function generateConnectionId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================
// Connections Store
// ============================================================

export const useConnectionsStore = create<ConnectionsStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      connections: [],
      selectedConnectionId: null,
      isLoading: false,
      error: null,

      // ============================================================
      // Load Connections
      // ============================================================

      loadConnections: async () => {
        set({ isLoading: true, error: null });

        try {
          // Load from Tauri secure storage
          const connections = await invoke<LLMConnection[]>("load_llm_connections");
          set({ connections, isLoading: false });
        } catch (error) {
          console.error("Failed to load connections:", error);
          set({ isLoading: false, error: String(error) });
        }
      },

      // ============================================================
      // Add Connection
      // ============================================================

      addConnection: async (data: ConnectionFormData) => {
        const { connections } = get();

        const newConnection: LLMConnection = {
          id: generateConnectionId(),
          name: data.name,
          provider: data.provider,
          config: data.config,
          isDefault: connections.length === 0, // First connection is default
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const updatedConnections = [...connections, newConnection];

        // Save to Tauri secure storage
        try {
          await invoke("save_llm_connection", {
            connection: newConnection,
          });
        } catch (error) {
          console.error("Failed to save connection:", error);
          throw error;
        }

        set({ connections: updatedConnections });

        // If this is the first connection, select it
        if (updatedConnections.length === 1) {
          set({ selectedConnectionId: newConnection.id });
        }

        return newConnection;
      },

      // ============================================================
      // Update Connection
      // ============================================================

      updateConnection: async (id: string, data: Partial<ConnectionFormData>) => {
        const { connections } = get();

        const updatedConnections = connections.map((conn) =>
          conn.id === id
            ? {
                ...conn,
                ...data,
                updatedAt: new Date().toISOString(),
              }
            : conn
        );

        // Save to Tauri secure storage
        try {
          const updatedConnection = updatedConnections.find((c) => c.id === id);
          if (updatedConnection) {
            await invoke("save_llm_connection", {
              connection: updatedConnection,
            });
          }
        } catch (error) {
          console.error("Failed to update connection:", error);
          throw error;
        }

        set({ connections: updatedConnections });
      },

      // ============================================================
      // Delete Connection
      // ============================================================

      deleteConnection: async (id: string) => {
        const { connections, selectedConnectionId } = get();

        // Get provider before deleting (needed for keyring cleanup)
        const connectionToDelete = connections.find((conn) => conn.id === id);
        const provider = connectionToDelete?.provider || "unknown";
        
        const updatedConnections = connections.filter((conn) => conn.id !== id);

        // Delete from Tauri secure storage (SQLite + keyring)
        try {
          await invoke("delete_llm_connection", { connectionId: id, provider });
        } catch (error) {
          console.error("Failed to delete connection:", error);
        }

        set({ connections: updatedConnections });

        // If the deleted connection was selected, select another one
        if (selectedConnectionId === id) {
          const newSelected = updatedConnections.find((c) => c.isDefault)?.id || updatedConnections[0]?.id || null;
          set({ selectedConnectionId: newSelected });
        }
      },

      // ============================================================
      // Select Connection
      // ============================================================

      selectConnection: (id: string | null) => {
        set({ selectedConnectionId: id });
        
        // Update last used
        if (id) {
          get().updateLastUsed(id);
        }
      },

      // ============================================================
      // Set Default Connection
      // ============================================================

      setDefaultConnection: (id: string) => {
        const { connections } = get();

        const updatedConnections = connections.map((conn) => ({
          ...conn,
          isDefault: conn.id === id,
        }));

        set({ connections: updatedConnections, selectedConnectionId: id });

        // Save all connections
        try {
          invoke("set_default_llm_connection", { connectionId: id });
        } catch (error) {
          console.error("Failed to set default connection:", error);
        }
      },

      // ============================================================
      // Test Connection
      // ============================================================

      testConnection: async (config: ProviderConfig): Promise<TestConnectionResult> => {
        try {
          const result = await invoke<TestConnectionResult>("test_llm_connection_v2", { config });
          return result;
        } catch (error) {
          return {
            success: false,
            message: String(error),
          };
        }
      },

      // ============================================================
      // Test Connection By ID
      // ============================================================

      testConnectionById: async (id: string): Promise<TestConnectionResult> => {
        const connection = get().getConnectionById(id);
        if (!connection) {
          return {
            success: false,
            message: "Connection not found",
          };
        }

        return get().testConnection(connection.config);
      },

      // ============================================================
      // Check Health
      // ============================================================

      checkHealth: async (id: string) => {
        const { connections } = get();
        const connection = connections.find((c) => c.id === id);
        
        if (!connection) return;

        const startTime = Date.now();
        const result = await get().testConnectionById(id);
        const latencyMs = Date.now() - startTime;

        const healthStatus: LLMConnectionHealthStatus = {
          status: result.success ? "healthy" : "down",
          lastCheckedAt: new Date().toISOString(),
          latencyMs: result.success ? latencyMs : undefined,
          errorMessage: result.success ? undefined : result.message,
        };

        const updatedConnections = connections.map((conn) =>
          conn.id === id ? { ...conn, healthStatus } : conn
        );

        set({ connections: updatedConnections });
      },

      // ============================================================
      // Get Health Status
      // ============================================================

      getHealthStatus: (id: string): LLMConnectionHealthStatus | undefined => {
        const connection = get().getConnectionById(id);
        return connection?.healthStatus;
      },

      // ============================================================
      // Get Selected Connection
      // ============================================================

      getSelectedConnection: () => {
        const { connections, selectedConnectionId } = get();
        
        if (selectedConnectionId) {
          return connections.find((c) => c.id === selectedConnectionId) || null;
        }

        // Fallback to default
        return connections.find((c) => c.isDefault) || connections[0] || null;
      },

      // ============================================================
      // Get Connection By ID
      // ============================================================

      getConnectionById: (id: string) => {
        const { connections } = get();
        return connections.find((c) => c.id === id) || null;
      },

      // ============================================================
      // Get Connections By Provider
      // ============================================================

      getConnectionsByProvider: (provider: LLMProvider) => {
        const { connections } = get();
        return connections.filter((c) => c.provider === provider);
      },

      // ============================================================
      // Update Last Used
      // ============================================================

      updateLastUsed: (id: string) => {
        const { connections } = get();
        const updatedConnections = connections.map((conn) =>
          conn.id === id
            ? { ...conn, lastUsedAt: new Date().toISOString() }
            : conn
        );
        set({ connections: updatedConnections });
      },
    }),
    {
      name: "llm-connections",
      partialize: (state) => ({
        connections: state.connections,
        selectedConnectionId: state.selectedConnectionId,
      }),
    }
  )
);
