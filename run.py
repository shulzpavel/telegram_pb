#!/usr/bin/env python3
"""Entry point for Telegram Gateway (microservices mode only)."""

import asyncio
import argparse
import logging
import os
import sys

import aiohttp

from app.main import main
from config import JIRA_SERVICE_URL, VOTING_SERVICE_URL


def setup_logging() -> None:
    """Configure basic logging for stdout and aiogram."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("aiogram").setLevel(getattr(logging, log_level, logging.INFO))


async def check_services() -> bool:
    """Check if microservices are available."""
    services = {
        "Jira Service": JIRA_SERVICE_URL,
        "Voting Service": VOTING_SERVICE_URL,
    }
    
    async with aiohttp.ClientSession() as session:
        for name, url in services.items():
            try:
                # Try both /health/ and /health (without trailing slash)
                for health_path in ["/health/", "/health"]:
                    try:
                        health_url = f"{url}{health_path}"
                        async with session.get(health_url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                            if resp.status in (200, 204):
                                print(f"✅ {name} is available at {url}")
                                break
                    except Exception:
                        continue
                else:
                    # If both paths failed
                    print(f"⚠️  {name} health check failed at {url}")
                    return False
            except Exception as e:
                print(f"❌ {name} is not available at {url}: {e}")
                print(f"   Make sure {name} is running before starting the gateway")
                return False
    
    return True


if __name__ == "__main__":
    setup_logging()

    # Check microservices availability
    if not asyncio.run(check_services()):
        print("\n❌ Microservices are not available. Please start them first:")
        print("   docker-compose up -d")
        print("   or")
        print("   python -m services.jira_service.main &")
        print("   python -m services.voting_service.main &")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Telegram Gateway (microservices mode)")
    parser.add_argument(
        "--no-poll",
        action="store_true",
        help="Не запускать polling (полезно при дублирующем инстансе под supervisord/systemd)",
    )
    args = parser.parse_args()
    asyncio.run(main(use_polling=not args.no_poll))
