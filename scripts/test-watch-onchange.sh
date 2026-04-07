#!/usr/bin/env bash
set -euo pipefail

LOG_ROOT="/app/Containers/volumes/logs"
mkdir -p "$LOG_ROOT"
LOG_FILE="$LOG_ROOT/platform-test-watch.log"
REASON="${WATCH_REASON:-manual}"
CHANGED_PATHS="${WATCH_CHANGED_PATHS:-}"

log() {
  local message="[$(date -Iseconds)] [test-watch] $*"
  echo "$message" | tee -a "$LOG_FILE"
}

run_step() {
  local step_name="$1"
  shift
  local tmp_log
  tmp_log="/tmp/${step_name}.log"
  if "$@" >"$tmp_log" 2>&1; then
    log "$step_name completed."
  else
    local exit_code=$?
    log "$step_name failed (exit $exit_code)."
    cat "$tmp_log" >&2 || true
    cp "$tmp_log" "$LOG_ROOT/${step_name}.log" 2>/dev/null || true
    return $exit_code
  fi
  cp "$tmp_log" "$LOG_ROOT/${step_name}.log" 2>/dev/null || true
}

log "Change detected (reason=${REASON}${CHANGED_PATHS:+, paths=${CHANGED_PATHS}}). Triggering deterministic test cycle."
run_step test-setup npm run test:setup
run_step test-allure npm run test:allure
log "Deterministic test cycle complete."
