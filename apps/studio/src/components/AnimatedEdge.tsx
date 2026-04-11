import { EdgeProps, getSmoothStepPath, useReactFlow, EdgeLabelRenderer } from "reactflow";
import { Trash2, Wrench, Brain, Sparkles, MessageSquare } from "lucide-react";

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  // Determine edge color - use source node's category color if available
  const edgeType = data?.edgeType;
  const sourceColor = data?.sourceColor;

  // Use source node color for all edge types
  // Fall back to semantic colors only if no source color is available
  const strokeColor = sourceColor || (
    edgeType === "success" ? "#10b981" :
    edgeType === "error" ? "#f97316" :
    "#6b7280" // Default gray
  );

  // Keep semantic flags for labels/icons
  const isTool = edgeType === "tool";
  const isMemory = edgeType === "memory";
  const isEmbeddings = edgeType === "embeddings";
  const isModel = edgeType === "model";

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteElements({ edges: [{ id }] });
  };

  return (
    <>
      {/* Background edge for better visibility */}
      <path
        d={edgePath}
        fill="none"
        stroke="white"
        strokeWidth={selected ? 6 : 4}
        strokeLinecap="round"
      />
      {/* Animated dashed edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 3 : 2}
        strokeLinecap="round"
        strokeDasharray="6 4"
        className="animated-edge"
        markerEnd={markerEnd}
      />
      {/* Tool label - shows tool name on tool edges */}
      {isTool && data?.toolName && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-medium shadow-lg"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 20}px)`,
              pointerEvents: "none",
              backgroundColor: strokeColor,
            }}
          >
            <Wrench className="w-3 h-3" />
            {data.toolName}
          </div>
        </EdgeLabelRenderer>
      )}
      {/* Memory label - shows "Memory" on memory edges */}
      {isMemory && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-medium shadow-lg"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 20}px)`,
              pointerEvents: "none",
              backgroundColor: strokeColor,
            }}
          >
            <Brain className="w-3 h-3" />
            {data?.memoryType === "retrieve" ? "RAG" : data?.memoryType === "store" ? "Store" : "Memory"}
          </div>
        </EdgeLabelRenderer>
      )}
      {/* Embeddings label - shows "Embeddings" on embeddings edges */}
      {isEmbeddings && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-medium shadow-lg"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 20}px)`,
              pointerEvents: "none",
              backgroundColor: strokeColor,
            }}
          >
            <Sparkles className="w-3 h-3" />
            Embeddings
          </div>
        </EdgeLabelRenderer>
      )}
      {/* Model label - shows "Model" on model edges */}
      {isModel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-medium shadow-lg"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 20}px)`,
              pointerEvents: "none",
              backgroundColor: strokeColor,
            }}
          >
            <MessageSquare className="w-3 h-3" />
            Model
          </div>
        </EdgeLabelRenderer>
      )}
      {/* Delete button when selected */}
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute w-7 h-7 rounded-full cursor-pointer flex items-center justify-center border-2 border-white shadow-lg transition-colors hover:brightness-110"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              zIndex: 9999,
              backgroundColor: strokeColor,
            }}
            onClick={handleDelete}
            title="Delete connection"
          >
            <Trash2 className="w-4 h-4 text-white" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
