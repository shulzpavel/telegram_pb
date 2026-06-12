#!/usr/bin/env bash
# Full-stack production deploy: rebuilds backend services AND web.
#
# Use this for any change touching backend/ — deploy-web-prod.sh only
# rebuilds the web container and will silently leave voting-service /
# jira-service on the old image.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
DEPLOY_NOTIFY_ENV_FILE="${DEPLOY_NOTIFY_ENV_FILE:-.deploy.env}"
DEPLOY_APP_NAME="${DEPLOY_APP_NAME:-Planning Poker}"
DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-production}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-planning.shults-sync.com}"

# Services rebuilt by this script (order matters: backend first, web last).
SERVICES=(voting-service jira-service web)

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

html_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  printf '%s' "$value"
}

notify_telegram() {
  local status="$1"
  local details="$2"

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    return 0
  fi

  local icon title
  case "$status" in
    STARTED)
      icon="🚀"
      title="Деплой запущен"
      ;;
    OK)
      icon="✅"
      title="Деплой завершён"
      ;;
    FAILED)
      icon="❌"
      title="Деплой упал"
      ;;
    *)
      icon="ℹ️"
      title="Статус деплоя"
      ;;
  esac

  local app env domain host sha safe_details
  app="$(html_escape "$DEPLOY_APP_NAME")"
  env="$(html_escape "$DEPLOY_ENVIRONMENT")"
  domain="$(html_escape "$DEPLOY_DOMAIN")"
  host="$(html_escape "$(hostname)")"
  sha="$(html_escape "$CURRENT_SHA")"
  safe_details="$(html_escape "$details")"

  local text
  text="$(printf '%s <b>%s</b>\n\n<b>Проект:</b> %s\n<b>Окружение:</b> <code>%s</code>\n<b>Домен:</b> <a href="https://%s">%s</a>\n<b>Сервер:</b> <code>%s</code>\n<b>Коммит:</b> <code>%s</code>\n\n%s' \
    "$icon" \
    "$title" \
    "$app" \
    "$env" \
    "$domain" \
    "$domain" \
    "$host" \
    "$sha" \
    "$safe_details")"

  curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_web_page_preview=true" \
    --data-urlencode "text=${text}" \
    >/dev/null || true
}

notify_failure() {
  local exit_code=$?
  notify_telegram "FAILED" "Exit code: ${exit_code}"
  exit "$exit_code"
}

trap notify_failure ERR

notify_telegram "STARTED" "Полный деплой: ${SERVICES[*]}."

echo "Pulling latest main..."
git pull --ff-only origin main
CURRENT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "Building images: ${SERVICES[*]}..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "${SERVICES[@]}"

echo "Restarting containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d "${SERVICES[@]}"

echo "Waiting for voting-service health..."
for attempt in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' voting-service 2>/dev/null || echo unknown)"
  if [[ "$status" == "healthy" ]]; then
    echo "voting-service is healthy."
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "voting-service did not become healthy in time (status: $status)" >&2
    exit 1
  fi
  sleep 5
done

echo "Current service status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps "${SERVICES[@]}"

notify_telegram "OK" "Образы собраны (${SERVICES[*]}), контейнеры перезапущены, health-check пройден."

echo "Done."
