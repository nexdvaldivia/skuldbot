import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import { useProjectStore } from "../store/projectStore";
import { useNavigationStore } from "../store/navigationStore";
import { useFlowStore } from "../store/flowStore";
import { FlowNode } from "../types/flow";
import { cn } from "../lib/utils";

interface NodeSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NodeSearchDialog({ isOpen, onClose }: NodeSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { currentView } = useNavigationStore();
  const projectStore = useProjectStore();
  const flowStore = useFlowStore();

  // Get nodes based on current mode
  const isProjectMode = currentView === "project";
  const activeBot = isProjectMode
    ? projectStore.bots.get(projectStore.activeBotId || "")
    : null;
  const nodes = isProjectMode ? (activeBot?.nodes || []) : flowStore.nodes;

  // Filter nodes based on search query
  const filteredNodes = useMemo(() => {
    if (!query.trim()) return nodes;

    const lowerQuery = query.toLowerCase();
    return nodes.filter((node) => {
      const label = node.data.label?.toLowerCase() || "";
      const type = node.data.nodeType?.toLowerCase() || "";
      const id = node.id.toLowerCase();

      return (
        label.includes(lowerQuery) ||
        type.includes(lowerQuery) ||
        id.includes(lowerQuery)
      );
    });
  }, [nodes, query]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredNodes.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredNodes.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, filteredNodes.length]);

  const handleSelect = (node: FlowNode) => {
    // Select the node and center on it
    if (isProjectMode) {
      const updatedNodes = nodes.map((n) => ({
        ...n,
        selected: n.id === node.id,
      }));
      projectStore.updateActiveBotNodes(updatedNodes);
    } else {
      flowStore.setNodes(
        nodes.map((n) => ({
          ...n,
          selected: n.id === node.id,
        }))
      );
    }
    flowStore.setSelectedNode(node);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredNodes.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredNodes[selectedIndex]) {
          handleSelect(filteredNodes[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search nodes by name, type, or ID..."
            className="flex-1 bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex px-2 py-1 text-xs font-mono text-slate-400 bg-slate-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[40vh] overflow-y-auto"
        >
          {filteredNodes.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              {nodes.length === 0
                ? "No nodes in the flow"
                : "No nodes match your search"}
            </div>
          ) : (
            filteredNodes.map((node, index) => (
              <button
                key={node.id}
                onClick={() => handleSelect(node)}
                className={cn(
                  "w-full px-4 py-3 flex items-center gap-3 text-left transition-colors",
                  index === selectedIndex
                    ? "bg-primary/10"
                    : "hover:bg-slate-50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {node.data.label}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {node.data.nodeType}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">
                    ID: {node.id}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {filteredNodes.length > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-t text-xs text-slate-400 flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] ml-1">↓</kbd>
              <span className="ml-2">Navigate</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">↵</kbd>
              <span className="ml-2">Select</span>
            </span>
            <span className="ml-auto">
              {filteredNodes.length} node{filteredNodes.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Hook for managing search dialog state
export function useNodeSearch() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        const target = e.target as HTMLElement;
        const isTyping =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.getAttribute("contenteditable") === "true";

        // Allow search if not in an input that needs the find functionality
        if (!isTyping) {
          e.preventDefault();
          setIsSearchOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isSearchOpen,
    openSearch: () => setIsSearchOpen(true),
    closeSearch: () => setIsSearchOpen(false),
  };
}
