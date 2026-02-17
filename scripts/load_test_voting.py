#!/usr/bin/env python3
"""
Load test для голосования (voting-service).
Запуск на сервере: без обновления SP, только vote API.

Примеры:
  # 50 параллельных голосов, 5 итераций
  python scripts/load_test_voting.py --voters 50 --rounds 5

  # Через docker на хосте
  docker compose exec gateway python scripts/load_test_voting.py --voters 20 --rounds 10

  # С хоста к localhost
  VOTING_SERVICE_URL=http://localhost:8002 python scripts/load_test_voting.py --voters 30
"""

import argparse
import asyncio
import os
import time
from typing import List

import aiohttp

VOTING_URL = os.getenv("VOTING_SERVICE_URL", "http://voting-service:8002")
TEST_CHAT_ID = -999999999
TEST_TOPIC_ID = 99999
VOTE_VALUES = ["1", "2", "3", "5", "8"]


async def ensure_session(
    session: aiohttp.ClientSession,
    num_voters: int,
) -> bool:
    """Создать тестовую сессию с участниками и задачей."""
    participants = {
        str(1000 + i): {"name": f"Voter {i}", "role": "participant"}
        for i in range(num_voters)
    }
    task = {
        "jira_key": None,
        "summary": "Load test task",
        "url": None,
        "story_points": None,
        "votes": {},
        "completed_at": None,
    }
    payload = {
        "session": {
            "chat_id": TEST_CHAT_ID,
            "topic_id": TEST_TOPIC_ID,
            "participants": participants,
            "tasks_queue": [task],
            "current_task_index": 0,
            "history": [],
            "last_batch": [],
            "batch_completed": False,
            "active_vote_message_id": None,
            "current_batch_id": None,
            "current_batch_started_at": None,
        }
    }
    async with session.post(f"{VOTING_URL}/api/v1/session", json=payload) as resp:
        if resp.status not in (200, 201):
            print(f"Ошибка создания сессии: {resp.status} {await resp.text()}")
            return False
    return True


async def start_batch(session: aiohttp.ClientSession) -> bool:
    """Запустить батч голосования."""
    payload = {"chat_id": TEST_CHAT_ID, "topic_id": TEST_TOPIC_ID}
    async with session.post(f"{VOTING_URL}/api/v1/batch/start", json=payload) as resp:
        if resp.status != 200:
            print(f"Ошибка start batch: {resp.status} {await resp.text()}")
            return False
        data = await resp.json()
        if not data.get("success"):
            print(f"Ошибка start batch: {data}")
            return False
    return True


async def cast_vote(
    session: aiohttp.ClientSession,
    user_id: int,
    vote_value: str,
) -> tuple[bool, float]:
    """Отправить голос, вернуть (success, latency_sec)."""
    start = time.perf_counter()
    payload = {
        "chat_id": TEST_CHAT_ID,
        "topic_id": TEST_TOPIC_ID,
        "user_id": user_id,
        "vote_value": vote_value,
    }
    try:
        async with session.post(f"{VOTING_URL}/api/v1/vote", json=payload) as resp:
            data = await resp.json() if resp.status == 200 else {}
            elapsed = time.perf_counter() - start
            return (resp.status == 200 and data.get("success"), elapsed)
    except Exception as e:
        elapsed = time.perf_counter() - start
        print(f"Vote error (user={user_id}): {e}")
        return (False, elapsed)


async def run_round(
    session: aiohttp.ClientSession,
    voter_ids: List[int],
) -> tuple[int, int, float]:
    """Один раунд: параллельные голосования. Возвращает (ok, fail, total_time)."""
    import random
    tasks = [
        cast_vote(session, uid, random.choice(VOTE_VALUES))
        for uid in voter_ids
    ]
    start = time.perf_counter()
    results = await asyncio.gather(*tasks)
    total_time = time.perf_counter() - start
    ok = sum(1 for success, _ in results if success)
    fail = len(results) - ok
    return ok, fail, total_time


async def main() -> None:
    parser = argparse.ArgumentParser(description="Load test голосования")
    parser.add_argument("--voters", type=int, default=20, help="Число голосующих")
    parser.add_argument("--rounds", type=int, default=5, help="Число раундов")
    parser.add_argument("--url", type=str, default=VOTING_URL, help="URL voting-service")
    args = parser.parse_args()
    global VOTING_URL
    VOTING_URL = args.url.rstrip("/")

    voter_ids = [1000 + i for i in range(args.voters)]
    print(f"Load test: {args.voters} voters, {args.rounds} rounds → {VOTING_URL}")

    async with aiohttp.ClientSession() as session:
        if not await ensure_session(session, args.voters):
            return
        print("Сессия создана")

        if not await start_batch(session):
            return
        print("Батч запущен\n")

        total_ok = total_fail = 0
        latencies: List[float] = []

        for r in range(args.rounds):
            ok, fail, elapsed = await run_round(session, voter_ids)
            total_ok += ok
            total_fail += fail
            rps = args.voters / elapsed if elapsed > 0 else 0
            print(f"Round {r + 1}: ok={ok}, fail={fail}, {elapsed:.2f}s, ~{rps:.0f} votes/s")
            latencies.append(elapsed)

            if r < args.rounds - 1:
                if not await start_batch(session):
                    print("Ошибка перезапуска батча")
                    break

        print(f"\nИтого: ok={total_ok}, fail={total_fail}")
        if latencies:
            avg = sum(latencies) / len(latencies)
            print(f"Средняя длительность раунда: {avg:.2f}s")


if __name__ == "__main__":
    asyncio.run(main())
