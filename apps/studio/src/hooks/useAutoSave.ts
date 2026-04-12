import { useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useTabsStore } from '../store/tabsStore';

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
          }),
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
