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
# NOTE: Whenever this script changes in a way that affects dependencies, DB prep,
# or test determinism, bump TEST_PREP_VERSION so cached environments invalidate.
TEST_PREP_VERSION="${TEST_PREP_VERSION:-2}"
MARKER_DIR="$LOG_ROOT/meta"
MARKER_FILE="$MARKER_DIR/platform-test.version"
ALLURE_RESULTS_DIR="${ALLURE_RESULTS_DIR:-./allure-results}"
ALLURE_WATCH_LOG="$LOG_ROOT/allure-watch.log"
if [[ -n "${ALLURE_WATCH_EXTRA_ARGS:-}" ]]; then
  # shellcheck disable=SC2206
  ALLURE_WATCH_ARGS=(${ALLURE_WATCH_EXTRA_ARGS})
else
  ALLURE_WATCH_ARGS=(--port "${REPORT_PORT}")
fi
mkdir -p "$MARKER_DIR"

SKIP_PREP=0
STORED_VERSION=""
if [[ -f "$MARKER_FILE" ]]; then
  STORED_VERSION="$(<"$MARKER_FILE")"
  if [[ "$STORED_VERSION" == "$TEST_PREP_VERSION" ]]; then
    log "Environment marker $MARKER_FILE matches version $TEST_PREP_VERSION. Skipping dependency and setup steps."
    SKIP_PREP=1
  else
    log "Environment version mismatch (found '${STORED_VERSION}', expected '${TEST_PREP_VERSION}'). Running full setup."
  fi
else
  log "No environment version marker found at $MARKER_FILE. Running full setup."
fi

if [[ "$SKIP_PREP" -ne 1 ]]; then
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

  echo "$TEST_PREP_VERSION" >"$MARKER_FILE"
  log "Environment marker updated to version $TEST_PREP_VERSION at $MARKER_FILE."
fi

cleanup() {
  if [[ -n "${WATCH_LOOP_PID:-}" ]]; then
    kill "$WATCH_LOOP_PID" 2>/dev/null || true
  fi
  if [[ -n "${ALLURE_WATCH_PID:-}" ]]; then
    kill "$ALLURE_WATCH_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

WATCH_LOOP_SCRIPT="/app/scripts/test-watch-loop.mjs"
if [[ "${DISABLE_TEST_WATCH_LOOP:-0}" != "1" && -x "$WATCH_LOOP_SCRIPT" ]]; then
  log "Starting deterministic watch loop (debounce=${TEST_WATCH_DEBOUNCE_MS:-750}ms)."
  "$WATCH_LOOP_SCRIPT" &
  WATCH_LOOP_PID=$!
else
  log "Watch loop disabled (set DISABLE_TEST_WATCH_LOOP=1 to control)."
fi

if command -v npx >/dev/null 2>&1; then
  log "Starting Allure 3 watch server on port ${REPORT_PORT} (results dir: ${ALLURE_RESULTS_DIR})."
  if npx allure watch "$ALLURE_RESULTS_DIR" "${ALLURE_WATCH_ARGS[@]}" >"$ALLURE_WATCH_LOG" 2>&1 & then
    ALLURE_WATCH_PID=$!
    log "Allure watch server pid ${ALLURE_WATCH_PID}. Logs at $ALLURE_WATCH_LOG."
  else
    log "Failed to start Allure watch server (see $ALLURE_WATCH_LOG)."
  fi
else
  log "Allure CLI unavailable. Install dev dependencies to enable watch server."
fi

log "Reports available at:"
log "- http://localhost:${REPORT_PORT}/ (proxied by Allure watch server)"
log "- Coverage HTML remains at ./coverage/"
log "Dropping into interactive shell. Watch loop will re-run npm test:setup + test:allure on source changes."

exec bash -l
