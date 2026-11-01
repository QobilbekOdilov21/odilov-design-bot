"""Telegram inline keyboard components."""
from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.catalog import ALLOWED_TRANSITIONS, SERVICES, STATUS_LABELS


def kb(rows: list[list[tuple[str, str]]]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=callback) for label, callback in row]
        for row in rows
    ])


def menu(is_admin: bool = False, has_draft: bool = False) -> InlineKeyboardMarkup:
    rows = []
    if has_draft:
        rows.append([("▶️ Buyurtmani davom ettirish", "nav:resume")])
    rows += [
        [("🎨 Buyurtma berish", "nav:new"), ("📂 Portfolio", "nav:portfolio")],
        [("💰 Narxlar", "nav:prices"), ("📋 Buyurtmalarim", "nav:myorders")],
        [("📞 Bog‘lanish", "nav:contact"), ("ℹ️ Yordam", "nav:help")],
    ]
    if is_admin:
        rows.append([("🛡 Admin panel", "adm:home")])
    return kb(rows)


def services() -> InlineKeyboardMarkup:
    codes = list(SERVICES.items())
    rows = [[(label, f"svc:{code}")] for code, label in codes]
    rows.append([("❌ Bekor qilish", "nav:cancel")])
    return kb(rows)


def skip(step: str, *, files: bool = False) -> InlineKeyboardMarkup:
    return kb([
        [(("✅ Tayyor, davom etish" if files else "⏭ O‘tkazib yuborish"), f"skip:{step}")],
        [("❌ Bekor qilish", "nav:cancel")],
    ])


def cancel() -> InlineKeyboardMarkup:
    return kb([[("❌ Bekor qilish", "nav:cancel")]])


def review() -> InlineKeyboardMarkup:
    return kb([
        [("✅ Buyurtmani tasdiqlash", "nav:confirm")],
        [("🔄 Qaytadan to‘ldirish", "nav:new"), ("❌ Bekor qilish", "nav:cancel")],
    ])


def my_orders(order_ids: list[tuple[int, str]]) -> InlineKeyboardMarkup:
    rows = [[(f"#{ident:05d} · {title[:25]}", f"usr:order:{ident}")] for ident, title in order_ids]
    rows.append([("🏠 Asosiy menyu", "nav:home")])
    return kb(rows)


def admin_home() -> InlineKeyboardMarkup:
    return kb([
        [("🆕 Yangi", "adm:list:new"), ("🛠 Jarayonda", "adm:list:in_progress")],
        [("✅ Qabul qilingan", "adm:list:accepted"), ("📋 Barchasi", "adm:list:all")],
        [("🏠 Menyu", "nav:home")],
    ])


def admin_orders(
    orders: list[tuple[int, str]], *, status: str = "all", page: int = 0, has_next: bool = False
) -> InlineKeyboardMarkup:
    rows = [[(f"#{ident:05d} · {label[:35]}", f"adm:detail:{ident}")] for ident, label in orders]
    nav = []
    if page > 0:
        nav.append(("⬅️ Oldingi", f"adm:list:{status}:{page - 1}"))
    if has_next:
        nav.append(("Keyingi ➡️", f"adm:list:{status}:{page + 1}"))
    if nav:
        rows.append(nav)
    rows.append([("⬅️ Admin panel", "adm:home")])
    return kb(rows)


def admin_order(order_id: int, status: str, has_files: bool) -> InlineKeyboardMarkup:
    rows = []
    for target in ALLOWED_TRANSITIONS.get(status, ()):
        rows.append([(STATUS_LABELS[target], f"adm:status:{order_id}:{target}")])
    if has_files:
        rows.append([("📎 Referenslarni ko‘rish", f"adm:files:{order_id}")])
    rows.append([("🔄 Yangilash", f"adm:detail:{order_id}"), ("⬅️ Ro‘yxat", "adm:list:all")])
    return kb(rows)


def delete_confirm() -> InlineKeyboardMarkup:
    return kb([
        [("🗑 Ha, barcha ma'lumotlarim o‘chirilsin", "privacy:confirm")],
        [("⬅️ Bekor qilish", "privacy:abort")],
    ])
