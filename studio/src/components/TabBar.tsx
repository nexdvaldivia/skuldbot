import { useTabsStore } from "../store/tabsStore";
import { useProjectStore } from "../store/projectStore";
import { Tab } from "../types/project";
import { X, Bot, Settings, FileJson, MoreHorizontal } from "lucide-react";
import { useState } from "react";

interface TabItemProps {
  tab: Tab;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TabItem({ tab, onActivate, onClose, onContextMenu }: TabItemProps) {
  const getIcon = () => {
    switch (tab.type) {
      case "bot":
        return <Bot className="w-3.5 h-3.5" />;
      case "settings":
        return <Settings className="w-3.5 h-3.5" />;
      case "env":
        return <FileJson className="w-3.5 h-3.5" />;
      default:
        return <FileJson className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b-2 min-w-0
        ${
          tab.isActive
            ? "bg-white border-primary-500 text-slate-800"
            : "bg-slate-100 border-transparent text-slate-600 hover:bg-slate-50"
        }
      `}
      onClick={onActivate}
      onContextMenu={onContextMenu}
    >
      <span className="text-slate-500">{getIcon()}</span>
      <span className="text-sm truncate max-w-[120px]">{tab.title}</span>
      {tab.isDirty && (
        <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`
          p-0.5 rounded hover:bg-slate-200 flex-shrink-0
          ${tab.isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
        `}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeOtherTabs, closeAllTabs } =
    useTabsStore();
  const { saveBot } = useProjectStore();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleSaveTab = async () => {
    if (!contextMenu) return;
    const tab = tabs.find((t) => t.id === contextMenu.tabId);
    if (tab?.type === "bot" && tab.botId) {
      await saveBot(tab.botId);
    }
    setContextMenu(null);
  };

  const handleCloseTab = () => {
    if (!contextMenu) return;
    closeTab(contextMenu.tabId);
    setContextMenu(null);
  };

  const handleCloseOthers = () => {
    if (!contextMenu) return;
    closeOtherTabs(contextMenu.tabId);
    setContextMenu(null);
  };

  const handleCloseAll = () => {
    closeAllTabs();
    setContextMenu(null);
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-100 border-b border-slate-200 flex items-center overflow-x-auto">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          onActivate={() => setActiveTab(tab.id)}
          onClose={() => closeTab(tab.id)}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
        />
      ))}

      {/* Spacer */}
      <div className="flex-1 border-b-2 border-transparent" />

      {/* More actions */}
      {tabs.length > 0 && (
        <div className="px-2 border-b-2 border-transparent">
          <button
            onClick={(e) => {
              e.preventDefault();
              if (activeTabId) {
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  tabId: activeTabId,
                });
              }
            }}
            className="p-1 hover:bg-slate-200 rounded text-slate-500"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleSaveTab}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-slate-100"
            >
              Save
            </button>
            <hr className="my-1 border-slate-200" />
            <button
              onClick={handleCloseTab}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-slate-100"
            >
              Close
            </button>
            <button
              onClick={handleCloseOthers}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-slate-100"
            >
              Close Others
            </button>
            <button
              onClick={handleCloseAll}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-slate-100"
            >
              Close All
            </button>
          </div>
        </>
      )}
    </div>
  );
}
