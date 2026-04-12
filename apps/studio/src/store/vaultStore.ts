import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { useToastStore } from './toastStore';

export interface VaultSecret {
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface VaultState {
  vaultExists: boolean;
  isUnlocked: boolean;
  isLoading: boolean;
  vaultPath: string;
  secrets: VaultSecret[];
  error: string | null;
  autoUnlockNoticeShown: boolean;
}

interface VaultActions {
  // Vault lifecycle - auto mode (Studio generates and manages password)
  initializeVault: () => Promise<boolean>;

  // Manual vault operations (for edge cases)
  createVault: (password: string, path?: string) => Promise<boolean>;
  unlockVault: (password: string, path?: string) => Promise<boolean>;
  lockVault: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;

  // Secret operations
  listSecrets: () => Promise<VaultSecret[]>;
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
  vaultExists: false,
  isUnlocked: false,
  isLoading: false,
  vaultPath: '.skuldbot',
  secrets: [],
  error: null,
  autoUnlockNoticeShown: false,

  setError: (error) => set({ error }),
  setVaultPath: (path) => set({ vaultPath: path }),

  checkVaultStatus: async () => {
    try {
      const toast = useToastStore.getState();
      const vaultPath = get().vaultPath;
      const exists = await invoke<boolean>('vault_exists', { path: vaultPath });
      set({ vaultExists: exists });

      if (exists) {
        // Check if already unlocked in session
        const unlocked = await invoke<boolean>('vault_is_unlocked', { path: vaultPath });
        if (unlocked) {
          set({ isUnlocked: true, autoUnlockNoticeShown: false });
          await get().listSecrets();
        } else {
          // Try auto-unlock with saved key
          const autoUnlocked = await invoke<boolean>('vault_auto_unlock', { path: vaultPath });
          if (autoUnlocked) {
            set({ isUnlocked: true, autoUnlockNoticeShown: false, error: null });
            await get().listSecrets();
          } else {
            // Auto-unlock failed - vault is orphaned (key lost)
            // Recreate the vault automatically
            console.log('Vault orphaned (key lost). Recreating vault...');
            try {
              await invoke('vault_delete', { path: vaultPath });
              await invoke('vault_create_auto', { path: vaultPath });
              set({
                vaultExists: true,
                isUnlocked: true,
                secrets: [],
                autoUnlockNoticeShown: false,
                error: null,
              });
              toast.success('Vault recreated', 'A new secure vault has been created.');
            } catch (recreateError) {
              console.error('Failed to recreate vault:', recreateError);
              set({
                isUnlocked: false,
                secrets: [],
                autoUnlockNoticeShown: true,
                error: 'Failed to recreate vault.',
              });
            }
          }
        }
      } else {
        set({ isUnlocked: false, secrets: [], autoUnlockNoticeShown: false, error: null });
      }
    } catch (error) {
      console.error('Error checking vault status:', error);
    }
  },

  // Initialize vault automatically - creates and auto-unlocks
  initializeVault: async () => {
    set({ isLoading: true, error: null });
    try {
      const toast = useToastStore.getState();
      const vaultPath = get().vaultPath;

      // Check if vault already exists
      const exists = await invoke<boolean>('vault_exists', { path: vaultPath });
      if (exists) {
        // Try auto-unlock
        const unlocked = await invoke<boolean>('vault_auto_unlock', { path: vaultPath });
        if (unlocked) {
          set({ vaultExists: true, isUnlocked: true, autoUnlockNoticeShown: false, error: null });
          await get().listSecrets();
          return true;
        }

        // Auto-unlock failed - vault exists but key is lost (orphaned vault)
        // Delete and recreate the vault automatically
        console.log('Vault orphaned (key lost). Recreating vault...');
        try {
          await invoke('vault_delete', { path: vaultPath });
          await invoke('vault_create_auto', { path: vaultPath });
          set({
            vaultExists: true,
            isUnlocked: true,
            secrets: [],
            autoUnlockNoticeShown: false,
            error: null,
          });
          toast.success('Vault recreated', 'A new secure vault has been created.');
          return true;
        } catch (recreateError) {
          console.error('Failed to recreate vault:', recreateError);
          set({
            vaultExists: true,
            isUnlocked: false,
            autoUnlockNoticeShown: true,
            error: 'Failed to recreate vault. Please delete .skuldbot folder and restart.',
          });
          return false;
        }
      }

      // Create vault automatically with generated password
      await invoke('vault_create_auto', { path: vaultPath });
      set({
        vaultExists: true,
        isUnlocked: true,
        secrets: [],
        autoUnlockNoticeShown: false,
        error: null,
      });
      return true;
    } catch (error) {
      set({ error: error as string });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  createVault: async (password, path) => {
    set({ isLoading: true, error: null });
    try {
      const vaultPath = path || get().vaultPath;
      await invoke('vault_create', { password, path: vaultPath });
      set({ vaultExists: true, isUnlocked: true, vaultPath, secrets: [] });
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
      await invoke('vault_unlock', { password, path: vaultPath });
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
      await invoke('vault_lock', { path: get().vaultPath });
      set({ isUnlocked: false, secrets: [] });
    } catch (error) {
      set({ error: error as string });
    }
  },

  changePassword: async (oldPassword, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('vault_change_password', {
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
      const secrets = await invoke<VaultSecret[]>('vault_list_secrets', {
        path: get().vaultPath,
      });
      set({ secrets });
      return secrets;
    } catch (error) {
      set({ error: error as string });
      return [];
    }
  },

  verifySecret: async (name) => {
    try {
      const exists = await invoke<boolean>('vault_verify_secret', {
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
      await invoke('vault_set_secret', {
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
      await invoke('vault_delete_secret', {
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
