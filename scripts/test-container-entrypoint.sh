#!/usr/bin/env bash
set -euo pipefail
trap 'echo "[test-container-entrypoint] Error on line ${LINENO}: ${BASH_COMMAND}" >&2' ERR
LOG_ROOT="/app/Containers/volumes/logs"
mkdir -p "$LOG_ROOT"
touch "$LOG_ROOT/platform-test-entrypoint.log"
log_file="$LOG_ROOT/platform-test-entrypoint.log"

log_to_file() {
  echo "[$(date -Iseconds)] $1" | tee -a "$log_file"
}

log() {
  echo "[platform-test] $*"
  log_to_file "$*"
}

REPORT_PORT="${TEST_REPORT_PORT:-18080}"
APT_SENTINEL="/tmp/.test-container-java"
WORKSPACE_FLAGS=(--workspaces --include-workspace-root)

if [[ ! -f "$APT_SENTINEL" ]]; then
  log "Installing OpenJDK 17 for Allure CLI..."
  apt-get update >/dev/null
  apt-get install -y --no-install-recommends openjdk-17-jre-headless >/dev/null
  touch "$APT_SENTINEL"
fi

log "Upgrading npm to latest (for workspace support)..."
if npm install -g npm@latest >/tmp/npm-upgrade.log 2>&1; then
  log "npm upgrade completed."
else
  EXIT_CODE=$?
  log "npm upgrade failed (see $LOG_ROOT/npm-upgrade.log). Continuing with bundled npm (exit $EXIT_CODE)."
fi
cp /tmp/npm-upgrade.log "$LOG_ROOT/npm-upgrade.log" 2>/dev/null || true

log "Installing npm dependencies (npm install --include=dev --package-lock=false)..."
if ! npm install --include=dev --package-lock=false "${WORKSPACE_FLAGS[@]}" >/tmp/npm-install.log 2>&1; then
  cp /tmp/npm-install.log "$LOG_ROOT/npm-install.log" 2>/dev/null || true
  log "npm install failed (see $LOG_ROOT/npm-install.log). Exiting."
  exit 1
fi
cp /tmp/npm-install.log "$LOG_ROOT/npm-install.log" 2>/dev/null || true

log "Resetting & migrating test database (npm run test:setup)..."
npm run test:setup

log "Running Vitest + Allure suite (npm run test:allure)..."
if npm run test:allure; then
  log "Initial test suite completed successfully."
else
  EXIT_CODE=$?
  log "Initial test suite failed (exit $EXIT_CODE). You can investigate and rerun inside this shell."
fi

log "Starting static server for reports on port ${REPORT_PORT}..."
npx http-server . -p "$REPORT_PORT" -c-1 >/tmp/test-http-server.log 2>&1 &
HTTP_SERVER_PID=$!
trap 'if [[ -n "${HTTP_SERVER_PID:-}" ]]; then kill "$HTTP_SERVER_PID" 2>/dev/null || true; fi' EXIT

log "Reports available at:"
log "- http://localhost:${REPORT_PORT}/allure-report/"
log "- http://localhost:${REPORT_PORT}/coverage/"
log "Dropping into interactive shell. Use npm run test or npm run test:allure to re-run as needed."

exec bash -l
