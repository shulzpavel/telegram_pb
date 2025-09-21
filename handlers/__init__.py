"""
Handlers package for Telegram Poker Bot
"""
from .base_handlers import router as base_router
from .session_handlers import router as session_router
from .voting_handlers import router as voting_router
from .admin_handlers import router as admin_router
from .menu_handlers import router as menu_router
from .role_handlers import router as role_router

# Combine all routers
from aiogram import Router
import logging

logger = logging.getLogger(__name__)

main_router = Router()
main_router.include_router(base_router)
main_router.include_router(session_router)
main_router.include_router(voting_router)
main_router.include_router(admin_router)
main_router.include_router(menu_router)
main_router.include_router(role_router)

logger.info("HANDLERS: All routers included successfully")
logger.info("HANDLERS: Role router included successfully")

__all__ = ['main_router']
