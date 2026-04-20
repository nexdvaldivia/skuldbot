const DEFAULT_SNAP_ENABLED = false;
const DEFAULT_SNAP_STEP = 20;
const SNAP_ENABLED_KEY = "skuldbot.edgeRouting.snap.enabled";
const SNAP_STEP_KEY = "skuldbot.edgeRouting.snap.step";
const DEFAULT_ANCHOR_TOLERANCE = 8;
const MIN_ANCHOR_TOLERANCE = 0;
const MAX_ANCHOR_TOLERANCE = 48;
const ANCHOR_TOLERANCE_KEY = "skuldbot.edgeRouting.anchor.tolerance";

function clampAnchorTolerance(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_ANCHOR_TOLERANCE;
  }
  return Math.max(MIN_ANCHOR_TOLERANCE, Math.min(MAX_ANCHOR_TOLERANCE, Math.round(numeric)));
}

export function snapToStep(value, step = DEFAULT_SNAP_STEP) {
  if (!Number.isFinite(value)) return value;
  const safeStep = Number(step);
  if (!Number.isFinite(safeStep) || safeStep <= 0) {
    return value;
  }
  return Math.round(value / safeStep) * safeStep;
}

export function simplifyOrthogonalPoints(points, eps = 0.001) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const nearlyEqual = (a, b) => Math.abs(a - b) <= eps;
  const isCollinearOrthogonal = (a, b, c) =>
    (nearlyEqual(a.x, b.x) && nearlyEqual(b.x, c.x)) ||
    (nearlyEqual(a.y, b.y) && nearlyEqual(b.y, c.y));

  const deduped = points.filter((point, index, arr) => {
    if (index === 0) return true;
    const prev = arr[index - 1];
    return !nearlyEqual(prev.x, point.x) || !nearlyEqual(prev.y, point.y);
  });

  if (deduped.length <= 2) {
    return deduped;
  }

  const simplified = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const prev = simplified[simplified.length - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];
    if (isCollinearOrthogonal(prev, curr, next)) {
      continue;
    }
    simplified.push(curr);
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

export function buildOrthogonalEdgePath(sourceX, sourceY, targetX, targetY, centerX, centerY) {
  const points = simplifyOrthogonalPoints([
    { x: sourceX, y: sourceY },
    { x: centerX, y: sourceY },
    { x: centerX, y: centerY },
    { x: targetX, y: centerY },
    { x: targetX, y: targetY },
  ]);

  if (points.length === 0) {
    return "";
  }

  if (points.length <= 2) {
    return points
      .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" ");
  }

  const CORNER_RADIUS = 10;
  const pathParts = [`M ${points[0].x},${points[0].y}`];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);

    const collinear =
      (Math.abs(dx1) > 0 && Math.abs(dx2) > 0 && Math.abs(dy1) <= 0.001 && Math.abs(dy2) <= 0.001) ||
      (Math.abs(dy1) > 0 && Math.abs(dy2) > 0 && Math.abs(dx1) <= 0.001 && Math.abs(dx2) <= 0.001);
    if (collinear) {
      pathParts.push(`L ${curr.x},${curr.y}`);
      continue;
    }

    const radius = Math.min(CORNER_RADIUS, len1 / 2, len2 / 2);
    if (!Number.isFinite(radius) || radius <= 0) {
      pathParts.push(`L ${curr.x},${curr.y}`);
      continue;
    }

    const inX = curr.x - (dx1 / len1) * radius;
    const inY = curr.y - (dy1 / len1) * radius;
    const outX = curr.x + (dx2 / len2) * radius;
    const outY = curr.y + (dy2 / len2) * radius;

    pathParts.push(`L ${inX},${inY}`);
    pathParts.push(`Q ${curr.x},${curr.y} ${outX},${outY}`);
  }

  const last = points[points.length - 1];
  pathParts.push(`L ${last.x},${last.y}`);

  return pathParts.join(" ");
}

export function normalizeManualRouteCenter(
  center,
  anchors,
  tolerance = DEFAULT_ANCHOR_TOLERANCE
) {
  if (!center || !anchors) {
    return center;
  }

  const safeTolerance = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 8;
  const normalizeAxis = (value, a, b) => {
    if (!Number.isFinite(value)) return value;
    const deltaA = Math.abs(value - a);
    const deltaB = Math.abs(value - b);
    if (deltaA <= safeTolerance && deltaA <= deltaB) return a;
    if (deltaB <= safeTolerance) return b;
    return value;
  };

  return {
    x: normalizeAxis(center.x, anchors.sourceX, anchors.targetX),
    y: normalizeAxis(center.y, anchors.sourceY, anchors.targetY),
  };
}

export function getEdgeRouteAnchorTolerance(storage = globalThis?.localStorage) {
  if (!storage || typeof storage.getItem !== "function") {
    return DEFAULT_ANCHOR_TOLERANCE;
  }

  try {
    const raw = storage.getItem(ANCHOR_TOLERANCE_KEY);
    if (raw === null) {
      return DEFAULT_ANCHOR_TOLERANCE;
    }
    return clampAnchorTolerance(raw);
  } catch {
    return DEFAULT_ANCHOR_TOLERANCE;
  }
}

export function setEdgeRouteAnchorTolerance(value, storage = globalThis?.localStorage) {
  const tolerance = clampAnchorTolerance(value);
  if (!storage || typeof storage.setItem !== "function") {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("skuldbot:edge-routing-settings-changed", {
            detail: { anchorTolerance: tolerance },
          })
        );
      }
    } catch {
      // ignore event dispatch errors
    }
    return tolerance;
  }

  try {
    storage.setItem(ANCHOR_TOLERANCE_KEY, String(tolerance));
  } catch {
    // ignore storage write errors and still return normalized value
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("skuldbot:edge-routing-settings-changed", {
          detail: { anchorTolerance: tolerance },
        })
      );
    }
  } catch {
    // ignore event dispatch errors
  }
  return tolerance;
}

export function getEdgeRouteSnapConfig(storage = globalThis?.localStorage) {
  const fallback = {
    enabled: DEFAULT_SNAP_ENABLED,
    step: DEFAULT_SNAP_STEP,
  };

  if (!storage || typeof storage.getItem !== "function") {
    return fallback;
  }

  try {
    const enabledRaw = storage.getItem(SNAP_ENABLED_KEY);
    const stepRaw = storage.getItem(SNAP_STEP_KEY);

    const enabled =
      enabledRaw === null ? DEFAULT_SNAP_ENABLED : enabledRaw.toLowerCase() === "true";
    const parsedStep = Number(stepRaw);
    const step =
      Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : DEFAULT_SNAP_STEP;

    return { enabled, step };
  } catch {
    return fallback;
  }
}
