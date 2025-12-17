import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { FlowNodeData, NodeCategory } from "../types/flow";
import { getNodeTemplate } from "../data/nodeTemplates";
import { Icon } from "./ui/Icon";

// Category color mapping - Light theme
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
  trigger: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "text-emerald-600",
    accent: "bg-emerald-500",
  },
};

function CustomNode({ data, selected }: NodeProps<FlowNodeData>) {
  const template = getNodeTemplate(data.nodeType);
  const style = categoryStyles[data.category] || categoryStyles.control;
  const isAI = data.category === "ai";
  const isPython = data.category === "python";
  const isTrigger = data.category === "trigger";

  return (
    <div
      className={`
        relative
        bg-white
        rounded-xl
        border
        shadow-sm
        transition-all duration-200
        ${isTrigger ? "ring-2 ring-emerald-300" : ""}
        ${selected
          ? "border-primary ring-2 ring-primary/20 shadow-lg scale-[1.02]"
          : `${style.border} hover:shadow-lg hover:scale-[1.01]`
        }
      `}
      style={{ minWidth: 180 }}
    >
      {/* START Badge for Triggers */}
      {isTrigger && (
        <div className="absolute -top-2.5 left-3 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wide">
          Start
        </div>
      )}

      {/* Input Handle - NOT shown for triggers */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3.5 !h-3.5 !-left-[7px] !bg-slate-400 !border-[3px] !border-white !shadow-sm hover:!bg-slate-600 !transition-all"
        />
      )}

      {/* Content */}
      <div className={`flex items-center gap-3 px-3.5 py-3 ${isTrigger ? "pt-4" : ""}`}>
        {/* Icon container */}
        <div className={`
          relative flex-shrink-0 w-9 h-9 rounded-lg
          ${style.bg}
          flex items-center justify-center
          ${style.icon}
          ${isAI || isPython ? "ring-1 ring-violet-200" : ""}
          ${isTrigger ? "ring-1 ring-emerald-200" : ""}
        `}>
          {template && <Icon name={template.icon} size={18} />}
          {(isAI || isPython) && (
            <div className={`absolute -top-1 -right-1 w-3 h-3 ${isAI ? "bg-gradient-to-r from-violet-500 to-fuchsia-500" : "bg-gradient-to-r from-blue-500 to-yellow-500"} rounded-full border-2 border-white`} />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-800 truncate block">
            {data.label}
          </span>
          {template && (
            <span className="text-[11px] text-slate-400 font-mono truncate block">
              {template.type}
            </span>
          )}
        </div>
      </div>

      {/* Output Handles */}
      <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-5">
        {/* Success Handle */}
        <div className="relative">
          <Handle
            type="source"
            position={Position.Right}
            id="success"
            className="!w-3.5 !h-3.5 !-right-[7px] !bg-emerald-500 !border-[3px] !border-white !shadow-sm hover:!bg-emerald-600 !transition-all"
          />
        </div>
        {/* Error Handle */}
        <div className="relative">
          <Handle
            type="source"
            position={Position.Right}
            id="error"
            className="!w-3.5 !h-3.5 !-right-[7px] !bg-orange-500 !border-[3px] !border-white !shadow-sm hover:!bg-orange-600 !transition-all"
          />
        </div>
      </div>
    </div>
  );
}

export default memo(CustomNode);
