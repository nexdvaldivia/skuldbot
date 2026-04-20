#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/5] Checking environment..."
bash "$ROOT_DIR/check-setup.sh"

echo "[2/5] Linting Studio frontend..."
(cd "$ROOT_DIR" && npm run lint)

echo "[3/5] Building Studio frontend..."
(cd "$ROOT_DIR" && npm run build)

echo "[4/5] Running Tauri backend tests..."
(cd "$ROOT_DIR/src-tauri" && cargo test)

echo "[5/6] Running planner flow tests..."
(cd "$ROOT_DIR" && npm run test:planner-flow)

echo "[6/6] Running node-template compile smoke test..."
(cd "$ROOT_DIR" && npm run smoke:compile:nodes)

echo "Studio verification passed."
