#!/usr/bin/env bash
# set -euo pipefail

TARGET="${1:-platform}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$TARGET" in
  postgres)
    COMPOSE_FILE="$PROJECT_ROOT/Containers/postgres/docker-compose.yml"
    LABEL="Postgres DB"
    ;;
  pgadmin)
    COMPOSE_FILE="$PROJECT_ROOT/Containers/pgadmin/docker-compose.yml"
    LABEL="pgAdmin UI"
    ;;
  platform)
    COMPOSE_FILE="$PROJECT_ROOT/Containers/platform/docker-compose.yml"
    LABEL="PortalWorks platform"
    ;;
  *)
    echo "Usage: $0 [postgres|pgadmin|platform]"
    exit 1
    ;;
esac

echo "Stopping $LABEL containers..."
docker compose -f "$COMPOSE_FILE" down
