"""LarkNotifier — implements the Notifier port using the Lark Open Platform API.

Lark API mapping:
  send_message   → POST /im/v1/messages          (create)
  edit_message   → PATCH /im/v1/messages/{id}    (update)
  delete_message → DELETE /im/v1/messages/{id}   (delete)
  send_document  → POST /im/v1/files (upload) + create message with file_key
  answer_callback → reply to card action via card action response

Messages sent as "interactive" type (card) when reply_markup is a dict (card payload),
otherwise as "text".
"""

import json
import logging
from typing import Any, Optional

import lark_oapi as lark
from lark_oapi.api.im.v1 import (
    CreateMessageRequest,
    CreateMessageRequestBody,
    DeleteMessageRequest,
    UpdateMessageRequest,
    UpdateMessageRequestBody,
    UploadFileRequest,
    UploadFileRequestBody,
)

from app.ports.notifier import Notifier

logger = logging.getLogger(__name__)


class _SentMessage:
    """Minimal stand-in for aiogram Message to keep handlers compatible."""

    def __init__(self, message_id: str) -> None:
        self.message_id = message_id


class LarkNotifier(Notifier):
    """Notifier implementation backed by the Lark Open Platform SDK."""

    def __init__(self, client: lark.Client) -> None:
        self._client = client

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_content(self, text: str, reply_markup: Optional[Any]) -> tuple[str, str]:
        """Return (msg_type, content_json).

        If reply_markup is a dict (card payload), send as interactive card.
        Otherwise send as plain text.
        """
        if isinstance(reply_markup, dict):
            # Merge card body with optional leading text
            card = dict(reply_markup)
            if text and "elements" in card:
                from app.transport.lark.keyboards.cards import _text
                card["elements"] = [_text(text)] + card["elements"]
            return "interactive", json.dumps(card)
        return "text", json.dumps({"text": text})

    # ------------------------------------------------------------------
    # Notifier interface
    # ------------------------------------------------------------------

    async def send_message(
        self,
        chat_id: int,
        text: str,
        reply_markup: Optional[Any] = None,
        parse_mode: Optional[str] = None,
        disable_web_page_preview: bool = False,
        message_thread_id: Optional[int] = None,
    ) -> Optional[_SentMessage]:
        msg_type, content = self._build_content(text, reply_markup)
        req = (
            CreateMessageRequest.builder()
            .receive_id_type("chat_id")
            .request_body(
                CreateMessageRequestBody.builder()
                .receive_id(str(chat_id))
                .msg_type(msg_type)
                .content(content)
                .build()
            )
            .build()
        )
        resp = await self._client.im.v1.message.acreate(req)
        if not resp.success():
            logger.error("Lark send_message failed: %s %s", resp.code, resp.msg)
            return None
        return _SentMessage(resp.data.message_id)

    async def edit_message(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        reply_markup: Optional[Any] = None,
        disable_web_page_preview: bool = False,
    ) -> Optional[_SentMessage]:
        msg_type, content = self._build_content(text, reply_markup)
        req = (
            UpdateMessageRequest.builder()
            .message_id(str(message_id))
            .request_body(
                UpdateMessageRequestBody.builder()
                .msg_type(msg_type)
                .content(content)
                .build()
            )
            .build()
        )
        resp = await self._client.im.v1.message.aupdate(req)
        if not resp.success():
            logger.error("Lark edit_message failed: %s %s", resp.code, resp.msg)
            return None
        return _SentMessage(str(message_id))

    async def delete_message(self, chat_id: int, message_id: int) -> bool:
        req = DeleteMessageRequest.builder().message_id(str(message_id)).build()
        resp = await self._client.im.v1.message.adelete(req)
        if not resp.success():
            logger.warning("Lark delete_message failed: %s %s", resp.code, resp.msg)
            return False
        return True

    async def send_document(
        self,
        chat_id: int,
        document: Any,
        caption: Optional[str] = None,
        reply_markup: Optional[Any] = None,
        message_thread_id: Optional[int] = None,
    ) -> Optional[_SentMessage]:
        # Step 1: upload the file
        file_path: str = document if isinstance(document, str) else str(document)
        with open(file_path, "rb") as f:
            upload_req = (
                UploadFileRequest.builder()
                .request_body(
                    UploadFileRequestBody.builder()
                    .file_type("stream")
                    .file_name(file_path.split("/")[-1])
                    .file(f)
                    .build()
                )
                .build()
            )
            upload_resp = await self._client.im.v1.file.aupload(upload_req)
        if not upload_resp.success():
            logger.error("Lark file upload failed: %s %s", upload_resp.code, upload_resp.msg)
            return None
        file_key = upload_resp.data.file_key

        # Step 2: send message with file_key
        content = json.dumps({"file_key": file_key})
        if caption:
            # Lark doesn't natively support captions for files — prepend as separate text message
            await self.send_message(chat_id=chat_id, text=caption)

        req = (
            CreateMessageRequest.builder()
            .receive_id_type("chat_id")
            .request_body(
                CreateMessageRequestBody.builder()
                .receive_id(str(chat_id))
                .msg_type("file")
                .content(content)
                .build()
            )
            .build()
        )
        resp = await self._client.im.v1.message.acreate(req)
        if not resp.success():
            logger.error("Lark send_document failed: %s %s", resp.code, resp.msg)
            return None
        return _SentMessage(resp.data.message_id)

    async def answer_callback(
        self,
        callback_query_id: str,
        text: Optional[str] = None,
        show_alert: bool = False,
    ) -> bool:
        # Lark card actions are acknowledged by returning HTTP 200 from the webhook handler.
        # Toast notifications require the card action response payload — handled in the router.
        # This method is a no-op here; the router sends the response directly.
        return True
