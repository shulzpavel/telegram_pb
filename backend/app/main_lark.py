"""Lark bot entry point — FastAPI webhook server.

Lark delivers events via HTTP POST to a configured webhook URL.
The bot subscribes to:
  - im.message.receive_v1   (messages in chats)
  - card.action.trigger     (interactive card button clicks)

Environment variables required:
  LARK_APP_ID, LARK_APP_SECRET, LARK_VERIFICATION_TOKEN, LARK_ENCRYPT_KEY
  JIRA_SERVICE_URL, VOTING_SERVICE_URL
"""

import json
import logging

import lark_oapi as lark
import uvicorn
from fastapi import FastAPI, Request, Response

from app.providers import DIContainer
from app.transport.lark.notifier import LarkNotifier
from app.transport.lark.router import handle_event
from config import (
    JIRA_SERVICE_URL,
    LARK_APP_ID,
    LARK_APP_SECRET,
    LARK_ENCRYPT_KEY,
    LARK_VERIFICATION_TOKEN,
    LARK_WEBHOOK_PORT,
    VOTING_SERVICE_URL,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Planning Poker — Lark Bot")

# Initialise Lark SDK client (async-capable)
_lark_client = (
    lark.Client.builder()
    .app_id(LARK_APP_ID)
    .app_secret(LARK_APP_SECRET)
    .log_level(lark.LogLevel.WARNING)
    .build()
)

# Event handler for SDK-based verification & decryption
_event_handler = (
    lark.EventDispatcherHandler.builder(LARK_ENCRYPT_KEY, LARK_VERIFICATION_TOKEN)
    .build()
)

# Build DI container (no aiogram Bot — Lark notifier injected instead)
_notifier = LarkNotifier(_lark_client)
_container: DIContainer = DIContainer(
    bot=None,  # type: ignore[arg-type]
    notifier=_notifier,
)


@app.post("/lark/event")
async def lark_webhook(request: Request) -> Response:
    """Main Lark webhook endpoint — receives all events."""
    body = await request.body()
    headers = dict(request.headers)

    # Use Lark SDK to verify signature and decrypt payload
    raw_event = _event_handler.do(lark.RawRequest(body=body.decode(), headers=headers))

    # URL verification challenge (Lark sends this when you first configure the webhook)
    if raw_event.event_type == "url_verification":
        payload = json.loads(body)
        return Response(
            content=json.dumps({"challenge": payload.get("challenge", "")}),
            media_type="application/json",
        )

    try:
        event_body = json.loads(raw_event.body) if isinstance(raw_event.body, str) else raw_event.body
        event_data = event_body.get("event", {})
        await handle_event(raw_event.event_type, event_data, _container)
    except Exception as e:
        logger.error("Error handling Lark event %s: %s", raw_event.event_type, e, exc_info=True)

    # Lark expects HTTP 200 within 3 seconds; always return OK
    return Response(content="{}", media_type="application/json", status_code=200)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "transport": "lark"}


if __name__ == "__main__":
    if not LARK_APP_ID or not LARK_APP_SECRET:
        raise SystemExit("LARK_APP_ID and LARK_APP_SECRET must be set")
    logger.info("Starting Lark bot webhook on port %d", LARK_WEBHOOK_PORT)
    uvicorn.run(app, host="0.0.0.0", port=LARK_WEBHOOK_PORT)
