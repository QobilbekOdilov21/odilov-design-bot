"""Run with: python -m app.main"""
from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import BotCommand

from app.config import load_settings
from app.handlers import admin_router, user_router
from app.storage import Repository


async def main() -> None:
    settings = load_settings()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    repo = Repository(settings.database_path)
    repo.initialize()

    bot = Bot(settings.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(admin_router)
    dp.include_router(user_router)
    dp["repo"] = repo
    dp["settings"] = settings

    try:
        await bot.set_my_commands([
            BotCommand(command="start", description="🏠 Asosiy menyu"),
            BotCommand(command="order", description="🎨 Buyurtma berish"),
            BotCommand(command="myorders", description="📋 Buyurtmalarim"),
            BotCommand(command="portfolio", description="📂 Portfolio"),
            BotCommand(command="prices", description="💰 Narxlar"),
            BotCommand(command="contact", description="📞 Bog‘lanish"),
            BotCommand(command="cancel", description="❌ Anketani bekor qilish"),
            BotCommand(command="help", description="ℹ️ Yordam"),
            BotCommand(command="privacy", description="🔒 Maxfiylik"),
            BotCommand(command="delete_my_data", description="🗑 Ma'lumotlarni o‘chirish"),
        ])
        me = await bot.get_me()
        logging.info("ODILOV STUDIO bot @%s started", me.username)
        # Exactly one polling replica. SQLite DB and update order depend on this.
        await dp.start_polling(bot, handle_as_tasks=False, allowed_updates=dp.resolve_used_update_types())
    finally:
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
