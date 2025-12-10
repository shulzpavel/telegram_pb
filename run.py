#!/usr/bin/env python3
"""Entry point for running the bot."""

from app.main import main
import asyncio
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Planning Poker bot")
    parser.add_argument(
        "--no-poll",
        action="store_true",
        help="Не запускать polling (полезно при дублирующем инстансе под supervisord/systemd)",
    )
    args = parser.parse_args()
    asyncio.run(main(use_polling=not args.no_poll))

