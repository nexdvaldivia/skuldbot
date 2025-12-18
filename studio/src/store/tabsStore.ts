import { create } from "zustand";
import { Tab } from "../types/project";

// ============================================================
// Tabs Store State
// ============================================================

interface TabsStoreState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  openTab: (tab: Omit<Tab, "isActive">) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  closeDirtyTabs: () => string[]; // Returns IDs of tabs that couldn't be closed due to dirty state
  setActiveTab: (tabId: string) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getTab: (tabId: string) => Tab | undefined;
  getTabByBotId: (botId: string) => Tab | undefined;
  hasTab: (tabId: string) => boolean;
}

// ============================================================
// Tabs Store
// ============================================================

export const useTabsStore = create<TabsStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tabData) => {
    const { tabs } = get();
    const existingTab = tabs.find((t) => t.id === tabData.id);

    if (existingTab) {
      // Just activate existing tab
      set({
        tabs: tabs.map((t) => ({
          ...t,
          isActive: t.id === tabData.id,
        })),
        activeTabId: tabData.id,
      });
      return;
    }

    // Add new tab and activate it
    const newTab: Tab = {
      ...tabData,
      isActive: true,
    };

    set({
      tabs: [
        ...tabs.map((t) => ({ ...t, isActive: false })),
        newTab,
      ],
      activeTabId: newTab.id,
    });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    const tab = tabs[tabIndex];

    if (!tab) return;

    // Remove the tab
    const newTabs = tabs.filter((t) => t.id !== tabId);

    // If closing active tab, activate adjacent tab
    let newActiveTabId = activeTabId;
    if (activeTabId === tabId) {
      if (newTabs.length === 0) {
        newActiveTabId = null;
      } else if (tabIndex >= newTabs.length) {
        newActiveTabId = newTabs[newTabs.length - 1].id;
      } else {
        newActiveTabId = newTabs[tabIndex].id;
      }
    }

    // Update isActive flags
    const updatedTabs = newTabs.map((t) => ({
      ...t,
      isActive: t.id === newActiveTabId,
    }));

    set({
      tabs: updatedTabs,
      activeTabId: newActiveTabId,
    });
  },

  closeOtherTabs: (tabId) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);

    if (!tab) return;

    set({
      tabs: [{ ...tab, isActive: true }],
      activeTabId: tabId,
    });
  },

  closeAllTabs: () => {
    set({
      tabs: [],
      activeTabId: null,
    });
  },

  closeDirtyTabs: () => {
    const { tabs } = get();
    const dirtyTabIds = tabs.filter((t) => t.isDirty).map((t) => t.id);

    if (dirtyTabIds.length > 0) {
      return dirtyTabIds;
    }

    // Close all if none are dirty
    set({
      tabs: [],
      activeTabId: null,
    });

    return [];
  },

  setActiveTab: (tabId) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);

    if (!tab) return;

    set({
      tabs: tabs.map((t) => ({
        ...t,
        isActive: t.id === tabId,
      })),
      activeTabId: tabId,
    });
  },

  setTabDirty: (tabId, isDirty) => {
    const { tabs } = get();

    set({
      tabs: tabs.map((t) =>
        t.id === tabId ? { ...t, isDirty } : t
      ),
    });
  },

  updateTabTitle: (tabId, title) => {
    const { tabs } = get();

    set({
      tabs: tabs.map((t) =>
        t.id === tabId ? { ...t, title } : t
      ),
    });
  },

  reorderTabs: (fromIndex, toIndex) => {
    const { tabs } = get();

    if (fromIndex < 0 || fromIndex >= tabs.length) return;
    if (toIndex < 0 || toIndex >= tabs.length) return;

    const newTabs = [...tabs];
    const [movedTab] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, movedTab);

    set({ tabs: newTabs });
  },

  getTab: (tabId) => {
    const { tabs } = get();
    return tabs.find((t) => t.id === tabId);
  },

  getTabByBotId: (botId) => {
    const { tabs } = get();
    return tabs.find((t) => t.type === "bot" && t.botId === botId);
  },

  hasTab: (tabId) => {
    const { tabs } = get();
    return tabs.some((t) => t.id === tabId);
  },
}));
