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

main() {
  log "SkuldBot local dev setup starting..."
  ensure_pnpm
  ensure_docker
  start_infra
  install_dependencies
  log "Setup complete."
}

main "$@"
