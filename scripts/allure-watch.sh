#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'USAGE'
Usage:
  scripts/allure-watch.sh [--no-db] [--no-harness] [--coverage] [vitest filters...]

Examples:
  scripts/allure-watch.sh
  scripts/allure-watch.sh --no-db
  scripts/allure-watch.sh --no-db src/modules/SystemTrace
  scripts/allure-watch.sh --no-db --no-harness tests/harness

Environment:
  ALLURE_WATCH_PORT=18080
  ALLURE_WATCH_HOST=127.0.0.1
  ALLURE_WATCH_HARNESS=0
USAGE
  exit 0
fi

exec node ./scripts/test-allure-watch.mjs "$@"
