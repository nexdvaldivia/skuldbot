/**
 * Connections Store
 * Manages LLM connections (n8n-style credentials)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/tauri";
import { LLMProvider } from "../types/ai-planner";

// ============================================================
// Types
// ============================================================

export interface LLMConnection {
  id: string;
  name: string;
  provider: LLMProvider;
  apiKey: string; // Encrypted when stored
  baseUrl?: string;
  createdAt: string;
  updatedAt: string;
  lastUsed?: string;
  isDefault?: boolean;
}

export interface ConnectionFormData {
  name: string;
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
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
  testConnection: (data: ConnectionFormData) => Promise<{ success: boolean; message: string }>;
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

// Simple obfuscation for display purposes (real encryption happens in Tauri)
function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
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
          // Try to load from Tauri secure storage
          const stored = await invoke<string>("load_connections").catch(() => null);

          if (stored) {
            const connections = JSON.parse(stored) as LLMConnection[];
            set({ connections, isLoading: false });
          } else {
            set({ isLoading: false });
          }
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
          apiKey: data.apiKey,
          baseUrl: data.baseUrl,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDefault: connections.length === 0, // First connection is default
        };

        const updatedConnections = [...connections, newConnection];

        // Save to Tauri secure storage
        try {
          await invoke("save_connections", {
            connectionsJson: JSON.stringify(updatedConnections),
          });
        } catch (error) {
          console.error("Failed to save connection:", error);
          // Still update local state even if Tauri save fails
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
          await invoke("save_connections", {
            connectionsJson: JSON.stringify(updatedConnections),
          });
        } catch (error) {
          console.error("Failed to update connection:", error);
        }

        set({ connections: updatedConnections });
      },

      // ============================================================
      // Delete Connection
      // ============================================================

      deleteConnection: async (id: string) => {
        const { connections, selectedConnectionId } = get();

        const updatedConnections = connections.filter((conn) => conn.id !== id);

        // Save to Tauri secure storage
        try {
          await invoke("save_connections", {
            connectionsJson: JSON.stringify(updatedConnections),
          });
        } catch (error) {
          console.error("Failed to delete connection:", error);
        }

        // If deleted connection was selected, select another
        let newSelectedId = selectedConnectionId;
        if (selectedConnectionId === id) {
          const defaultConn = updatedConnections.find((c) => c.isDefault);
          newSelectedId = defaultConn?.id || updatedConnections[0]?.id || null;
        }

        set({
          connections: updatedConnections,
          selectedConnectionId: newSelectedId,
        });
      },

      // ============================================================
      // Select Connection
      // ============================================================

      selectConnection: (id: string | null) => {
        set({ selectedConnectionId: id });
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

        // Save to Tauri secure storage
        invoke("save_connections", {
          connectionsJson: JSON.stringify(updatedConnections),
        }).catch(console.error);

        set({ connections: updatedConnections });
      },

      // ============================================================
      // Test Connection
      // ============================================================

      testConnection: async (data: ConnectionFormData) => {
        try {
          const result = await invoke<{ success: boolean; message: string }>(
            "test_llm_connection",
            {
              provider: data.provider,
              apiKey: data.apiKey,
              baseUrl: data.baseUrl || null,
            }
          );

          return result;
        } catch (error) {
          return {
            success: false,
            message: String(error),
          };
        }
      },

      // ============================================================
      // Getters
      // ============================================================

      getSelectedConnection: () => {
        const { connections, selectedConnectionId } = get();

        if (selectedConnectionId) {
          return connections.find((c) => c.id === selectedConnectionId) || null;
        }

        // Return default connection if no selection
        return connections.find((c) => c.isDefault) || connections[0] || null;
      },

      getConnectionById: (id: string) => {
        const { connections } = get();
        return connections.find((c) => c.id === id) || null;
      },

      getConnectionsByProvider: (provider: LLMProvider) => {
        const { connections } = get();
        return connections.filter((c) => c.provider === provider);
      },

      updateLastUsed: (id: string) => {
        const { connections } = get();

        const updatedConnections = connections.map((conn) =>
          conn.id === id
            ? { ...conn, lastUsed: new Date().toISOString() }
            : conn
        );

        set({ connections: updatedConnections });

        // Async save
        invoke("save_connections", {
          connectionsJson: JSON.stringify(updatedConnections),
        }).catch(console.error);
      },
    }),
    {
      name: "skuldbot-connections",
      // Only persist non-sensitive data in localStorage
      // Actual connections with API keys are stored via Tauri
      partialize: (state) => ({
        selectedConnectionId: state.selectedConnectionId,
      }),
    }
  )
);

// ============================================================
// Helper Hooks
// ============================================================

/**
 * Hook to get all connections
 */
export const useConnections = () => {
  return useConnectionsStore((state) => state.connections);
};

/**
 * Hook to get selected connection
 */
export const useSelectedConnection = () => {
  const store = useConnectionsStore();
  return store.getSelectedConnection();
};

/**
 * Hook to check if there are any connections
 */
export const useHasConnections = () => {
  return useConnectionsStore((state) => state.connections.length > 0);
};

/**
 * Helper to mask API key for display
 */
export { maskApiKey };
