import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Search, GripVertical, Sparkles, MousePointer } from "lucide-react";
import { nodeTemplates } from "../data/nodeTemplates";
import { NodeTemplate, NodeCategory } from "../types/flow";
import { Icon } from "./ui/Icon";
import { Input } from "./ui/Input";
import { categoryColors, categoryIcons, categoryNames, categoryOrder } from "../lib/design-tokens";
import { ScrollArea } from "./ui/scroll-area";
import { setDraggedNodeData, clearDraggedNodeData, setPendingNodeTemplate, getPendingNodeTemplate, clearPendingNodeTemplate } from "../store/flowStore";

export default function Sidebar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(
    new Set(["trigger", "web", "ai"]) // Start with most common expanded
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
    // Set multiple data types for better compatibility with Tauri/WebKit
    event.dataTransfer.setData("application/reactflow", data);
    event.dataTransfer.setData("text/plain", data);
    event.dataTransfer.effectAllowed = "move";
    // Also store in global variable as workaround for WebKit/Tauri bug
    setDraggedNodeData(nodeTemplate);
  };

  const onDragEnd = () => {
    // Delay clearing to ensure drop handler has time to read the data
    // This is a workaround for WebKit firing dragend before drop in some cases
    setTimeout(() => {
      clearDraggedNodeData();
    }, 100);
  };

  const filteredTemplates = searchQuery
    ? nodeTemplates.filter(
        (n) =>
          n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : nodeTemplates;

  // Count nodes per category
  const categoryCounts = categoryOrder.reduce((acc, cat) => {
    acc[cat] = nodeTemplates.filter((n) => n.category === cat).length;
    return acc;
  }, {} as Record<NodeCategory, number>);

  const totalNodes = nodeTemplates.length;

  return (
    <div className="w-72 bg-card border-r flex flex-col flex-shrink-0">
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
            // Search results
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
            // Category view
            categoryOrder.map((categoryId) => {
              const nodes = nodeTemplates.filter((n) => n.category === categoryId);
              if (nodes.length === 0) return null;
              const isExpanded = expandedCategories.has(categoryId);
              const colors = categoryColors[categoryId];
              const iconName = categoryIcons[categoryId];
              const categoryName = categoryNames[categoryId];

              return (
                <div key={categoryId} className="mb-0.5">
                  {/* Category Header */}
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

                  {/* Nodes */}
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
    </div>
  );
}

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

  // Check if this node is pending placement
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
      // Clicking same node cancels selection
      clearPendingNodeTemplate();
    } else {
      // Select this node for placement
      setPendingNodeTemplate(node);
    }
  };

  const itemRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  // Update tooltip position when showing
  useEffect(() => {
    if (showTooltip && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top,
        left: rect.right + 8, // 8px gap
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
        {/* Icon */}
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

        {/* Content */}
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

        {/* Drag indicator */}
        <GripVertical
          size={12}
          className="flex-shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Tooltip - rendered in portal to avoid overflow clipping */}
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
            {/* Arrow */}
            <div className="absolute left-0 top-3 -translate-x-full">
              <div className="border-8 border-transparent border-r-slate-900" />
            </div>

            {/* Content */}
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

            {/* Category badge */}
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
