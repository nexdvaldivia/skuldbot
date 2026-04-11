#!/usr/bin/env node
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(rootDir, "tests", "ai-planner-v2-flow.test.ts");
const tempDir = mkdtempSync(path.join(tmpdir(), "skuldbot-planner-flow-"));
const outFile = path.join(tempDir, "ai-planner-v2-flow.test.mjs");

try {
  await build({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
    logLevel: "silent",
  });

  await import(pathToFileURL(outFile).href);
  console.log("Planner flow tests passed.");
} catch (error) {
  console.error("Planner flow tests failed:", error);
  process.exitCode = 1;
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
