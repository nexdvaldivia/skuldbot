#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    log "pnpm found: $(pnpm --version)"
    return
  fi

  log "pnpm not found. Attempting install via corepack..."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@8.13.1 --activate
    log "pnpm installed via corepack: $(pnpm --version)"
    return
  fi

  fail "pnpm is required. Install Node.js with corepack or install pnpm manually."
}

ensure_docker() {
  command -v docker >/dev/null 2>&1 || fail "docker is required but not installed."
  docker info >/dev/null 2>&1 || fail "docker daemon is not running. Start Docker and retry."
}

start_infra() {
  if [[ ! -f docker-compose.dev.yml ]]; then
    fail "docker-compose.dev.yml not found. Merge/apply ZD-014 first."
  fi

  log "Starting local dependencies (postgres, redis, minio)..."
  docker compose -f docker-compose.dev.yml up -d
}

install_dependencies() {
  log "Installing monorepo dependencies with pnpm..."
  pnpm install
}

install_python_deps() {
  log "Installing Python dependencies..."

  if ! command -v python3 >/dev/null 2>&1; then
    log "Warning: python3 not found, skipping Python dependencies"
    return
  fi

  if ! python3 -m pip --version >/dev/null 2>&1; then
    log "Warning: python3 pip module not available, skipping Python dependencies"
    return
  fi

  (cd engine && python3 -m pip install -e ".[dev]") || log "Warning: engine Python deps install failed"
  (cd runner && python3 -m pip install -e ".[dev]") || log "Warning: runner Python deps install failed"
}

main() {
  log "SkuldBot local dev setup starting..."
  ensure_pnpm
  ensure_docker
  start_infra
  install_dependencies
  install_python_deps
  log "Setup complete."
}

main "$@"
