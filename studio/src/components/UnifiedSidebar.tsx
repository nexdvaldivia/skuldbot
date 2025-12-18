import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  Search,
  GripVertical,
  Sparkles,
  MousePointer,
  FolderTree,
  Bot,
  Plus,
  MoreHorizontal,
  Settings,
  Trash2,
  Edit3,
  Home,
  Variable,
  Play,
  FolderOpen,
  Copy,
} from "lucide-react";
import { open } from "@tauri-apps/api/shell";
import { nodeTemplates } from "../data/nodeTemplates";
import { NodeTemplate, NodeCategory } from "../types/flow";
import { Icon } from "./ui/Icon";
import { Input } from "./ui/Input";
import { categoryColors, categoryIcons, categoryNames, categoryOrder } from "../lib/design-tokens";
import { ScrollArea } from "./ui/scroll-area";
import { setDraggedNodeData, getDraggedNodeData, clearDraggedNodeData, setPendingNodeTemplate, getPendingNodeTemplate, clearPendingNodeTemplate } from "../store/flowStore";
import { useProjectStore } from "../store/projectStore";
import { useTabsStore } from "../store/tabsStore";
import { useNavigationStore } from "../store/navigationStore";

// ============================================================
// Sidebar Tab Types
// ============================================================

type SidebarTab = "explorer" | "nodes";

// ============================================================
// Unified Sidebar Component
// ============================================================

export default function UnifiedSidebar() {
  const { project } = useProjectStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>(project ? "explorer" : "nodes");

  // Switch to explorer when project opens
  useEffect(() => {
    if (project) {
      setActiveTab("explorer");
    }
  }, [project]);

  return (
    <div className="w-72 bg-card border-r flex flex-col flex-shrink-0">
      {/* Tab Headers - h-12 to align with ProjectToolbar */}
      <div className="flex border-b bg-muted/30 h-12">
        {project && (
          <button
            onClick={() => setActiveTab("explorer")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 text-sm font-medium transition-colors ${
              activeTab === "explorer"
                ? "text-primary border-b-2 border-primary bg-card"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Explorer</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab("nodes")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 text-sm font-medium transition-colors ${
            activeTab === "nodes"
              ? "text-primary border-b-2 border-primary bg-card"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Nodes</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "explorer" && project ? (
        <ExplorerContent />
      ) : (
        <NodesContent />
      )}
    </div>
  );
}

// ============================================================
// Explorer Content (Project Tree)
// ============================================================

function ExplorerContent() {
  const { project, projectPath, bots, activeBotId, openBot, createBot, deleteBot, renameBot } = useProjectStore();
  const { openTab, updateTabTitle } = useTabsStore();
  const { setView } = useNavigationStore();
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; botId: string } | null>(null);
  const [renamingBotId, setRenamingBotId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [copiedPath, setCopiedPath] = useState(false);

  const handleCreateBot = async () => {
    if (!newBotName.trim()) return;
    const botId = await createBot(newBotName);
    setNewBotName("");
    setShowCreateBot(false);
    // Open the new bot
    if (botId) {
      handleOpenBot(botId);
    }
  };

  const handleOpenBot = async (botId: string) => {
    const bot = bots.get(botId);
    if (!bot) return;

    // Load bot content from disk if not already loaded
    await openBot(botId);

    openTab({
      id: `bot-${botId}`,
      type: "bot",
      botId,
      title: bot.name,
      isDirty: bot.isDirty,
    });
  };

  const handleContextMenu = (e: React.MouseEvent, botId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Get button position to place menu to its left
    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 140;

    // Position menu to the left of the button
    let x = rect.left - menuWidth - 4;
    let y = rect.top;

    // If menu would go off left edge, position to the right of button
    if (x < 8) {
      x = rect.right + 4;
    }
    // If menu would go off bottom edge, position above
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 8;
    }

    setContextMenu({ x, y, botId });
  };

  const handleDeleteBot = async (botId: string) => {
    await deleteBot(botId);
    setContextMenu(null);
  };

  const handleStartRename = (botId: string) => {
    const bot = bots.get(botId);
    if (!bot) return;
    setRenamingBotId(botId);
    setRenameValue(bot.name);
    setContextMenu(null);
  };

  const handleConfirmRename = async () => {
    if (!renamingBotId || !renameValue.trim()) {
      setRenamingBotId(null);
      return;
    }
    await renameBot(renamingBotId, renameValue.trim());
    updateTabTitle(`bot-${renamingBotId}`, renameValue.trim());
    setRenamingBotId(null);
  };

  const handleCancelRename = () => {
    setRenamingBotId(null);
    setRenameValue("");
  };

  const handleRevealInFinder = async (botId: string) => {
    const bot = bots.get(botId);
    if (!bot?.path) return;
    try {
      await open(bot.path);
    } catch (err) {
      console.error("Failed to open in Finder:", err);
    }
    setContextMenu(null);
  };

  const handleCopyPath = (botId: string) => {
    const bot = bots.get(botId);
    if (!bot?.path) return;
    navigator.clipboard.writeText(bot.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
    setContextMenu(null);
  };

  const handleRevealProjectInFinder = async () => {
    if (!projectPath) return;
    try {
      await open(projectPath);
    } catch (err) {
      console.error("Failed to open project in Finder:", err);
    }
  };

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingBotId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingBotId]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  return (
    <>
      {/* Project Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {project?.project.name || "Project"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {bots.size} bot{bots.size !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRevealProjectInFinder}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Reveal in Finder"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowCreateBot(true)}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="New Bot"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("welcome")}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Home"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Create Bot Input */}
      {showCreateBot && (
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="Bot name..."
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateBot();
                if (e.key === "Escape") {
                  setShowCreateBot(false);
                  setNewBotName("");
                }
              }}
            />
            <button
              onClick={handleCreateBot}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Bot List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Bots Section */}
          <div className="mb-4">
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Bot className="w-3 h-3" />
              <span>Bots</span>
            </div>
            <div className="space-y-0.5">
              {Array.from(bots.values()).map((bot) => (
                <div
                  key={bot.id}
                  onClick={() => renamingBotId !== bot.id && handleOpenBot(bot.id)}
                  onContextMenu={(e) => handleContextMenu(e, bot.id)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors group cursor-pointer ${
                    activeBotId === bot.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent text-foreground"
                  }`}
                >
                  <Bot className="w-4 h-4 flex-shrink-0" />
                  {renamingBotId === bot.id ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleConfirmRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleConfirmRename();
                        } else if (e.key === "Escape") {
                          handleCancelRename();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-sm bg-background border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <span className="flex-1 text-sm truncate">{bot.name}</span>
                  )}
                  {bot.isDirty && renamingBotId !== bot.id && (
                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  )}
                  {renamingBotId !== bot.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, bot.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
                    >
                      <MoreHorizontal className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {bots.size === 0 && (
                <div className="text-center py-6">
                  <Bot className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No bots yet</p>
                  <button
                    onClick={() => setShowCreateBot(true)}
                    className="text-sm text-primary hover:underline mt-1"
                  >
                    Create your first bot
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Settings className="w-3 h-3" />
              <span>Settings</span>
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => openTab({ id: "settings", type: "settings", title: "Settings", isDirty: false })}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-accent text-foreground transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm">Project Settings</span>
              </button>
              <button
                onClick={() => openTab({ id: "env", type: "env", title: "Environment", isDirty: false })}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-accent text-foreground transition-colors"
              >
                <Variable className="w-4 h-4" />
                <span className="text-sm">Environment Variables</span>
              </button>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Context Menu */}
      {contextMenu && createPortal(
        <div
          className="fixed z-[9999] bg-card rounded-lg shadow-xl border py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => {
              handleOpenBot(contextMenu.botId);
              setContextMenu(null);
            }}
          >
            <Play className="w-4 h-4" />
            <span>Open</span>
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => handleStartRename(contextMenu.botId)}
          >
            <Edit3 className="w-4 h-4" />
            <span>Rename</span>
          </button>
          <div className="border-t my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => handleRevealInFinder(contextMenu.botId)}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Reveal in Finder</span>
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => handleCopyPath(contextMenu.botId)}
          >
            <Copy className="w-4 h-4" />
            <span>{copiedPath ? "Copied!" : "Copy Path"}</span>
          </button>
          <div className="border-t my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => handleDeleteBot(contextMenu.botId)}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ============================================================
// Nodes Content (Node Library)
// ============================================================

function NodesContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(
    new Set() // Start with all categories collapsed
  );

  const toggleCategory = (categoryId: NodeCategory) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(categoryId)) {
      newSet.delete(categoryId);
    } else {
      newSet.add(categoryId);
    }
    setExpandedCategories(newSet);
  };

  const onDragStart = (event: React.DragEvent, nodeTemplate: NodeTemplate) => {
    const data = JSON.stringify(nodeTemplate);

    // Set data in multiple formats for compatibility
    try {
      event.dataTransfer.setData("application/reactflow", data);
      event.dataTransfer.setData("text/plain", data);
      event.dataTransfer.setData("text", data);
    } catch {
      // Ignore - will use global fallback
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.dropEffect = "move";

    // Always set global variable as fallback for WebKit
    setDraggedNodeData(nodeTemplate);
  };

  const onDragEnd = () => {
    // Don't clear here - let BotEditor handle it after creating the node
    // The data will be cleared by BotEditor or after a timeout as fallback
    setTimeout(() => {
      // Fallback cleanup in case drop didn't happen (e.g., cancelled drag)
      if (getDraggedNodeData()) {
        clearDraggedNodeData();
      }
    }, 500);
  };

  const filteredTemplates = searchQuery
    ? nodeTemplates.filter(
        (n) =>
          n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : nodeTemplates;

  const categoryCounts = categoryOrder.reduce((acc, cat) => {
    acc[cat] = nodeTemplates.filter((n) => n.category === cat).length;
    return acc;
  }, {} as Record<NodeCategory, number>);

  const totalNodes = nodeTemplates.length;

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted">
            <Sparkles className="w-4 h-4" style={{ color: '#00A36C' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Node Library
            </h2>
            <p className="text-xs text-muted-foreground">
              {totalNodes} nodes available
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Categories */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {searchQuery ? (
            <div className="px-3">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No nodes found</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-3 px-1">
                    Found {filteredTemplates.length} node{filteredTemplates.length !== 1 ? 's' : ''}
                  </p>
                  {filteredTemplates.map((node) => (
                    <NodeItem
                      key={node.type}
                      node={node}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      showCategory
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            categoryOrder.map((categoryId) => {
              const nodes = nodeTemplates.filter((n) => n.category === categoryId);
              if (nodes.length === 0) return null;
              const isExpanded = expandedCategories.has(categoryId);
              const colors = categoryColors[categoryId];
              const iconName = categoryIcons[categoryId];
              const categoryName = categoryNames[categoryId];

              return (
                <div key={categoryId} className="mb-0.5">
                  <button
                    onClick={() => toggleCategory(categoryId)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors duration-100 group"
                  >
                    <ChevronRight
                      size={14}
                      className={`text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                    />
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${colors.bg} ${colors.text}`}>
                      <Icon name={iconName} size={13} />
                    </div>
                    <span className="text-sm font-medium text-foreground flex-1 truncate">
                      {categoryName}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md tabular-nums">
                      {categoryCounts[categoryId]}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-2 pb-2 pt-1">
                      <div className="space-y-0.5 ml-4 border-l border-border pl-2">
                        {nodes.map((node) => (
                          <NodeItem
                            key={node.type}
                            node={node}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t bg-muted/30">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <MousePointer size={12} />
          <span>Drag and drop nodes to the canvas</span>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Node Item Component
// ============================================================

function NodeItem({
  node,
  onDragStart,
  onDragEnd,
  showCategory = false,
}: {
  node: NodeTemplate;
  onDragStart: (e: React.DragEvent, node: NodeTemplate) => void;
  onDragEnd: () => void;
  showCategory?: boolean;
}) {
  const colors = categoryColors[node.category] || categoryColors.control;
  const isAI = node.category === "ai";
  const isPython = node.category === "python";
  const isSpecial = isAI || isPython;

  const [isPending, setIsPending] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const handlePendingChange = (e: CustomEvent) => {
      setIsPending(e.detail?.type === node.type);
    };
    window.addEventListener('pendingNodeChange', handlePendingChange as EventListener);
    return () => window.removeEventListener('pendingNodeChange', handlePendingChange as EventListener);
  }, [node.type]);

  const handleClick = () => {
    const current = getPendingNodeTemplate();
    if (current?.type === node.type) {
      clearPendingNodeTemplate();
    } else {
      setPendingNodeTemplate(node);
    }
  };

  const itemRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (showTooltip && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top,
        left: rect.right + 8,
      });
    }
  }, [showTooltip]);

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        draggable="true"
        onDragStart={(e) => {
          onDragStart(e, node);
        }}
        onDragEnd={onDragEnd}
        onClick={handleClick}
        className={`
          group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer
          border transition-all duration-100 select-none
          ${isPending
            ? "bg-primary/10 border-primary ring-2 ring-primary/20"
            : "border-transparent hover:bg-emerald-50 hover:border-emerald-200"}
          active:scale-[0.98]
          ${isSpecial ? "hover:shadow-sm" : ""}
        `}
        style={{ WebkitUserDrag: 'element' } as React.CSSProperties}
      >
        <div className={`
          relative flex-shrink-0 w-7 h-7 rounded-md
          ${colors.bg} ${colors.text}
          flex items-center justify-center
          ${isSpecial ? "ring-1 ring-inset ring-black/5" : ""}
        `}>
          <Icon name={node.icon} size={13} />
          {isSpecial && (
            <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${colors.accent} ring-2 ring-card`} />
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-sm font-medium text-foreground leading-tight truncate max-w-[160px]">
            {node.label}
          </div>
          {showCategory ? (
            <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">
              {categoryNames[node.category]}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">
              {node.description}
            </div>
          )}
        </div>

        <GripVertical
          size={12}
          className="flex-shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {showTooltip && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            minWidth: '220px',
            maxWidth: '280px'
          }}
        >
          <div className="bg-slate-900 text-white rounded-lg shadow-2xl p-3 text-left animate-in fade-in slide-in-from-left-2 duration-150">
            <div className="absolute left-0 top-3 -translate-x-full">
              <div className="border-8 border-transparent border-r-slate-900" />
            </div>

            <div className="flex items-start gap-2.5">
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center`}>
                <Icon name={node.icon} size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-white leading-tight">
                  {node.label}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {node.type}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              {node.description}
            </p>

            <div className="mt-2 pt-2 border-t border-slate-700">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} font-medium`}>
                {categoryNames[node.category]}
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
