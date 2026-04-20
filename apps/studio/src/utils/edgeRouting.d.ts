export interface EdgeRoutingPoint {
  x: number;
  y: number;
}

export interface EdgeRouteSnapConfig {
  enabled: boolean;
  step: number;
}

export function snapToStep(value: number, step?: number): number;

export function simplifyOrthogonalPoints(
  points: EdgeRoutingPoint[],
  eps?: number
): EdgeRoutingPoint[];

export function buildOrthogonalEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  centerX: number,
  centerY: number
): string;

export function normalizeManualRouteCenter(
  center: EdgeRoutingPoint,
  anchors: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  },
  tolerance?: number
): EdgeRoutingPoint;

export function getEdgeRouteAnchorTolerance(
  storage?: Pick<Storage, "getItem"> | undefined
): number;

export function setEdgeRouteAnchorTolerance(
  value: number,
  storage?: Pick<Storage, "setItem"> | undefined
): number;

export function getEdgeRouteSnapConfig(
  storage?: Pick<Storage, "getItem"> | undefined
): EdgeRouteSnapConfig;
