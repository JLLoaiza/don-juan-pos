#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/compose/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

cd "$ROOT_DIR"
COMPOSE_ARGS=(up --detach)
if [[ " $* " != *" --no-build "* ]]; then
  COMPOSE_ARGS+=(--build)
fi

docker compose -f "$COMPOSE_FILE" "${COMPOSE_ARGS[@]}" "$@"
docker compose -f "$COMPOSE_FILE" ps

cat <<'EOF'

Ready to test:
  PWA:        http://localhost:5173
  API health: http://localhost:3000/health
  PostgreSQL: localhost:5433

To stop the stack: docker compose -f infra/compose/docker-compose.yml down
EOF
