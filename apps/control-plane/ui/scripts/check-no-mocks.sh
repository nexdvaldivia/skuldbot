#!/usr/bin/env bash

set -euo pipefail

TARGET_DIR="${1:-src/app}"
PATTERN='\\bmock[A-Za-z0-9_]*\\b|Mock data|mock data'

if rg -n --glob '*.ts' --glob '*.tsx' --glob '*.js' --glob '*.jsx' "${PATTERN}" "${TARGET_DIR}"; then
  echo ""
  echo "ERROR: Mock data detected in ${TARGET_DIR}."
  echo "Policy: fail-fast without mocks."
  exit 1
fi

echo "OK: no mock patterns found in ${TARGET_DIR}."
