#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
DEPLOY_NOTIFY_ENV_FILE="${DEPLOY_NOTIFY_ENV_FILE:-.deploy.env}"

cd "$ROOT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE in $ROOT_DIR"
  exit 1
fi

if [[ -f "$DEPLOY_NOTIFY_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_NOTIFY_ENV_FILE"
  set +a
fi

CURRENT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

notify_telegram() {
  local status="$1"
  local details="$2"

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    return 0
  fi

  local text
  text="$(printf 'Planning Poker deploy: %s\nServer: %s\nCommit: %s\n%s' \
    "$status" \
    "$(hostname)" \
    "$CURRENT_SHA" \
    "$details")"

  curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    >/dev/null || true
}

notify_failure() {
  local exit_code=$?
  notify_telegram "FAILED" "Exit code: ${exit_code}"
  exit "$exit_code"
}

trap notify_failure ERR

notify_telegram "STARTED" "Web image build and restart started."

echo "Pulling latest main..."
git pull --ff-only origin main
CURRENT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "Building web image..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build web

echo "Restarting web container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d web

echo "Current service status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps web

notify_telegram "OK" "Web container has been rebuilt and restarted."

echo "Done."
