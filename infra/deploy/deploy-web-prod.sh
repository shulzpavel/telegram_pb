#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

cd "$ROOT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE in $ROOT_DIR"
  exit 1
fi

echo "Pulling latest main..."
git pull --ff-only origin main

echo "Building web image..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build web

echo "Restarting web container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d web

echo "Current service status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps web

echo "Done."
