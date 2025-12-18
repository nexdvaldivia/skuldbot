import { useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { useTabsStore } from "../store/tabsStore";
import { useNavigationStore } from "../store/navigationStore";
import {
  ChevronDown,
  ChevronRight,
  Bot,
  FolderOpen,
  Plus,
  MoreHorizontal,
  Trash2,
  Edit3,
  Copy,
  Play,
  Settings,
  FileJson,
  Home,
} from "lucide-react";

interface TreeItemProps {
  label: string;
  icon?: React.ReactNode;
  isExpanded?: boolean;
  isSelected?: boolean;
  isDirty?: boolean;
  depth?: number;
  onClick?: () => void;
  onToggle?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

function TreeItem({
  label,
  icon,
  isExpanded,
  isSelected,
  isDirty,
  depth = 0,
  onClick,
  onToggle,
  onContextMenu,
  children,
  actions,
}: TreeItemProps) {
  const [showActions, setShowActions] = useState(false);
  const hasChildren = !!children;

  return (
    <div>
      <div
        className={`
          flex items-center gap-1 px-2 py-1.5 cursor-pointer group
          ${isSelected ? "bg-primary-100 text-primary-700" : "hover:bg-slate-100"}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-4" />}

        {icon && <span className="text-slate-500">{icon}</span>}

        <span className="flex-1 text-sm truncate">
          {label}
          {isDirty && <span className="text-primary-500 ml-1">●</span>}
        </span>

        {actions && showActions && (
          <div className="flex items-center gap-1">{actions}</div>
        )}
      </div>

      {hasChildren && isExpanded && <div>{children}</div>}
    </div>
  );
}

interface CreateBotDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function CreateBotDialog({ isOpen, onClose }: CreateBotDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { createBot, openBot } = useProjectStore();
  const { openTab } = useTabsStore();

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      const botId = await createBot(name, description || undefined);
      if (botId) {
        await openBot(botId);
        openTab({
          id: `bot-${botId}`,
          type: "bot",
          botId,
          title: name,
          isDirty: false,
        });
      }
      setName("");
      setDescription("");
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Create New Bot
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Bot Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Automation Bot"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this bot do?"
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create Bot"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectExplorer() {
  const { project, bots, activeBotId, openBot, deleteBot } = useProjectStore();
  const { openTab } = useTabsStore();
  const { projectExplorerWidth, setView } = useNavigationStore();
  const [expandedSections, setExpandedSections] = useState({
    bots: true,
    shared: false,
    settings: false,
  });
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    botId: string;
  } | null>(null);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleBotClick = async (botId: string) => {
    const bot = bots.get(botId);
    if (!bot) return;

    await openBot(botId);
    openTab({
      id: `bot-${botId}`,
      type: "bot",
      botId,
      title: bot.name,
      isDirty: bot.isDirty,
    });
  };

  const handleBotContextMenu = (e: React.MouseEvent, botId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, botId });
  };

  const handleDeleteBot = async (botId: string) => {
    if (confirm("Are you sure you want to delete this bot?")) {
      await deleteBot(botId);
    }
    setContextMenu(null);
  };

  const botsArray = Array.from(bots.values());

  return (
    <div
      className="h-full bg-white border-r border-slate-200 flex flex-col"
      style={{ width: projectExplorerWidth }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("welcome")}
            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700"
            title="Back to Welcome"
          >
            <Home className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 truncate">
            {project?.project.name || "Project"}
          </span>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto py-2">
        {/* Bots Section */}
        <TreeItem
          label={`Bots (${botsArray.length})`}
          icon={<Bot className="w-4 h-4" />}
          isExpanded={expandedSections.bots}
          onToggle={() => toggleSection("bots")}
          onClick={() => toggleSection("bots")}
          actions={
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCreateBot(true);
              }}
              className="p-1 hover:bg-primary-100 rounded text-slate-400 hover:text-primary-600"
              title="New Bot"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          }
        >
          {botsArray.length === 0 ? (
            <div className="px-8 py-2 text-xs text-slate-400 italic">
              No bots yet
            </div>
          ) : (
            botsArray.map((bot) => (
              <TreeItem
                key={bot.id}
                label={bot.name}
                icon={<FileJson className="w-4 h-4" />}
                depth={1}
                isSelected={activeBotId === bot.id}
                isDirty={bot.isDirty}
                onClick={() => handleBotClick(bot.id)}
                onContextMenu={(e) => handleBotContextMenu(e, bot.id)}
                actions={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBotContextMenu(e, bot.id);
                    }}
                    className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                }
              />
            ))
          )}
        </TreeItem>

        {/* Shared Section */}
        <TreeItem
          label="Shared"
          icon={<FolderOpen className="w-4 h-4" />}
          isExpanded={expandedSections.shared}
          onToggle={() => toggleSection("shared")}
          onClick={() => toggleSection("shared")}
        >
          <TreeItem
            label="Assets"
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            depth={1}
            onClick={() => {}}
          />
          <TreeItem
            label="Scripts"
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            depth={1}
            onClick={() => {}}
          />
          <TreeItem
            label="Templates"
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            depth={1}
            onClick={() => {}}
          />
        </TreeItem>

        {/* Settings Section */}
        <TreeItem
          label="Settings"
          icon={<Settings className="w-4 h-4" />}
          isExpanded={expandedSections.settings}
          onToggle={() => toggleSection("settings")}
          onClick={() => toggleSection("settings")}
        >
          <TreeItem
            label="Project Settings"
            icon={<Settings className="w-3.5 h-3.5" />}
            depth={1}
            onClick={() => {
              openTab({
                id: "settings",
                type: "settings",
                title: "Project Settings",
                isDirty: false,
              });
            }}
          />
          <TreeItem
            label="Environment"
            icon={<FileJson className="w-3.5 h-3.5" />}
            depth={1}
            onClick={() => {
              openTab({
                id: "env",
                type: "env",
                title: "Environment Variables",
                isDirty: false,
              });
            }}
          />
        </TreeItem>
      </div>

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
              onClick={() => {
                handleBotClick(contextMenu.botId);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-slate-100 flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Open
            </button>
            <button
              onClick={() => setContextMenu(null)}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-slate-100 flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={() => setContextMenu(null)}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-slate-100 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <hr className="my-1 border-slate-200" />
            <button
              onClick={() => handleDeleteBot(contextMenu.botId)}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </>
      )}

      {/* Create Bot Dialog */}
      <CreateBotDialog
        isOpen={showCreateBot}
        onClose={() => setShowCreateBot(false)}
      />
    </div>
  );
}
