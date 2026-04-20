import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EdgeProps,
  getSmoothStepPath,
  useReactFlow,
  EdgeLabelRenderer,
} from "reactflow";
import {
  Trash2,
  Wrench,
  Brain,
  Sparkles,
  MessageSquare,
  ArrowLeftRight,
  ArrowUpDown,
  RotateCcw,
} from "lucide-react";
import { useProjectStore } from "../store/projectStore";
import { useFlowStore } from "../store/flowStore";
import { useTabsStore } from "../store/tabsStore";
import type { FlowEdge, FlowEdgeData } from "../types/flow";
import {
  buildOrthogonalEdgePath,
  getEdgeRouteAnchorTolerance,
  getEdgeRouteSnapConfig,
  normalizeManualRouteCenter,
  snapToStep,
} from "../utils/edgeRouting.js";

const FLOW_EDGE_TYPES = new Set(["success", "error", "connection"]);

function getBundleOffset(index: number, total: number, spacing: number, maxSpread: number) {
  if (total <= 1 || index < 0) {
    return 0;
  }
  const centered = (index - (total - 1) / 2) * spacing;
  return Math.max(-maxSpread, Math.min(maxSpread, centered));
}

export default function AnimatedEdge({
  id,
  source,
  target,
  targetHandleId,
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
  const { deleteElements, screenToFlowPosition } = useReactFlow();
  const [draggingAxis, setDraggingAxis] = useState<"x" | "y" | null>(null);
  const [draftCenter, setDraftCenter] = useState<{ x: number; y: number } | null>(null);
  const [anchorTolerance, setAnchorTolerance] = useState(() => getEdgeRouteAnchorTolerance());
  const edgeType = data?.edgeType || "success";
  const isFlowEdge = FLOW_EDGE_TYPES.has(edgeType);

  const hasManualRoute =
    data?.route?.manual === true &&
    Number.isFinite(data?.route?.centerX) &&
    Number.isFinite(data?.route?.centerY);
  const routeCenterX = hasManualRoute ? data?.route?.centerX : undefined;
  const routeCenterY = hasManualRoute ? data?.route?.centerY : undefined;

  const autoRouteLaneOffset = useMemo(() => {
    if (hasManualRoute || !target || !source || !isFlowEdge) {
      return 0;
    }

    const projectState = useProjectStore.getState();
    const activeBotId = projectState.activeBotId;
    const activeBot = activeBotId ? projectState.bots.get(activeBotId) : null;
    const graphEdges = activeBot ? activeBot.edges : useFlowStore.getState().edges;
    const graphNodes = activeBot ? activeBot.nodes : useFlowStore.getState().nodes;

    const sourceYByNodeId = new Map<string, number>(
      graphNodes.map((node) => [node.id, node.position?.y ?? 0])
    );

    const peers = graphEdges
      .filter((edge) => {
        const peerEdgeType = edge.data?.edgeType || "success";
        const isManualPeer = edge.data?.route?.manual === true;
        return (
          !isManualPeer &&
          edge.target === target &&
          (edge.targetHandle ?? null) === (targetHandleId ?? null) &&
          peerEdgeType === edgeType
        );
      })
      .sort((a, b) => {
        const ay = a.source === source ? sourceY : (sourceYByNodeId.get(a.source) ?? 0);
        const by = b.source === source ? sourceY : (sourceYByNodeId.get(b.source) ?? 0);
        if (ay !== by) return ay - by;
        return a.id.localeCompare(b.id);
      });

    const index = peers.findIndex((edge) => edge.id === id);
    const spacing = edgeType === "error" ? 24 : 18;
    const maxSpread = edgeType === "error" ? 96 : 64;
    return getBundleOffset(index, peers.length, spacing, maxSpread);
  }, [edgeType, hasManualRoute, id, isFlowEdge, source, sourceY, target, targetHandleId]);

  const defaultCenterY = ((sourceY + targetY) / 2) + autoRouteLaneOffset;
  const errorCenterX =
    edgeType === "error" ? sourceX + (targetX - sourceX) * 0.72 : undefined;

  const [defaultEdgePath, defaultLabelX, defaultLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: isFlowEdge ? 16 : 12,
    offset: isFlowEdge ? 24 : 18,
    ...(Number.isFinite(defaultCenterY) ? { centerY: defaultCenterY } : {}),
    ...(Number.isFinite(errorCenterX) ? { centerX: errorCenterX } : {}),
  });

  const useOrthogonalRoute = hasManualRoute || draftCenter !== null;
  const effectiveCenterX = draftCenter?.x ?? (hasManualRoute ? (routeCenterX as number) : defaultLabelX);
  const effectiveCenterY = draftCenter?.y ?? (hasManualRoute ? (routeCenterY as number) : defaultLabelY);
  const normalizedRouteCenter = useOrthogonalRoute && draftCenter === null
    ? normalizeManualRouteCenter(
        { x: effectiveCenterX, y: effectiveCenterY },
        { sourceX, sourceY, targetX, targetY },
        anchorTolerance
      )
    : null;
  const resolvedCenterX = normalizedRouteCenter?.x ?? effectiveCenterX;
  const resolvedCenterY = normalizedRouteCenter?.y ?? effectiveCenterY;

  const edgePath = useOrthogonalRoute
    ? buildOrthogonalEdgePath(
        sourceX,
        sourceY,
        targetX,
        targetY,
        resolvedCenterX,
        resolvedCenterY
      )
    : defaultEdgePath;
  const labelX = useOrthogonalRoute ? resolvedCenterX : defaultLabelX;
  const labelY = useOrthogonalRoute ? resolvedCenterY : defaultLabelY;

  const axisHandleX = resolvedCenterX;
  const axisHandleY = resolvedCenterY;
  const deleteButtonX = labelX - 18;
  const deleteButtonY = labelY;
  const xSegment = {
    x1: axisHandleX,
    y1: sourceY,
    x2: axisHandleX,
    y2: axisHandleY,
  };
  const ySegment = {
    x1: axisHandleX,
    y1: axisHandleY,
    x2: targetX,
    y2: axisHandleY,
  };
  const hasXSegment = Math.abs(xSegment.y2 - xSegment.y1) > 1;
  const hasYSegment = Math.abs(ySegment.x2 - ySegment.x1) > 1;
  const xHandle = {
    x: xSegment.x1,
    y: (xSegment.y1 + xSegment.y2) / 2,
  };
  const yHandle = {
    x: (ySegment.x1 + ySegment.x2) / 2,
    y: ySegment.y1,
  };
  const handlesOverlap = Math.hypot(xHandle.x - yHandle.x, xHandle.y - yHandle.y) < 18;
  const xHandlePosition = handlesOverlap ? { x: xHandle.x - 10, y: xHandle.y - 10 } : xHandle;
  const yHandlePosition = handlesOverlap ? { x: yHandle.x + 10, y: yHandle.y + 10 } : yHandle;

  // Determine edge color - use source node's category color if available
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

  const normalizeCenterForEdge = useCallback(
    (center: { x: number; y: number }) =>
      normalizeManualRouteCenter(center, { sourceX, sourceY, targetX, targetY }, anchorTolerance),
    [anchorTolerance, sourceX, sourceY, targetX, targetY]
  );

  useEffect(() => {
    if (!selected) {
      setDraggingAxis(null);
      setDraftCenter(null);
    }
  }, [selected]);

  useEffect(() => {
    const handleRoutingSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ anchorTolerance?: number }>;
      const nextTolerance = customEvent.detail?.anchorTolerance;
      if (Number.isFinite(nextTolerance)) {
        setAnchorTolerance(nextTolerance as number);
      } else {
        setAnchorTolerance(getEdgeRouteAnchorTolerance());
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("skuldbot:edge-routing-settings-changed", handleRoutingSettingsChanged);
      return () =>
        window.removeEventListener("skuldbot:edge-routing-settings-changed", handleRoutingSettingsChanged);
    }
    return undefined;
  }, []);

  const patchEdgeRoute = useCallback(
    (center: { x: number; y: number } | null) => {
      const projectState = useProjectStore.getState();
      const activeBotId = projectState.activeBotId;

      if (activeBotId) {
        const activeBot = projectState.bots.get(activeBotId);
        if (!activeBot) return;

        const updatedEdges = activeBot.edges.map((edge) => {
          if (edge.id !== id) return edge;
          const nextData: FlowEdgeData = {
            ...(edge.data || {}),
            edgeType: edge.data?.edgeType || data?.edgeType || "success",
          };
          if (center) {
            nextData.route = { centerX: center.x, centerY: center.y, manual: true };
          } else {
            delete nextData.route;
          }
          return { ...edge, data: nextData };
        }) as FlowEdge[];

        projectState.updateActiveBotEdges(updatedEdges);
        useTabsStore.getState().setTabDirty(`bot-${activeBotId}`, true);
        return;
      }

      const flowState = useFlowStore.getState();
      const updatedEdges = flowState.edges.map((edge) => {
        if (edge.id !== id) return edge;
        const nextData: FlowEdgeData = {
          ...(edge.data || {}),
          edgeType: edge.data?.edgeType || data?.edgeType || "success",
        };
        if (center) {
          nextData.route = { centerX: center.x, centerY: center.y, manual: true };
        } else {
          delete nextData.route;
        }
        return { ...edge, data: nextData };
      }) as FlowEdge[];
      flowState.setEdges(updatedEdges);
    },
    [id]
  );

  useEffect(() => {
    if (!hasManualRoute || draftCenter !== null) {
      return;
    }
    const currentCenter = { x: routeCenterX as number, y: routeCenterY as number };
    const normalizedCenter = normalizeCenterForEdge(currentCenter);
    const driftX = Math.abs(normalizedCenter.x - currentCenter.x);
    const driftY = Math.abs(normalizedCenter.y - currentCenter.y);
    if (driftX > 0.01 || driftY > 0.01) {
      patchEdgeRoute(normalizedCenter);
    }
  }, [
    draftCenter,
    hasManualRoute,
    normalizeCenterForEdge,
    patchEdgeRoute,
    routeCenterX,
    routeCenterY,
  ]);

  const startAxisDrag = useCallback(
    (axis: "x" | "y") => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingAxis(axis);
      const snapConfig = getEdgeRouteSnapConfig();
      let currentCenter = { x: axisHandleX, y: axisHandleY };

      const handleMouseMove = (event: MouseEvent) => {
        event.preventDefault();
        const flowPos = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        const shouldSnap = snapConfig.enabled && !event.altKey;
        const nextX = shouldSnap ? snapToStep(flowPos.x, snapConfig.step) : flowPos.x;
        const nextY = shouldSnap ? snapToStep(flowPos.y, snapConfig.step) : flowPos.y;
        const nextCenter =
          axis === "x"
            ? { x: nextX, y: currentCenter.y }
            : { x: currentCenter.x, y: nextY };
        currentCenter = nextCenter;
        setDraftCenter(currentCenter);
      };

      const handleMouseUp = (event: MouseEvent) => {
        event.preventDefault();
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        setDraggingAxis(null);
        patchEdgeRoute(normalizeCenterForEdge(currentCenter));
        setDraftCenter(null);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [axisHandleX, axisHandleY, normalizeCenterForEdge, patchEdgeRoute, screenToFlowPosition]
  );

  const handleEnableRouting = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const snapConfig = getEdgeRouteSnapConfig();
      const center = snapConfig.enabled
        ? {
            x: snapToStep(axisHandleX, snapConfig.step),
            y: snapToStep(axisHandleY, snapConfig.step),
          }
        : { x: axisHandleX, y: axisHandleY };
      patchEdgeRoute(normalizeCenterForEdge(center));
      setDraftCenter(null);
    },
    [axisHandleX, axisHandleY, normalizeCenterForEdge, patchEdgeRoute]
  );

  const handleRouteReset = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDraftCenter(null);
      patchEdgeRoute(null);
    },
    [patchEdgeRoute]
  );

  return (
    <>
      {/* Background edge for better visibility */}
      <path
        d={edgePath}
        fill="none"
        stroke="white"
        strokeWidth={selected ? 6 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Animated dashed edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 3 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="6 4"
        className="animated-edge"
        markerEnd={markerEnd}
      />
      {/* Segment guides for manual routing */}
      {selected && hasManualRoute && hasXSegment && (
        <>
          <path
            d={`M ${xSegment.x1},${xSegment.y1} L ${xSegment.x2},${xSegment.y2}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={draggingAxis === "x" ? 0.5 : 0.25}
          />
          <path
            d={`M ${xSegment.x1},${xSegment.y1} L ${xSegment.x2},${xSegment.y2}`}
            fill="none"
            stroke="transparent"
            strokeWidth={20}
            strokeLinecap="round"
            style={{ pointerEvents: "stroke", cursor: "ew-resize" }}
            onMouseDown={startAxisDrag("x")}
          />
        </>
      )}
      {selected && hasManualRoute && hasYSegment && (
        <>
          <path
            d={`M ${ySegment.x1},${ySegment.y1} L ${ySegment.x2},${ySegment.y2}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={draggingAxis === "y" ? 0.5 : 0.25}
          />
          <path
            d={`M ${ySegment.x1},${ySegment.y1} L ${ySegment.x2},${ySegment.y2}`}
            fill="none"
            stroke="transparent"
            strokeWidth={20}
            strokeLinecap="round"
            style={{ pointerEvents: "stroke", cursor: "ns-resize" }}
            onMouseDown={startAxisDrag("y")}
          />
        </>
      )}
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
          <>
            <button
              type="button"
              className="nodrag nopan absolute w-7 h-7 rounded-full cursor-pointer flex items-center justify-center border-2 border-white shadow-lg transition-colors hover:brightness-110"
              style={{
                transform: `translate(-50%, -50%) translate(${deleteButtonX}px, ${deleteButtonY}px)`,
                pointerEvents: "all",
                zIndex: 9999,
                backgroundColor: strokeColor,
              }}
              onClick={handleDelete}
              title="Delete connection"
            >
              <Trash2 className="w-4 h-4 text-white" />
            </button>
            {!hasManualRoute && (
              <button
                type="button"
                className="nodrag nopan absolute w-7 h-7 rounded-full cursor-pointer flex items-center justify-center border-2 border-white shadow-lg transition-colors hover:brightness-110"
                style={{
                  transform: `translate(-50%, -50%) translate(${labelX + 18}px, ${labelY}px)`,
                  pointerEvents: "all",
                  zIndex: 9999,
                  backgroundColor: strokeColor,
                }}
                onClick={handleEnableRouting}
                title="Enable segment routing"
              >
                <ArrowLeftRight className="w-4 h-4 text-white" />
              </button>
            )}
            {hasManualRoute && (
              <button
                type="button"
                className="nodrag nopan absolute w-7 h-7 rounded-full cursor-move flex items-center justify-center border-2 border-white shadow-lg transition-colors hover:brightness-110"
                style={{
                  transform: `translate(-50%, -50%) translate(${labelX + 18}px, ${labelY}px)`,
                  pointerEvents: "all",
                  zIndex: 9999,
                  backgroundColor: strokeColor,
                }}
                onClick={handleRouteReset}
                title="Reset segment routing"
              >
                <RotateCcw className="w-4 h-4 text-white" />
              </button>
            )}
            {hasManualRoute && (
              <button
                type="button"
                className="nodrag nopan absolute w-7 h-7 rounded-full cursor-ew-resize flex items-center justify-center border-2 border-white shadow-lg transition-colors hover:brightness-110"
                style={{
                  transform: `translate(-50%, -50%) translate(${xHandlePosition.x}px, ${xHandlePosition.y}px)`,
                  pointerEvents: "all",
                  zIndex: 10000,
                  backgroundColor: strokeColor,
                }}
                onMouseDown={startAxisDrag("x")}
                title="Move segment horizontally"
              >
                <ArrowLeftRight className="w-4 h-4 text-white" />
              </button>
            )}
            {hasManualRoute && (
              <button
                type="button"
                className="nodrag nopan absolute w-7 h-7 rounded-full cursor-ns-resize flex items-center justify-center border-2 border-white shadow-lg transition-colors hover:brightness-110"
                style={{
                  transform: `translate(-50%, -50%) translate(${yHandlePosition.x}px, ${yHandlePosition.y}px)`,
                  pointerEvents: "all",
                  zIndex: 10000,
                  backgroundColor: strokeColor,
                }}
                onMouseDown={startAxisDrag("y")}
                title="Move segment vertically"
              >
                <ArrowUpDown className="w-4 h-4 text-white" />
              </button>
            )}
          </>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
