#!/usr/bin/env bash
set -uo pipefail
set +e

log() {
  echo "[test-containers-stop] $*" >&2
}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/../docker-compose.test.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log "Unable to find docker-compose.test.yml at $COMPOSE_FILE"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Docker CLI is not available on PATH. Nothing to stop."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  log "Docker daemon is not accessible (permission denied). Nothing to stop."
  exit 0
fi

EXTRA_ARGS=("${@}")

echo "Stopping test containers (and removing orphans)..."
docker compose -f "$COMPOSE_FILE" down "${EXTRA_ARGS[@]}"
STATUS=$?
if [[ $STATUS -ne 0 ]]; then
  log "docker compose down exited with code $STATUS."
fi
exit $STATUS
