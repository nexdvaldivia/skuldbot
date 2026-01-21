import { memo } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "reactflow";
import { FlowNodeData, NodeCategory } from "../types/flow";
import { getNodeTemplate } from "../data/nodeTemplates";
import { useValidationStore } from "../store/validationStore";
import { useDebugStore, useNodeDebugState } from "../store/debugStore";
import { Icon } from "./ui/Icon";
import { AlertCircle, AlertTriangle, Circle, Trash2 } from "lucide-react";

// Category color mapping - Same as CustomNode for consistency
const categoryStyles: Record<NodeCategory, { bg: string; border: string; icon: string; accent: string }> = {
  web: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-600",
    accent: "bg-blue-500",
  },
  desktop: {
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    icon: "text-indigo-600",
    accent: "bg-indigo-500",
  },
  files: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: "text-orange-600",
    accent: "bg-orange-500",
  },
  excel: {
    bg: "bg-green-50",
    border: "border-green-200",
    icon: "text-green-600",
    accent: "bg-green-500",
  },
  email: {
    bg: "bg-pink-50",
    border: "border-pink-200",
    icon: "text-pink-600",
    accent: "bg-pink-500",
  },
  api: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "text-emerald-600",
    accent: "bg-emerald-500",
  },
  database: {
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    icon: "text-cyan-600",
    accent: "bg-cyan-500",
  },
  document: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "text-red-600",
    accent: "bg-red-500",
  },
  ai: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    icon: "text-violet-600",
    accent: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
  },
  python: {
    bg: "bg-yellow-50",
    border: "border-yellow-300",
    icon: "text-yellow-600",
    accent: "bg-gradient-to-r from-blue-500 to-yellow-500",
  },
  control: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    icon: "text-slate-600",
    accent: "bg-slate-500",
  },
  logging: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    icon: "text-gray-600",
    accent: "bg-gray-500",
  },
  security: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "text-amber-600",
    accent: "bg-amber-500",
  },
  human: {
    bg: "bg-teal-50",
    border: "border-teal-200",
    icon: "text-teal-600",
    accent: "bg-teal-500",
  },
  compliance: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    icon: "text-rose-600",
    accent: "bg-gradient-to-r from-rose-500 to-red-500",
  },
  dataquality: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    icon: "text-sky-600",
    accent: "bg-gradient-to-r from-sky-500 to-blue-500",
  },
  data: {
    bg: "bg-cyan-50",
    border: "border-cyan-300",
    icon: "text-cyan-600",
    accent: "bg-gradient-to-r from-cyan-500 to-teal-500",
  },
  trigger: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "text-emerald-600",
    accent: "bg-emerald-500",
  },
  vectordb: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    icon: "text-purple-600",
    accent: "bg-gradient-to-r from-purple-500 to-indigo-500",
  },
  voice: {
    bg: "bg-fuchsia-50",
    border: "border-fuchsia-200",
    icon: "text-fuchsia-600",
    accent: "bg-fuchsia-500",
  },
  insurance: {
    bg: "bg-lime-50",
    border: "border-lime-200",
    icon: "text-lime-600",
    accent: "bg-lime-500",
  },
  ms365: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    icon: "text-sky-600",
    accent: "bg-[#0078d4]",
  },
};

function GroupNode({ data, selected, id }: NodeProps<FlowNodeData>) {
  const template = getNodeTemplate(data.nodeType);
  const style = categoryStyles[data.category] || categoryStyles.control;

  // Get validation issues for this node
  const { getNodeIssues } = useValidationStore();
  const nodeIssues = getNodeIssues(id);
  const hasErrors = nodeIssues.some((i) => i.severity === "error");
  const hasWarnings = nodeIssues.some((i) => i.severity === "warning") && !hasErrors;

  // Get debug state for this node
  const { toggleBreakpoint } = useDebugStore();
  const { isCurrentNode, hasBreakpoint, isDebugging, status } = useNodeDebugState(id);

  // React Flow instance for deletion
  const { deleteElements } = useReactFlow();

  // Handle breakpoint toggle
  const handleBreakpointClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleBreakpoint(id);
  };

  // Handle node deletion
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteElements({ nodes: [{ id }] });
  };

  // Get configuration display
  const getConfigDisplay = () => {
    const config = data.config || {};
    switch (data.nodeType) {
      case "control.loop":
        return config.items ? `${config.items}` : "";
      case "control.while":
        return config.condition ? `${config.condition}` : "";
      case "control.if":
        return config.condition ? `${config.condition}` : "";
      case "control.try_catch":
        return "";
      default:
        return "";
    }
  };

  const configDisplay = getConfigDisplay();

  return (
    <>
      {/* Node Resizer - allows user to resize the container */}
      <NodeResizer
        minWidth={280}
        minHeight={180}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-none"
      />

      <div
        className={`
          relative
          rounded-xl
          border
          shadow-sm
          transition-all duration-200
          ${hasErrors ? "ring-2 ring-red-400 border-red-400" : ""}
          ${hasWarnings ? "ring-2 ring-yellow-400 border-yellow-400" : ""}
          ${isCurrentNode && isDebugging ? "ring-2 ring-blue-500 border-blue-500" : ""}
          ${status === "running" ? "animate-pulse ring-2 ring-blue-400" : ""}
          ${status === "success" ? "ring-2 ring-green-400 border-green-400" : ""}
          ${status === "error" ? "ring-2 ring-red-500 border-red-500" : ""}
          ${selected
            ? "border-primary ring-2 ring-primary/20 shadow-lg"
            : `${style.border} hover:shadow-lg`
          }
          w-full
          h-full
          min-w-[280px]
          min-h-[180px]
        `}
        style={{ backgroundColor: "rgba(255, 255, 255, 0.6)" }}
      >
        {/* Breakpoint indicator */}
        <button
          type="button"
          className="absolute -top-2 -left-2 z-20 w-5 h-5 rounded-full cursor-pointer flex items-center justify-center bg-white border border-slate-200 shadow-sm hover:border-red-300 hover:bg-red-50 transition-colors"
          onClick={handleBreakpointClick}
          onMouseDown={(e) => e.stopPropagation()}
          title={hasBreakpoint ? "Remove breakpoint" : "Add breakpoint"}
        >
          <Circle
            className={`w-3 h-3 ${
              hasBreakpoint
                ? "fill-red-500 text-red-500"
                : "text-slate-400"
            }`}
          />
        </button>

        {/* Delete button - shown when selected */}
        {selected && (
          <button
            type="button"
            className="absolute -top-3 -right-3 w-7 h-7 rounded-full cursor-pointer flex items-center justify-center bg-orange-500 border-2 border-white shadow-lg hover:bg-orange-600 transition-colors"
            style={{ zIndex: 9999 }}
            onClick={handleDeleteClick}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete node"
          >
            <Trash2 className="w-4 h-4 text-white" />
          </button>
        )}

        {/* Debug status indicator */}
        {isDebugging && status === "running" && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse z-20">
            Running
          </div>
        )}

        {/* Validation Error/Warning Badge - shown when NOT selected (delete button takes priority) */}
        {hasErrors && !isDebugging && !selected && (
          <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-sm z-10" title={nodeIssues.filter(i => i.severity === "error").map(i => i.message).join("\n")}>
            <AlertCircle className="w-3 h-3 text-white" />
          </div>
        )}
        {hasWarnings && !isDebugging && !selected && (
          <div className="absolute -top-2 -right-2 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center shadow-sm z-10" title={nodeIssues.filter(i => i.severity === "warning").map(i => i.message).join("\n")}>
            <AlertTriangle className="w-3 h-3 text-white" />
          </div>
        )}

        {/* Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3.5 !h-3.5 !-left-[7px] !top-[26px] !bg-slate-400 !border-[3px] !border-white !shadow-sm hover:!bg-slate-600 !transition-all"
        />

        {/* Header - Same style as CustomNode content */}
        <div className="flex items-center gap-3 px-3.5 py-3 border-b border-slate-100">
          {/* Icon container */}
          <div className={`
            relative flex-shrink-0 w-9 h-9 rounded-lg
            ${style.bg}
            flex items-center justify-center
            ${style.icon}
          `}>
            {template && <Icon name={template.icon} size={18} />}
          </div>

          {/* Label and config */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-800 truncate block">
              {data.label}
            </span>
            {template && (
              <span className="text-[11px] text-slate-400 font-mono truncate block">
                {configDisplay || template.type}
              </span>
            )}
          </div>
        </div>

        {/* Drop zone for child nodes */}
        <div className="p-3 flex-1 min-h-[120px] relative">
          {/* Visual hint when empty */}
          {(!data.childNodes || data.childNodes.length === 0) && (
            <div className="absolute inset-3 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-xs pointer-events-none">
              Drop nodes here
            </div>
          )}
        </div>

        {/* Output Handles - 3 outputs for loop containers */}
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-4 pr-0">
          {/* Done Handle - continues after loop completes */}
          <div className="relative group">
            <Handle
              type="source"
              position={Position.Right}
              id="success"
              className="!w-3.5 !h-3.5 !-right-[7px] !bg-emerald-500 !border-[3px] !border-white !shadow-sm hover:!bg-emerald-600 !transition-all"
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              done
            </span>
          </div>
          {/* Error Handle - any error during loop */}
          <div className="relative group">
            <Handle
              type="source"
              position={Position.Right}
              id="error"
              className="!w-3.5 !h-3.5 !-right-[7px] !bg-orange-500 !border-[3px] !border-white !shadow-sm hover:!bg-orange-600 !transition-all"
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              error
            </span>
          </div>
        </div>

        {/* Loop-specific: show variable info */}
        {data.nodeType === "control.loop" && (
          <div className="absolute bottom-2 left-3 right-3 flex gap-2 text-[10px] text-slate-400 font-mono">
            {data.config?.item_var && (
              <span className="bg-slate-50 px-2 py-0.5 rounded">
                ${"{"}${data.config.item_var}{"}"} = item
              </span>
            )}
            {data.config?.accumulator_var && (
              <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded">
                ${"{"}${data.config.accumulator_var}{"}"} = results
              </span>
            )}
          </div>
        )}

        {/* While-specific: show config info */}
        {data.nodeType === "control.while" && (
          <div className="absolute bottom-2 left-3 right-3 flex gap-2 text-[10px] text-slate-400 font-mono">
            {data.config?.max_iterations && (
              <span className="bg-slate-50 px-2 py-0.5 rounded">
                max: {data.config.max_iterations}
              </span>
            )}
            {data.config?.accumulator_var && (
              <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded">
                ${"{"}${data.config.accumulator_var}{"}"} = results
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default memo(GroupNode);
