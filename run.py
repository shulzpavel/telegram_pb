#!/usr/bin/env python3
"""Entry point for running the bot."""

import asyncio
import argparse
import logging
import os

from app.main import main


def setup_logging() -> None:
    """Configure basic logging for stdout and aiogram."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("aiogram").setLevel(getattr(logging, log_level, logging.INFO))


if __name__ == "__main__":
    setup_logging()

    parser = argparse.ArgumentParser(description="Planning Poker bot")
    parser.add_argument(
        "--no-poll",
        action="store_true",
        help="Не запускать polling (полезно при дублирующем инстансе под supervisord/systemd)",
    )
    args = parser.parse_args()
    asyncio.run(main(use_polling=not args.no_poll))
