import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronRight, X } from "lucide-react";
import { useValidationStore, ValidationIssue } from "../store/validationStore";
import { useProjectStore } from "../store/projectStore";
import { useNavigationStore } from "../store/navigationStore";
import { useFlowStore } from "../store/flowStore";
import { cn } from "../lib/utils";

interface ProblemsPanelProps {
  className?: string;
}

export default function ProblemsPanel({ className }: ProblemsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { issues, validate, hasErrors } = useValidationStore();
  const { currentView } = useNavigationStore();
  const projectStore = useProjectStore();
  const flowStore = useFlowStore();

  // Get nodes/edges based on current mode
  const isProjectMode = currentView === "project";
  const activeBot = isProjectMode
    ? projectStore.bots.get(projectStore.activeBotId || "")
    : null;
  const nodes = isProjectMode ? (activeBot?.nodes || []) : flowStore.nodes;
  const edges = isProjectMode ? (activeBot?.edges || []) : flowStore.edges;

  // Auto-validate when nodes/edges change
  useEffect(() => {
    const timer = setTimeout(() => {
      validate(nodes, edges);
    }, 500); // Debounce validation

    return () => clearTimeout(timer);
  }, [nodes, edges, validate]);

  // Auto-open panel when there are errors
  useEffect(() => {
    if (hasErrors() && !isOpen) {
      setIsOpen(true);
    }
  }, [hasErrors, isOpen]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const getSeverityIcon = (severity: ValidationIssue["severity"]) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "info":
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityClass = (severity: ValidationIssue["severity"]) => {
    switch (severity) {
      case "error":
        return "border-l-red-500 bg-red-50";
      case "warning":
        return "border-l-yellow-500 bg-yellow-50";
      case "info":
        return "border-l-blue-500 bg-blue-50";
    }
  };

  // Group issues by node
  const groupedIssues = issues.reduce((acc, issue) => {
    const key = issue.nodeId || "general";
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {} as Record<string, ValidationIssue[]>);

  const handleIssueClick = (issue: ValidationIssue) => {
    if (issue.nodeId) {
      // Find and select the node
      const node = nodes.find((n) => n.id === issue.nodeId);
      if (node) {
        if (isProjectMode) {
          // In project mode, update nodes to select this one
          const updatedNodes = nodes.map((n) => ({
            ...n,
            selected: n.id === issue.nodeId,
          }));
          projectStore.updateActiveBotNodes(updatedNodes);
        } else {
          flowStore.setNodes(
            nodes.map((n) => ({
              ...n,
              selected: n.id === issue.nodeId,
            }))
          );
        }
        flowStore.setSelectedNode(node);
      }
    }
  };

  if (!isOpen && issues.length === 0) return null;

  return (
    <div className={cn("border-t bg-white", className)}>
      {/* Header - always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
          <span className="text-sm font-medium text-slate-700">Problems</span>

          {/* Counters */}
          <div className="flex items-center gap-2">
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />
                {errorCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {warningCount}
              </span>
            )}
            {infoCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                <Info className="w-3 h-3" />
                {infoCount}
              </span>
            )}
            {issues.length === 0 && (
              <span className="text-xs text-green-600">No issues</span>
            )}
          </div>
        </div>

        {isOpen && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </button>

      {/* Content */}
      {isOpen && issues.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-t">
          {Object.entries(groupedIssues).map(([nodeId, nodeIssues]) => (
            <div key={nodeId}>
              {nodeId !== "general" && (
                <div className="px-3 py-1 bg-slate-100 text-xs font-medium text-slate-600 sticky top-0">
                  {nodes.find((n) => n.id === nodeId)?.data.label || nodeId}
                </div>
              )}
              {nodeIssues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => handleIssueClick(issue)}
                  className={cn(
                    "w-full px-3 py-2 flex items-start gap-2 text-left border-l-2 hover:bg-slate-50 transition-colors",
                    getSeverityClass(issue.severity)
                  )}
                >
                  {getSeverityIcon(issue.severity)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">{issue.message}</p>
                    {issue.field && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Field: {issue.field}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Status bar indicator component
export function ValidationStatusIndicator() {
  const { issues } = useValidationStore();

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600">
        <AlertCircle className="w-3 h-3" />
        <span>No issues</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {errorCount > 0 && (
        <span className="flex items-center gap-1 text-red-600">
          <AlertCircle className="w-3 h-3" />
          {errorCount} error{errorCount > 1 ? "s" : ""}
        </span>
      )}
      {warningCount > 0 && (
        <span className="flex items-center gap-1 text-yellow-600">
          <AlertTriangle className="w-3 h-3" />
          {warningCount} warning{warningCount > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
