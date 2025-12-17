import { EdgeProps, getSmoothStepPath } from "reactflow";

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
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
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

  return (
    <>
      {/* Background edge for better visibility */}
      <path
        d={edgePath}
        fill="none"
        stroke="white"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Animated dashed edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="6 4"
        className="animated-edge"
        markerEnd={markerEnd}
      />
    </>
  );
}
