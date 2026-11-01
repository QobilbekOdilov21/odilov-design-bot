"""Pure presentation and input validation helpers."""
from __future__ import annotations

from datetime import date, datetime
from html import escape
from zoneinfo import ZoneInfo

from app.catalog import SERVICES, STATUS_LABELS


def clean_text(text: str | None, max_len: int, min_len: int = 1) -> str | None:
    value = " ".join((text or "").strip().split())
    if not (min_len <= len(value) <= max_len):
        return None
    return value


def parse_deadline(raw: str, timezone: str = "Asia/Tashkent", today: date | None = None) -> str | None:
    value = (raw or "").strip()
    try:
        result = date.fromisoformat(value)
    except ValueError:
        return None
    if result.isoformat() != value:  # YYYY-MM-DD only
        return None
    today = today or datetime.now(ZoneInfo(timezone)).date()
    if result < today:
        return None
    return result.isoformat()


def parse_budget(raw: str) -> int | None:
    value = (raw or "").replace(" ", "").replace("_", "")
    if not value.isascii() or not value.isdecimal():
        return None
    amount = int(value)
    if not 10_000 <= amount <= 10_000_000_000:
        return None
    return amount


def money(amount: int | None) -> str:
    return f"{amount:,} so‘m".replace(",", " ") if amount is not None else "Kelishiladi"


def label_service(code: str) -> str:
    return SERVICES.get(code, "Boshqa xizmat")


def label_status(code: str) -> str:
    return STATUS_LABELS.get(code, code)


def describe_order(order: object, *, admin: bool = False) -> str:
    """Requires Order-like object, with separately escaped user fields."""
    out = [
        f"<b>📋 Buyurtma #{order.id:05d}</b>",
        f"<b>Status:</b> {label_status(order.status)}",
        f"<b>Xizmat:</b> {escape(label_service(order.service))}",
        f"<b>Loyiha:</b> {escape(order.title)}",
        f"<b>Brief:</b> {escape(order.brief)}",
        f"<b>Referenslar:</b> {len(order.assets)} ta",
        f"<b>Muddat:</b> {escape(order.deadline or 'Kelishiladi')}",
        f"<b>Budjet:</b> {money(order.budget)}",
    ]
    if admin:
        name = escape(order.customer_name or "Mijoz")
        out.extend([
            f"<b>Mijoz:</b> <a href=\"tg://user?id={order.customer_id}\">{name}</a>",
            f"<b>Telegram ID:</b> <code>{order.customer_id}</code>",
            f"<b>Aloqa:</b> {escape(order.contact or 'Telegram orqali')}",
            f"<b>Yaratilgan:</b> {escape(order.created_at[:16].replace('T', ' '))} UTC",
        ])
    return "\n".join(out)


def describe_draft(data: dict) -> str:
    return "\n".join([
        "<b>🧾 Buyurtmangizni tekshiring</b>",
        f"<b>Xizmat:</b> {escape(label_service(str(data.get('service', ''))))}",
        f"<b>Loyiha:</b> {escape(str(data.get('title', '')))}",
        f"<b>Brief:</b> {escape(str(data.get('brief', '')))}",
        f"<b>Referens:</b> {len(data.get('assets', []))} ta",
        f"<b>Muddat:</b> {escape(str(data.get('deadline') or 'Kelishiladi'))}",
        f"<b>Budjet:</b> {money(data.get('budget'))}",
        f"<b>Aloqa:</b> {escape(str(data.get('contact') or 'Telegram orqali'))}",
        "\nTasdiqlasangiz, buyurtma adminga yuboriladi.",
    ])
