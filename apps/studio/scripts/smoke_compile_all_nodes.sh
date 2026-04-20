#!/usr/bin/env bash
set -euo pipefail

# Smoke test: validate that every Studio node template compiles with the Engine.
# This script is intentionally self-contained so it can run locally and in CI.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUDIO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${STUDIO_DIR}/.." && pwd)"
ENGINE_DIR="${REPO_DIR}/engine"
ENGINE_PY="${ENGINE_DIR}/.venv/bin/python"
TMP_JSON="/tmp/studio_node_templates.json"
export STUDIO_DIR REPO_DIR ENGINE_DIR TMP_JSON

if [[ ! -x "${ENGINE_PY}" ]]; then
  echo "ERROR: Engine venv not found at ${ENGINE_PY}"
  echo "Run:"
  echo "  cd ${ENGINE_DIR}"
  echo "  python3 -m venv .venv"
  echo "  .venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "[1/2] Extracting Studio node templates..."
node - <<'NODE'
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const studioDir = process.env.STUDIO_DIR;
const ts = require(path.join(studioDir, 'node_modules', 'typescript'));
const srcPath = path.join(studioDir, 'src', 'data', 'nodeTemplates.ts');
let src = fs.readFileSync(srcPath, 'utf8');
src = src.replace(/^import\s+\{[^\n]+\}\s+from\s+"..\/types\/flow";\n/, '');
const out = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const moduleObj = { exports: {} };
const context = { module: moduleObj, exports: moduleObj.exports, require, console };
vm.runInNewContext(out, context, { filename: 'nodeTemplates.js' });
const templates = moduleObj.exports.nodeTemplates || context.exports.nodeTemplates;
if (!Array.isArray(templates)) {
  throw new Error('Failed to read nodeTemplates array');
}
const data = templates.map((t) => ({
  type: t.type,
  label: t.label,
  defaultConfig: t.defaultConfig || {},
  category: t.category,
}));
fs.writeFileSync(process.env.TMP_JSON, JSON.stringify(data, null, 2));
console.log(`Extracted ${data.length} templates`);
NODE

echo "[2/2] Compiling each node template with Engine..."
"${ENGINE_PY}" - <<'PY'
import json
import os
import sys
import tempfile

sys.path.insert(0, os.environ["ENGINE_DIR"])
from skuldbot import Compiler

with open(os.environ["TMP_JSON"], "r", encoding="utf-8") as f:
    templates = json.load(f)

compiler = Compiler()
failures = []
ok = 0

with tempfile.TemporaryDirectory() as td:
    for i, t in enumerate(templates):
        node_type = t["type"]
        node_id = "node-1"
        trigger_id = "trigger-1"

        if node_type.startswith("trigger."):
            nodes = [{
                "id": node_id,
                "type": node_type,
                "label": t.get("label") or node_type,
                "config": t.get("defaultConfig") or {},
                "outputs": {"success": "END", "error": "END"},
            }]
            start_node = node_id
            triggers = [node_id]
        else:
            extra = {}
            # ai.agent requires a connected model in DSL validation
            if node_type == "ai.agent":
                extra["model_config"] = {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "temperature": 0.2,
                    "api_key": "${OPENAI_API_KEY}",
                }
            nodes = [
                {
                    "id": trigger_id,
                    "type": "trigger.manual",
                    "label": "Trigger",
                    "config": {},
                    "outputs": {"success": node_id, "error": "END"},
                },
                {
                    "id": node_id,
                    "type": node_type,
                    "label": t.get("label") or node_type,
                    "config": t.get("defaultConfig") or {},
                    "outputs": {"success": "END", "error": "END"},
                    **extra,
                },
            ]
            start_node = trigger_id
            triggers = [trigger_id]

        dsl = {
            "version": "1.0",
            "bot": {"id": f"smoke-{i}", "name": f"Smoke {node_type}"},
            "start_node": start_node,
            "triggers": triggers,
            "nodes": nodes,
        }

        try:
            compiler.compile_to_disk(dsl, td)
            ok += 1
        except Exception as exc:
            failures.append((node_type, str(exc).split("\n")[0]))

print(f"TOTAL={len(templates)}")
print(f"OK={ok}")
print(f"FAIL={len(failures)}")

if failures:
    print("FAILED_NODES:")
    for node_type, message in failures:
        print(f"  - {node_type}: {message}")
    raise SystemExit(1)

print("All node templates compiled successfully.")
PY

echo "Smoke compile check passed."
