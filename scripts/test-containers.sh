#!/usr/bin/env bash
set -euo pipefail
trap 'echo "[test-containers] Error on line ${LINENO}: ${BASH_COMMAND}" >&2' ERR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBCOMMAND="${1:-start}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$SUBCOMMAND" in
  start)
    exec "$SCRIPT_DIR/test-containers-start.sh" "$@"
    ;;
  stop)
    exec "$SCRIPT_DIR/test-containers-stop.sh" "$@"
    ;;
  *)
    echo "Usage: $0 {start|stop} [additional args]" >&2
    exit 1
    ;;
esac
