import assert from "node:assert/strict";
import {
  buildOrthogonalEdgePath,
  getEdgeRouteAnchorTolerance,
  getEdgeRouteSnapConfig,
  normalizeManualRouteCenter,
  setEdgeRouteAnchorTolerance,
  simplifyOrthogonalPoints,
  snapToStep,
} from "../src/utils/edgeRouting.js";

let passed = 0;
const run = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
};

run("snapToStep snaps to nearest grid step", () => {
  assert.equal(snapToStep(41, 20), 40);
  assert.equal(snapToStep(49, 20), 40);
  assert.equal(snapToStep(51, 20), 60);
});

run("simplifyOrthogonalPoints removes duplicates and collinear points", () => {
  const simplified = simplifyOrthogonalPoints([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 5 },
    { x: 20, y: 10 },
  ]);

  assert.deepEqual(simplified, [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
  ]);
});

run("buildOrthogonalEdgePath merges segments and rounds a single elbow", () => {
  const path = buildOrthogonalEdgePath(0, 0, 100, 100, 0, 0);
  assert.ok(path.startsWith("M 0,0"));
  assert.ok(path.endsWith("L 100,100"));
  assert.ok(path.includes("Q 100,0"));
});

run("buildOrthogonalEdgePath adds rounded corner commands on turns", () => {
  const path = buildOrthogonalEdgePath(0, 0, 100, 100, 40, 60);
  assert.ok(path.startsWith("M 0,0"));
  assert.ok(path.endsWith("L 100,100"));
  assert.ok(path.includes("Q 40,0"));
  assert.ok(path.includes("Q 40,60"));
  assert.ok(path.includes("Q 100,60"));
});

run("normalizeManualRouteCenter anchors center to source/target when near", () => {
  const normalized = normalizeManualRouteCenter(
    { x: 102, y: 11 },
    { sourceX: 100, sourceY: 10, targetX: 280, targetY: 140 },
    4
  );

  assert.deepEqual(normalized, { x: 100, y: 10 });
});

run("normalizeManualRouteCenter keeps center unchanged when far from anchors", () => {
  const normalized = normalizeManualRouteCenter(
    { x: 170, y: 90 },
    { sourceX: 100, sourceY: 10, targetX: 280, targetY: 140 },
    6
  );

  assert.deepEqual(normalized, { x: 170, y: 90 });
});

run("edge route anchor tolerance is clamped on set/get", () => {
  const storage = {
    store: {},
    getItem(key) {
      return this.store[key] ?? null;
    },
    setItem(key, value) {
      this.store[key] = value;
    },
  };

  assert.equal(setEdgeRouteAnchorTolerance(100, storage), 48);
  assert.equal(getEdgeRouteAnchorTolerance(storage), 48);
  assert.equal(setEdgeRouteAnchorTolerance(-2, storage), 0);
  assert.equal(getEdgeRouteAnchorTolerance(storage), 0);
});

run("getEdgeRouteSnapConfig parses storage values", () => {
  const storage = {
    getItem(key) {
      if (key === "skuldbot.edgeRouting.snap.enabled") return "false";
      if (key === "skuldbot.edgeRouting.snap.step") return "32";
      return null;
    },
  };

  assert.deepEqual(getEdgeRouteSnapConfig(storage), { enabled: false, step: 32 });
});

run("getEdgeRouteSnapConfig falls back for invalid values", () => {
  const storage = {
    getItem(key) {
      if (key === "skuldbot.edgeRouting.snap.enabled") return "true";
      if (key === "skuldbot.edgeRouting.snap.step") return "abc";
      return null;
    },
  };

  assert.deepEqual(getEdgeRouteSnapConfig(storage), { enabled: true, step: 20 });
});

console.log(`\nEdge routing tests passed: ${passed}`);
