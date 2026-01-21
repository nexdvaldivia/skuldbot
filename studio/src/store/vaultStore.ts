import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";

export interface VaultSecret {
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface VaultState {
  isUnlocked: boolean;
  isLoading: boolean;
  vaultPath: string;
  secrets: VaultSecret[];
  error: string | null;
}

interface VaultActions {
  // Vault lifecycle
  createVault: (password: string, path?: string) => Promise<boolean>;
  unlockVault: (password: string, path?: string) => Promise<boolean>;
  lockVault: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;

  // Secret operations
  listSecrets: () => Promise<VaultSecret[]>;
  // SECURITY: getSecret was removed - values must NEVER be returned to frontend
  // Use verifySecret to check if a secret exists
  verifySecret: (name: string) => Promise<boolean>;
  setSecret: (name: string, value: string, description?: string) => Promise<boolean>;
  deleteSecret: (name: string) => Promise<boolean>;

  // State management
  setError: (error: string | null) => void;
  setVaultPath: (path: string) => void;
  checkVaultStatus: () => Promise<void>;
}

export const useVaultStore = create<VaultState & VaultActions>((set, get) => ({
  // Initial state
  isUnlocked: false,
  isLoading: false,
  vaultPath: ".skuldbot",
  secrets: [],
  error: null,

  setError: (error) => set({ error }),
  setVaultPath: (path) => set({ vaultPath: path }),

  checkVaultStatus: async () => {
    try {
      const exists = await invoke<boolean>("vault_exists", { path: get().vaultPath });
      if (exists) {
        const unlocked = await invoke<boolean>("vault_is_unlocked", { path: get().vaultPath });
        set({ isUnlocked: unlocked });
        if (unlocked) {
          await get().listSecrets();
        }
      }
    } catch (error) {
      console.error("Error checking vault status:", error);
    }
  },

  createVault: async (password, path) => {
    set({ isLoading: true, error: null });
    try {
      const vaultPath = path || get().vaultPath;
      await invoke("vault_create", { password, path: vaultPath });
      set({ isUnlocked: true, vaultPath, secrets: [] });
      return true;
    } catch (error) {
      set({ error: error as string });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  unlockVault: async (password, path) => {
    set({ isLoading: true, error: null });
    try {
      const vaultPath = path || get().vaultPath;
      await invoke("vault_unlock", { password, path: vaultPath });
      set({ isUnlocked: true, vaultPath });
      await get().listSecrets();
      return true;
    } catch (error) {
      set({ error: error as string });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  lockVault: async () => {
    try {
      await invoke("vault_lock", { path: get().vaultPath });
      set({ isUnlocked: false, secrets: [] });
    } catch (error) {
      set({ error: error as string });
    }
  },

  changePassword: async (oldPassword, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("vault_change_password", {
        oldPassword,
        newPassword,
        path: get().vaultPath,
      });
      return true;
    } catch (error) {
      set({ error: error as string });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  listSecrets: async () => {
    try {
      const secrets = await invoke<VaultSecret[]>("vault_list_secrets", {
        path: get().vaultPath,
      });
      set({ secrets });
      return secrets;
    } catch (error) {
      set({ error: error as string });
      return [];
    }
  },

  // SECURITY: getSecret was removed - values must NEVER be returned to frontend
  // Use verifySecret to check if a secret exists
  verifySecret: async (name) => {
    try {
      const exists = await invoke<boolean>("vault_verify_secret", {
        name,
        path: get().vaultPath,
      });
      return exists;
    } catch (error) {
      set({ error: error as string });
      return false;
    }
  },

  setSecret: async (name, value, description) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("vault_set_secret", {
        name,
        value,
        description,
        path: get().vaultPath,
      });
      await get().listSecrets();
      return true;
    } catch (error) {
      set({ error: error as string });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteSecret: async (name) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("vault_delete_secret", {
        name,
        path: get().vaultPath,
      });
      await get().listSecrets();
      return true;
    } catch (error) {
      set({ error: error as string });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
}));
