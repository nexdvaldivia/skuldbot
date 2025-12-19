import { EdgeProps, getSmoothStepPath, useReactFlow, EdgeLabelRenderer } from "reactflow";
import { Trash2 } from "lucide-react";

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

  const isSuccess = data?.edgeType === "success";
  const strokeColor = isSuccess ? "#10b981" : "#f97316";

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
      {/* Delete button when selected */}
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute w-7 h-7 rounded-full cursor-pointer flex items-center justify-center bg-orange-500 border-2 border-white shadow-lg hover:bg-orange-600 transition-colors"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              zIndex: 9999,
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
