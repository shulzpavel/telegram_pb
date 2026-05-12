"""Shared batch results display utility used by both callbacks and commands handlers."""

import asyncio
from pathlib import Path

from aiogram import types
from aiogram.types import FSInputFile

from app.constants import MAX_MESSAGE_LENGTH
from app.domain.session import Session
from app.keyboards import get_results_keyboard
from app.providers import DIContainer
from app.usecases.show_results import VotingPolicy

_policy = VotingPolicy()


async def show_batch_results(msg: types.Message, session: Session, container: DIContainer) -> None:
    """Send batch results as text message(s) + detailed file."""
    if not session.last_batch:
        return

    message_parts = ["📊 Результаты голосования:\n"]
    total_sp = 0

    for index, task in enumerate(session.last_batch, start=1):
        task_header = f"{index}. {task.text}"
        if task.jira_key:
            task_header += f" ({task.jira_key})"
        message_parts.append(task_header)

        if task.votes:
            vote_lines = []
            for user_id, vote in task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.name if participant else f"User {user_id}"
                if vote == "skip":
                    vote_lines.append(f"   {name}: ⏭️ Пропущено")
                else:
                    vote_lines.append(f"   {name}: {vote}")
            if vote_lines:
                message_parts.append("   Проголосовало:")
                message_parts.extend(vote_lines)

        sp = _policy.get_max_vote(task.votes)
        total_sp += sp
        message_parts.append(f"   Итог SP: {sp}\n")

    message_parts.append(f"\n📈 Сумма SP за батч: {total_sp}")
    message_text = "\n".join(message_parts)

    if len(message_text) > MAX_MESSAGE_LENGTH:
        lines = message_text.split("\n")
        current_message: list[str] = []
        current_length = 0
        header = message_parts[0]

        for line in lines:
            line_length = len(line) + 1
            if current_length + line_length > MAX_MESSAGE_LENGTH and current_message:
                await container.notifier.send_message(
                    chat_id=session.chat_id,
                    text="\n".join(current_message),
                    reply_markup=None,
                    message_thread_id=session.topic_id,
                )
                current_message = [header]
                current_length = len(header)
            current_message.append(line)
            current_length += line_length

        if current_message:
            await container.notifier.send_message(
                chat_id=session.chat_id,
                text="\n".join(current_message),
                reply_markup=get_results_keyboard(),
                message_thread_id=session.topic_id,
            )
    else:
        await container.notifier.send_message(
            chat_id=session.chat_id,
            text=message_text,
            reply_markup=get_results_keyboard(),
            message_thread_id=session.topic_id,
        )

    output_path = Path("data/batch_results.txt")

    def _write() -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as fh:
            for index, task in enumerate(session.last_batch, start=1):
                fh.write(f"{index}. {task.text}\n")
                if task.jira_key:
                    fh.write(f"   Jira: {task.jira_key}\n")
                for user_id, vote in task.votes.items():
                    participant = session.participants.get(user_id)
                    name = participant.name if participant else f"User {user_id}"
                    if vote == "skip":
                        fh.write(f"   - {name}: ⏭️ Пропущено\n")
                    else:
                        fh.write(f"   - {name}: {vote}\n")
                sp = _policy.get_max_vote(task.votes)
                fh.write(f"   Итог SP: {sp}\n\n")
            fh.write(f"Всего задач: {len(session.last_batch)}\n")
            fh.write(f"Суммарные SP: {total_sp}\n")

    await asyncio.to_thread(_write)

    file = FSInputFile(str(output_path))
    caption = f"📄 Детальные результаты батча: {len(session.last_batch)} задач, суммарно SP: {total_sp}"
    try:
        await container.notifier.send_document(
            chat_id=session.chat_id,
            document=file,
            caption=caption,
            reply_markup=None,
            message_thread_id=session.topic_id,
        )
    finally:
        await asyncio.to_thread(output_path.unlink, True)
