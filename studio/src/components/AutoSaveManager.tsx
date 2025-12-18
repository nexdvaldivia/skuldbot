import { useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "../store/projectStore";
import { useTabsStore } from "../store/tabsStore";

interface AutoSaveManagerProps {
  enabled?: boolean;
  intervalMs?: number;
}

export function AutoSaveManager({
  enabled = true,
  intervalMs = 5000,
}: AutoSaveManagerProps) {
  const { bots, project, saveBot } = useProjectStore();
  const { setTabDirty } = useTabsStore();
  const lastSaveTimeRef = useRef<number>(Date.now());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get dirty bots
  const getDirtyBots = useCallback(() => {
    const dirtyBots: string[] = [];
    for (const [botId, bot] of bots) {
      if (bot.isDirty) {
        dirtyBots.push(botId);
      }
    }
    return dirtyBots;
  }, [bots]);

  // Save all dirty bots (silently - no toast notifications)
  const saveAllDirtyBots = useCallback(async () => {
    const dirtyBots = getDirtyBots();

    for (const botId of dirtyBots) {
      try {
        await saveBot(botId, true); // silent = true for auto-save
        setTabDirty(`bot-${botId}`, false);
      } catch (error) {
        console.error(`Failed to auto-save bot ${botId}:`, error);
      }
    }

    lastSaveTimeRef.current = Date.now();
  }, [getDirtyBots, saveBot, setTabDirty]);

  // Debounced save
  const debouncedSave = useCallback(() => {
    if (!enabled || !project) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
      if (timeSinceLastSave >= intervalMs) {
        saveAllDirtyBots();
      }
    }, 1000); // Small debounce delay
  }, [enabled, project, intervalMs, saveAllDirtyBots]);

  // Watch for changes
  useEffect(() => {
    const dirtyBots = getDirtyBots();
    if (dirtyBots.length > 0) {
      debouncedSave();
    }
  }, [bots, getDirtyBots, debouncedSave]);

  // Periodic save check
  useEffect(() => {
    if (!enabled || !project) return;

    const interval = setInterval(() => {
      const dirtyBots = getDirtyBots();
      if (dirtyBots.length > 0) {
        saveAllDirtyBots();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, project, intervalMs, getDirtyBots, saveAllDirtyBots]);

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirtyBots = getDirtyBots();
      if (dirtyBots.length > 0) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [getDirtyBots]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // This component doesn't render anything
  return null;
}

// Hook for manual save operations
export function useAutoSave() {
  const { bots, saveBot } = useProjectStore();
  const { setTabDirty } = useTabsStore();

  const saveAll = useCallback(async () => {
    const promises: Promise<void>[] = [];

    for (const [botId, bot] of bots) {
      if (bot.isDirty) {
        promises.push(
          saveBot(botId).then(() => {
            setTabDirty(`bot-${botId}`, false);
          })
        );
      }
    }

    await Promise.all(promises);
  }, [bots, saveBot, setTabDirty]);

  const hasUnsavedChanges = useCallback(() => {
    for (const bot of bots.values()) {
      if (bot.isDirty) return true;
    }
    return false;
  }, [bots]);

  return {
    saveAll,
    hasUnsavedChanges,
  };
}
