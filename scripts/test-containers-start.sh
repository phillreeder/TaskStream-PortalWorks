#!/usr/bin/env bash
set -uo pipefail
set +e

log() {
  echo "[test-containers-start] $*" >&2
}

retry_command() {
  local description="$1"
  shift
  while true; do
    "$@"
    local status=$?
    if [[ $status -eq 0 ]]; then
      return 0
    fi
    log "$description failed (exit code $status)."
    if [[ ! -t 0 ]]; then
      log "Not running in an interactive terminal; aborting."
      return $status
    fi
    read -rp "Retry $description? [y/N]: " answer
    if [[ "$answer" =~ ^([Yy]|yes)$ ]]; then
      continue
    fi
    return $status
  done
}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/../docker-compose.test.yml"
LOG_VOLUME_DIR="$PROJECT_ROOT/Containers/volumes/logs"
NPM_LOG_HOST_DIR="$LOG_VOLUME_DIR/npm"
AUTOMATION_SOURCE_DIR="${AUTOMATION_SOURCE_DIR:-/data/titan/ActiveProjects/ActiveProjects/SiteAutomation/Prototype1}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log "Unable to find docker-compose.test.yml at $COMPOSE_FILE"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Docker CLI is not available on PATH. Please install Docker or run inside an environment with Docker access."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  log "Docker daemon is not accessible (permission denied). Ensure you can run 'docker info' without sudo."
  exit 1
fi

EXTRA_ARGS=("${@}")

# Ensure the npm log directory exists so docker can bind-mount it.
mkdir -p "$NPM_LOG_HOST_DIR"

# Ensure the automation source directory exists before bind mounting it via docker compose.
if [[ ! -d "$AUTOMATION_SOURCE_DIR" ]]; then
  log "Automation source directory $AUTOMATION_SOURCE_DIR not found. Set AUTOMATION_SOURCE_DIR to override."
  exit 1
fi
export AUTOMATION_SOURCE_DIR

cat <<'MSG'
Launching test stack:
- postgres-test starts automatically and is reused for this session
- platform-test will run npm test:allure once, then drop you into an interactive shell
Use the stop script (test-containers-stop.sh) or Ctrl+C exiting the shell to clean up.
MSG

# Ensure postgres-test is running in the background for the interactive session.
if ! retry_command "Starting postgres-test" docker compose -f "$COMPOSE_FILE" up -d postgres-test; then
  exit $?
fi

# Run platform-test interactively so the entrypoint can drop to a shell after tests.
if ! retry_command "Launching platform-test" docker compose -f "$COMPOSE_FILE" run --service-ports --rm -it platform-test "${EXTRA_ARGS[@]}"; then
  exit $?
fi

exit 0
