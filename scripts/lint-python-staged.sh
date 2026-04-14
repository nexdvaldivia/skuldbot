#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
shift || true

if [[ $# -eq 0 ]]; then
  exit 0
fi

if command -v ruff >/dev/null 2>&1; then
  RUFF_CMD=(ruff)
elif command -v python3 >/dev/null 2>&1 && python3 -c "import ruff" >/dev/null 2>&1; then
  RUFF_CMD=(python3 -m ruff)
else
  echo "[lint-staged] ruff is not installed; skipping Python lint for staged files."
  echo "[lint-staged] Install with: python3 -m pip install ruff"
  exit 0
fi

case "$mode" in
  check)
    "${RUFF_CMD[@]}" check --fix "$@"
    ;;
  format)
    "${RUFF_CMD[@]}" format "$@"
    ;;
  *)
    echo "Usage: $0 <check|format> <files...>" >&2
    exit 2
    ;;
esac
