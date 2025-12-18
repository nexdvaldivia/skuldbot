import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NavigationView } from "../types/project";

// ============================================================
// Navigation Store State
// ============================================================

interface NavigationStoreState {
  // Current view
  currentView: NavigationView;

  // Layout settings (persisted)
  sidebarCollapsed: boolean;
  projectExplorerWidth: number;
  rightPanelWidth: number;
  logsHeight: number;

  // Actions
  setView: (view: NavigationView) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setProjectExplorerWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setLogsHeight: (height: number) => void;
  resetLayout: () => void;
}

// ============================================================
// Default Values
// ============================================================

const DEFAULT_PROJECT_EXPLORER_WIDTH = 260;
const DEFAULT_RIGHT_PANEL_WIDTH = 320;
const DEFAULT_LOGS_HEIGHT = 200;

// ============================================================
// Navigation Store
// ============================================================

export const useNavigationStore = create<NavigationStoreState>()(
  persist(
    (set) => ({
      // Initial state
      currentView: "welcome",
      sidebarCollapsed: false,
      projectExplorerWidth: DEFAULT_PROJECT_EXPLORER_WIDTH,
      rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
      logsHeight: DEFAULT_LOGS_HEIGHT,

      // Actions
      setView: (view) => set({ currentView: view }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setProjectExplorerWidth: (width) =>
        set({ projectExplorerWidth: Math.max(180, Math.min(400, width)) }),

      setRightPanelWidth: (width) =>
        set({ rightPanelWidth: Math.max(250, Math.min(500, width)) }),

      setLogsHeight: (height) =>
        set({ logsHeight: Math.max(100, Math.min(400, height)) }),

      resetLayout: () =>
        set({
          sidebarCollapsed: false,
          projectExplorerWidth: DEFAULT_PROJECT_EXPLORER_WIDTH,
          rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
          logsHeight: DEFAULT_LOGS_HEIGHT,
        }),
    }),
    {
      name: "skuldbot-navigation",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        projectExplorerWidth: state.projectExplorerWidth,
        rightPanelWidth: state.rightPanelWidth,
        logsHeight: state.logsHeight,
      }),
    }
  )
);
