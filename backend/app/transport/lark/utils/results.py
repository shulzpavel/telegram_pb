"""Batch results display for Lark transport."""

import asyncio
from pathlib import Path

from app.constants import MAX_MESSAGE_LENGTH
from app.domain.session import Session
from app.providers import DIContainer
from app.transport.lark.keyboards.cards import get_results_card
from app.usecases.show_results import VotingPolicy

_policy = VotingPolicy()


async def show_batch_results_lark(chat_id: int, session: Session, container: DIContainer) -> None:
    """Send batch results as Lark interactive card + detailed file."""
    if not session.last_batch:
        return

    lines = []
    total_sp = 0

    for index, task in enumerate(session.last_batch, start=1):
        header = f"**{index}. {task.text}**"
        if task.jira_key:
            header += f" ({task.jira_key})"
        lines.append(header)

        if task.votes:
            for user_id, vote in task.votes.items():
                participant = session.participants.get(user_id)
                name = participant.name if participant else f"User {user_id}"
                if vote == "skip":
                    lines.append(f"  - {name}: ⏭️ Пропущено")
                else:
                    lines.append(f"  - {name}: {vote}")

        sp = _policy.get_max_vote(task.votes)
        total_sp += sp
        lines.append(f"  **Итог SP:** {sp}\n")

    lines.append(f"\n📈 **Сумма SP за батч:** {total_sp}")
    summary_text = "\n".join(lines)

    # Lark cards support markdown; split if too long
    if len(summary_text) > MAX_MESSAGE_LENGTH:
        # Send plain chunks then a final results card
        chunks = _split_text(summary_text)
        for chunk in chunks[:-1]:
            await container.notifier.send_message(chat_id=chat_id, text=chunk)
        await container.notifier.send_message(
            chat_id=chat_id,
            text=chunks[-1],
            reply_markup=get_results_card(""),
        )
    else:
        await container.notifier.send_message(
            chat_id=chat_id,
            text="",
            reply_markup=get_results_card(summary_text),
        )

    # Detailed file
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
                    fh.write(f"   - {name}: {'Пропущено' if vote == 'skip' else vote}\n")
                sp = _policy.get_max_vote(task.votes)
                fh.write(f"   Итог SP: {sp}\n\n")
            fh.write(f"Всего задач: {len(session.last_batch)}\n")
            fh.write(f"Суммарные SP: {total_sp}\n")

    await asyncio.to_thread(_write)

    caption = f"📄 Детальные результаты батча: {len(session.last_batch)} задач, SP: {total_sp}"
    try:
        await container.notifier.send_document(
            chat_id=chat_id,
            document=str(output_path),
            caption=caption,
        )
    finally:
        await asyncio.to_thread(output_path.unlink, True)


def _split_text(text: str, limit: int = MAX_MESSAGE_LENGTH) -> list[str]:
    lines = text.split("\n")
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for line in lines:
        ll = len(line) + 1
        if length + ll > limit and current:
            chunks.append("\n".join(current))
            current = []
            length = 0
        current.append(line)
        length += ll
    if current:
        chunks.append("\n".join(current))
    return chunks
