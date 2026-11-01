"""Environment-based configuration. Never hard-code the Telegram token."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    bot_token: str
    admin_ids: tuple[int, ...]
    database_path: Path
    portfolio_url: str
    manager_username: str
    timezone: str
    studio_name: str = "ODILOV STUDIO"


def load_settings() -> Settings:
    load_dotenv()
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token or ":" not in token:
        raise ValueError("BOT_TOKEN .env faylida to‘g‘ri ko‘rsatilishi kerak")
    raw_ids = os.getenv("ADMIN_IDS", "").strip()
    try:
        admin_ids = tuple(sorted(set(int(x.strip()) for x in raw_ids.split(",") if x.strip())))
    except ValueError as exc:
        raise ValueError("ADMIN_IDS: vergul bilan ajratilgan Telegram raqamli IDlar") from exc
    if not admin_ids or any(id_ <= 0 for id_ in admin_ids):
        raise ValueError("ADMIN_IDS: kamida bitta haqiqiy ID kerak")

    portfolio_url = os.getenv("PORTFOLIO_URL", "").strip()
    if portfolio_url:
        parsed = urlparse(portfolio_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("PORTFOLIO_URL https:// bilan boshlanishi kerak")

    manager = os.getenv("MANAGER_USERNAME", "").strip().lstrip("@")
    if manager and (not manager.replace("_", "").isalnum() or len(manager) > 32):
        raise ValueError("MANAGER_USERNAME: faqat Telegram username kiriting")

    return Settings(
        bot_token=token,
        admin_ids=admin_ids,
        database_path=Path(os.getenv("DATABASE_PATH", "./data/odilov.db")).expanduser(),
        portfolio_url=portfolio_url,
        manager_username=manager,
        timezone=os.getenv("TIMEZONE", "Asia/Tashkent").strip(),
    )
