#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-platform}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/Containers/.env"
ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi

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

echo "Starting $LABEL containers..."
docker compose "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" up -d
