"""Lark event router — receives webhook events and dispatches to handlers.

Event types handled:
  im.message.receive_v1     → text messages → command dispatch
  card.action.trigger       → button presses → action dispatch
"""

import json
import logging
from typing import Any, Dict

from app.providers import DIContainer
from app.transport.lark.handlers.callbacks import dispatch_action
from app.transport.lark.handlers.commands import dispatch_command

logger = logging.getLogger(__name__)


async def handle_event(event_type: str, event: Dict[str, Any], container: DIContainer) -> None:
    """Entry point called by the webhook handler for every verified Lark event."""

    if event_type == "im.message.receive_v1":
        await _handle_message(event, container)

    elif event_type == "card.action.trigger":
        await _handle_card_action(event, container)

    else:
        logger.debug("Unhandled Lark event type: %s", event_type)


async def _handle_message(event: Dict[str, Any], container: DIContainer) -> None:
    """Dispatch IM message events (commands, JQL input)."""
    msg = event.get("message", {})
    msg_type = msg.get("message_type", "")
    if msg_type != "text":
        return

    try:
        content = json.loads(msg.get("content", "{}"))
        text: str = content.get("text", "").strip()
    except (json.JSONDecodeError, AttributeError):
        return

    sender = event.get("sender", {})
    user_id_str = sender.get("sender_id", {}).get("open_id", "")
    user_name = sender.get("sender_id", {}).get("open_id", "unknown")  # Lark open_id as fallback

    chat_id_str = msg.get("chat_id", "")
    # Use chat_id string hash as integer key for internal session keying
    chat_id = _stable_int(chat_id_str)
    user_id = _stable_int(user_id_str)

    if text.startswith("/"):
        handled = await dispatch_command(
            chat_id=chat_id,
            user_id=user_id,
            user_name=user_name,
            text=text,
            container=container,
        )
        if handled:
            return

    # Non-command text → treat as JQL input for task loading
    from app.transport.lark.handlers.text import handle_jql_input
    await handle_jql_input(chat_id=chat_id, user_id=user_id, text=text, container=container)


async def _handle_card_action(event: Dict[str, Any], container: DIContainer) -> None:
    """Dispatch Interactive Card button press events."""
    action = event.get("action", {})
    action_value: str = action.get("value", "")

    operator = event.get("operator", {})
    user_id_str = operator.get("open_id", "")
    user_name = operator.get("open_id", "unknown")

    context = event.get("context", {})
    chat_id_str = context.get("open_chat_id", "")
    message_id = context.get("open_message_id")

    chat_id = _stable_int(chat_id_str)
    user_id = _stable_int(user_id_str)

    await dispatch_action(
        chat_id=chat_id,
        user_id=user_id,
        user_name=user_name,
        action_value=action_value,
        message_id=message_id,
        container=container,
    )


def _stable_int(s: str) -> int:
    """Convert a Lark string ID to a stable integer for use as dict key.
    Uses Python's hash — consistent within a single process run.
    In production, store a mapping in Redis instead.
    """
    return abs(hash(s)) % (10**15)
