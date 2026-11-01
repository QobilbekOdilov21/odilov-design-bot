"""Client wizard, ordering, admin workflow, privacy commands."""
from __future__ import annotations

import logging
from html import escape

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, Message

from app import keyboards as K
from app.catalog import SERVICES, STATUS_LABELS
from app.config import Settings
from app.formatting import (
    clean_text, describe_draft, describe_order, label_status, parse_budget, parse_deadline,
)
from app.storage import Draft, Repository

logger = logging.getLogger(__name__)
admin_router = Router(name="admin")
user_router = Router(name="user")

INTRO = (
    "<b>🔴 ODILOV STUDIO</b>\n"
    "<i>Creative Design • Portfolio • Orders</i>\n\n"
    "Assalomu alaykum! Professional grafik dizayn xizmatlariga xush kelibsiz.\n"
    "Quyidagi menyudan kerakli bo‘limni tanlang."
)
PRICES = (
    "<b>💰 Xizmatlar va narxlar</b>\n\n"
    "🎯 Logotip va brending\n"
    "📱 SMM dizayn / reklama\n"
    "🛍 Marketplace infografika\n"
    "💻 UI/UX va web dizayn\n"
    "🎮 Gaming va boshqa kreativ xizmatlar\n\n"
    "<b>Narx:</b> har bir loyiha uchun brief, hajm va muddat asosida kelishiladi.\n"
    "Aniq taklif olish uchun «Buyurtma berish»ni tanlang."
)
HELP = (
    "<b>ℹ️ ODILOV STUDIO — Yordam</b>\n\n"
    "/start — asosiy menyu\n"
    "/order — yangi buyurtma\n"
    "/myorders — buyurtmalarim\n"
    "/cancel — to‘ldirilayotgan buyurtmani bekor qilish\n"
    "/portfolio — portfolio\n"
    "/prices — xizmatlar va narxlar\n"
    "/contact — aloqa\n"
    "/privacy — shaxsiy ma'lumotlar haqida\n"
    "/delete_my_data — o‘chirish so‘rovi\n\n"
    "Botga shaxsiy parol, bank karta ma'lumotlari yoki maxfiy hujjatlarni yubormang."
)


def is_private(message: Message) -> bool:
    return message.chat.type == "private"


def is_admin(user_id: int, settings: Settings) -> bool:
    return user_id in settings.admin_ids


def register_user(message: Message, repo: Repository) -> None:
    if message.from_user:
        repo.upsert_user(message.from_user.id, message.from_user.username, message.from_user.full_name)


async def send_menu(message: Message, repo: Repository, settings: Settings) -> None:
    user_id = message.from_user.id if message.from_user else 0
    await message.answer(INTRO, reply_markup=K.menu(is_admin(user_id, settings), bool(repo.get_draft(user_id))))


async def show_stage(message: Message, draft: Draft) -> None:
    prompts = {
        "service": ("<b>1/7 · Xizmat turini tanlang:</b>", K.services()),
        "title": ("<b>2/7 · Loyiha nomi</b>\nMasalan: «ABC Coffee uchun logo» (3–120 belgi)", K.cancel()),
        "brief": ("<b>3/7 · Dizayn brief</b>\nNimalar kerak? Rang, uslub, matn, maqsad va o‘lchamni yozing. (10–1500 belgi)", K.cancel()),
        "files": ("<b>4/7 · Referens / materiallar</b>\n5 tagacha rasm yoki hujjat yuboring, keyin «Tayyor» tugmasini bosing. Majburiy emas.", K.skip("files", files=True)),
        "deadline": ("<b>5/7 · Topshirish muddati</b>\nSanani <code>YYYY-MM-DD</code> shaklida yozing. Masalan: 2026-12-20. Yoki o'tkazib yuboring.", K.skip("deadline")),
        "budget": ("<b>6/7 · Taxminiy budjet</b>\nFaqat raqam (so‘m): masalan <code>350000</code>. Yoki kelishuv uchun o'tkazib yuboring.", K.skip("budget")),
        "contact": ("<b>7/7 · Bog‘lanish</b>\nIxtiyoriy telefon raqamingiz yoki @username ni yuboring. Yoki Telegram orqali muloqot uchun o'tkazib yuboring.", K.skip("contact")),
        "review": (describe_draft(draft.data), K.review()),
    }
    text, keyboard = prompts[draft.stage]
    await message.answer(text, reply_markup=keyboard)


async def start_new(message: Message, repo: Repository) -> None:
    if not message.from_user:
        return
    register_user(message, repo)
    repo.save_draft(message.from_user.id, "service", {})
    draft = repo.get_draft(message.from_user.id)
    if draft:
        await show_stage(message, draft)


@user_router.message(CommandStart())
async def cmd_start(message: Message, repo: Repository, settings: Settings) -> None:
    if is_private(message):
        register_user(message, repo)
        await send_menu(message, repo, settings)


@user_router.message(Command("order"))
async def cmd_order(message: Message, repo: Repository) -> None:
    if is_private(message):
        await start_new(message, repo)


@user_router.message(Command("cancel"))
async def cmd_cancel(message: Message, repo: Repository, settings: Settings) -> None:
    if not is_private(message) or not message.from_user:
        return
    repo.clear_draft(message.from_user.id)
    await message.answer("❌ Tugallanmagan buyurtma bekor qilindi.")
    await send_menu(message, repo, settings)


@user_router.message(Command("prices"))
async def cmd_prices(message: Message) -> None:
    if is_private(message):
        await message.answer(PRICES)


@user_router.message(Command("portfolio"))
async def cmd_portfolio(message: Message, settings: Settings) -> None:
    if not is_private(message):
        return
    if settings.portfolio_url:
        await message.answer(f"📂 Portfolio: {escape(settings.portfolio_url)}")
    else:
        await message.answer("📂 Portfolio havolasi hozircha kiritilmagan. Adminga murojaat qiling.")


@user_router.message(Command("contact"))
async def cmd_contact(message: Message, settings: Settings) -> None:
    if is_private(message):
        await message.answer(
            f"📞 Buyurtma va hamkorlik: @{escape(settings.manager_username)}"
            if settings.manager_username else
            "📞 Aloqa uchun buyurtma qoldiring. Admin sizga Telegram orqali yozadi."
        )


@user_router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    if is_private(message):
        await message.answer(HELP)


@user_router.message(Command("privacy"))
async def cmd_privacy(message: Message) -> None:
    if is_private(message):
        await message.answer(
            "<b>🔒 Maxfiylik</b>\n"
            "Buyurtmalarni qayta ishlash uchun Telegram ID, username/ism, brief, ixtiyoriy aloqa "
            "ma'lumotlari, fayllarning Telegram identifikatorlari va buyurtma statusini saqlaymiz. "
            "Ular bot adminlariga ko‘rsatiladi. Bot fayllarni serverga yuklab olmaydi; "
            "mijoz yuborgan xabarlar adminlarga Telegram orqali nusxalanishi mumkin.\n\n"
            "Ma'lumotlaringizni bazamizdan o‘chirish uchun /delete_my_data ni bosing. "
            "Oldin admin chatiga yuborilgan bildirishnomalar avtomatik o‘chmaydi."
        )


@user_router.message(Command("delete_my_data"))
async def cmd_delete(message: Message) -> None:
    if is_private(message):
        await message.answer(
            "⚠️ Barcha buyurtmalaringiz va anketa ma'lumotlaringiz bot bazasidan o‘chadi. "
            "Bu amaliyotni qaytarib bo‘lmaydi. Faol buyurtmangiz bo‘lsa, avval admin bilan kelishing.",
            reply_markup=K.delete_confirm(),
        )


@user_router.message(Command("myorders"))
async def cmd_myorders(message: Message, repo: Repository) -> None:
    if not is_private(message) or not message.from_user:
        return
    orders = repo.list_user_orders(message.from_user.id)
    if not orders:
        await message.answer("Hozircha buyurtmalaringiz yo‘q. /order orqali boshlang.")
        return
    await message.answer(
        "<b>📋 So‘nggi buyurtmalaringiz</b>",
        reply_markup=K.my_orders([(order.id, f"{label_status(order.status)} {order.title}") for order in orders]),
    )


@user_router.callback_query(F.data.startswith("nav:"))
async def nav_callback(call: CallbackQuery, repo: Repository, settings: Settings, bot: Bot) -> None:
    await call.answer()
    if not call.message or not call.from_user or call.message.chat.type != "private":
        return
    message = call.message
    user_id = call.from_user.id
    action = (call.data or "").split(":", 1)[-1]
    if action == "new":
        repo.upsert_user(user_id, call.from_user.username, call.from_user.full_name)
        repo.save_draft(user_id, "service", {})
        await show_stage(message, repo.get_draft(user_id))
    elif action == "resume":
        draft = repo.get_draft(user_id)
        if draft:
            await show_stage(message, draft)
        else:
            await message.answer("Anketa topilmadi. /order bilan boshlang.")
    elif action == "cancel":
        repo.clear_draft(user_id)
        await message.answer("❌ Anketa bekor qilindi.", reply_markup=K.menu(is_admin(user_id, settings)))
    elif action == "home":
        await message.answer(INTRO, reply_markup=K.menu(is_admin(user_id, settings), bool(repo.get_draft(user_id))))
    elif action == "confirm":
        order = repo.submit_draft(user_id)
        if not order:
            await message.answer("Buyurtma allaqachon yuborilgan yoki tasdiqlash bosqichi yo‘q.")
            return
        await message.answer(
            f"✅ <b>#{order.id:05d} buyurtmangiz qabul qilindi!</b>\n"
            "Statusni «Buyurtmalarim» bo‘limidan kuzating.",
            reply_markup=K.menu(is_admin(user_id, settings)),
        )
        for admin_id in settings.admin_ids:
            try:
                await bot.send_message(
                    admin_id,
                    "🔔 <b>Yangi buyurtma!</b>\n\n" + describe_order(order, admin=True),
                    reply_markup=K.admin_order(order.id, order.status, bool(order.assets)),
                )
            except Exception:
                logger.exception("Buyurtma #%s admin %s ga yuborilmadi", order.id, admin_id)
    elif action == "prices":
        await message.answer(PRICES)
    elif action == "portfolio":
        await message.answer(
            f"📂 Portfolio: {escape(settings.portfolio_url)}" if settings.portfolio_url
            else "📂 Portfolio havolasi sozlanmagan."
        )
    elif action == "contact":
        await message.answer(
            f"📞 Aloqa: @{escape(settings.manager_username)}" if settings.manager_username
            else "📞 Aloqa uchun bot orqali buyurtma yuboring."
        )
    elif action == "help":
        await message.answer(HELP)
    elif action == "myorders":
        orders = repo.list_user_orders(user_id)
        if not orders:
            await message.answer("Hozircha buyurtma yo‘q. /order")
        else:
            await message.answer(
                "<b>📋 Buyurtmalarim</b>",
                reply_markup=K.my_orders([(order.id, f"{label_status(order.status)} {order.title}") for order in orders]),
            )


@user_router.callback_query(F.data.startswith("svc:"))
async def choose_service(call: CallbackQuery, repo: Repository) -> None:
    await call.answer()
    if not call.message or call.message.chat.type != "private":
        return
    code = (call.data or "").removeprefix("svc:")
    draft = repo.get_draft(call.from_user.id)
    if not draft or draft.stage != "service" or code not in SERVICES:
        await call.message.answer("Bu tugma eskirgan. /order bilan qaytadan boshlang.")
        return
    draft.data["service"] = code
    repo.save_draft(call.from_user.id, "title", draft.data)
    await show_stage(call.message, repo.get_draft(call.from_user.id))


@user_router.callback_query(F.data.startswith("skip:"))
async def skip_stage(call: CallbackQuery, repo: Repository) -> None:
    await call.answer()
    if not call.message or call.message.chat.type != "private":
        return
    target = (call.data or "").removeprefix("skip:")
    next_stages = {"files": "deadline", "deadline": "budget", "budget": "contact", "contact": "review"}
    draft = repo.get_draft(call.from_user.id)
    if not draft or draft.stage != target or target not in next_stages:
        await call.message.answer("Bu tugma eskirgan. Hozirgi bosqichni /start orqali davom ettiring.")
        return
    repo.save_draft(call.from_user.id, next_stages[target], draft.data)
    await show_stage(call.message, repo.get_draft(call.from_user.id))


@user_router.callback_query(F.data.startswith("usr:order:"))
async def user_order_details(call: CallbackQuery, repo: Repository) -> None:
    await call.answer()
    if not call.message or call.message.chat.type != "private":
        return
    try:
        ident = int((call.data or "").rsplit(":", 1)[-1])
    except ValueError:
        return
    order = repo.get_order(ident)
    if not order or order.customer_id != call.from_user.id:
        await call.message.answer("Buyurtma topilmadi yoki sizga tegishli emas.")
        return
    await call.message.answer(describe_order(order))


@user_router.callback_query(F.data.startswith("privacy:"))
async def privacy_callback(call: CallbackQuery, repo: Repository, settings: Settings) -> None:
    await call.answer()
    if not call.message or call.message.chat.type != "private":
        return
    if call.data == "privacy:confirm":
        removed = repo.delete_user(call.from_user.id)
        await call.message.answer(
            "✅ Bot bazasidagi ma'lumotlaringiz o‘chirildi." if removed
            else "Bot bazasida ma'lumotlaringiz topilmadi.",
            reply_markup=K.menu(is_admin(call.from_user.id, settings)),
        )
    else:
        await call.message.answer("O‘chirish bekor qilindi.")


@user_router.message(F.chat.type == "private")
async def wizard_text(message: Message, repo: Repository, settings: Settings) -> None:
    if not message.from_user:
        return
    user_id = message.from_user.id
    draft = repo.get_draft(user_id)
    if not draft:
        await message.answer("Asosiy menyu uchun /start. Buyurtma berish uchun /order.")
        return
    data = dict(draft.data)
    stage = draft.stage
    content = message.text or ""
    if stage == "service":
        await message.answer("Iltimos, quyidagi tugmalardan xizmatni tanlang.", reply_markup=K.services())
        return
    if stage == "title":
        title = clean_text(content, 120, 3)
        if not title:
            await message.answer("Loyiha nomi 3–120 belgidan iborat bo‘lsin.")
            return
        data["title"] = title
        next_stage = "brief"
    elif stage == "brief":
        brief = clean_text(content, 1500, 10)
        if not brief:
            await message.answer("Brief 10–1500 belgidan iborat matn bo‘lishi kerak.")
            return
        data["brief"] = brief
        next_stage = "files"
    elif stage == "files":
        if message.photo or message.document:
            assets = data.get("assets", [])
            if len(assets) >= 5:
                await message.answer("5 ta fayl limiti to‘ldi. «Tayyor»ni bosing.", reply_markup=K.skip("files", files=True))
                return
            file = message.photo[-1] if message.photo else message.document
            size = getattr(file, "file_size", 0) or 0
            if size > 20 * 1024 * 1024:
                await message.answer("Fayl hajmi 20 MB dan oshmasin.")
                return
            data["assets"] = [*assets, {
                "media_type": "photo" if message.photo else "document",
                "file_id": file.file_id,
                "chat_id": message.chat.id,
                "message_id": message.message_id,
                "file_name": getattr(file, "file_name", None),
            }]
            repo.save_draft(user_id, "files", data)
            await message.answer(
                f"📎 {len(data['assets'])}/5 ta fayl qabul qilindi.",
                reply_markup=K.skip("files", files=True),
            )
        else:
            await message.answer("Rasm yoki hujjat yuboring, yoki «Tayyor» tugmasini bosing.", reply_markup=K.skip("files", files=True))
        return
    elif stage == "deadline":
        parsed = parse_deadline(content, settings.timezone)
        if not parsed:
            await message.answer("Kelajakdagi sanani YYYY-MM-DD shaklida kiriting, masalan 2026-12-20.", reply_markup=K.skip("deadline"))
            return
        data["deadline"] = parsed
        next_stage = "budget"
    elif stage == "budget":
        amount = parse_budget(content)
        if amount is None:
            await message.answer("Budjetni 10000 dan 10000000000 gacha raqam bilan yozing yoki o'tkazib yuboring.", reply_markup=K.skip("budget"))
            return
        data["budget"] = amount
        next_stage = "contact"
    elif stage == "contact":
        contact = clean_text(content, 80, 3)
        if not contact:
            await message.answer("Aloqa ma'lumotini 3–80 belgida yozing yoki o'tkazib yuboring.", reply_markup=K.skip("contact"))
            return
        data["contact"] = contact
        next_stage = "review"
    else:
        await show_stage(message, draft)
        return
    repo.save_draft(user_id, next_stage, data)
    await show_stage(message, repo.get_draft(user_id))


# ----- Admin (admin_router is registered BEFORE user_router) -----

@admin_router.message(Command("admin"))
async def admin_command(message: Message, repo: Repository, settings: Settings) -> None:
    if not is_private(message) or not message.from_user or not is_admin(message.from_user.id, settings):
        return
    stats = repo.stats()
    await message.answer(
        "<b>🛡 ODILOV STUDIO — Admin</b>\n\n"
        f"Jami: <b>{stats['total']}</b>\n"
        f"🆕 Yangi: {stats['new']}\n"
        f"✅ Qabul qilingan: {stats['accepted']}\n"
        f"🛠 Jarayonda: {stats['in_progress']}\n"
        f"🎉 Tayyor: {stats['completed']}\n"
        f"❌ Bekor: {stats['cancelled']}",
        reply_markup=K.admin_home(),
    )


@admin_router.message(Command("stats"))
async def admin_stats(message: Message, repo: Repository, settings: Settings) -> None:
    if not is_private(message) or not message.from_user or not is_admin(message.from_user.id, settings):
        return
    counts = repo.stats()
    await message.answer(
        "<b>📈 Buyurtmalar statistikasi</b>\n"
        f"Jami: {counts['total']}\n"
        f"Yangi: {counts['new']}\nQabul qilingan: {counts['accepted']}\n"
        f"Jarayonda: {counts['in_progress']}\nTayyor: {counts['completed']}\n"
        f"Bekor: {counts['cancelled']}"
    )


@admin_router.message(Command("find"))
async def admin_find(message: Message, repo: Repository, settings: Settings) -> None:
    if not is_private(message) or not message.from_user or not is_admin(message.from_user.id, settings):
        return
    args = (message.text or "").split(maxsplit=1)
    if len(args) != 2 or not args[1].isdigit():
        await message.answer("Foydalanish: <code>/find 12</code>")
        return
    order = repo.get_order(int(args[1]))
    if not order:
        await message.answer("Buyurtma topilmadi.")
        return
    await message.answer(
        describe_order(order, admin=True),
        reply_markup=K.admin_order(order.id, order.status, bool(order.assets)),
    )


@admin_router.message(Command("reply"))
async def admin_reply(message: Message, repo: Repository, settings: Settings, bot: Bot) -> None:
    if not is_private(message) or not message.from_user or not is_admin(message.from_user.id, settings):
        return
    args = (message.text or "").split(maxsplit=2)
    if len(args) != 3 or not args[1].isdigit() or not (1 <= len(args[2]) <= 1500):
        await message.answer("Foydalanish: <code>/reply 12 Assalomu alaykum!</code> (1500 belgigacha)")
        return
    order = repo.get_order(int(args[1]))
    if not order:
        await message.answer("Buyurtma topilmadi.")
        return
    try:
        await bot.send_message(
            order.customer_id,
            f"✉️ <b>ODILOV STUDIO · Buyurtma #{order.id:05d}</b>\n\n{escape(args[2])}"
        )
    except Exception:
        logger.exception("Admin javobi yuborilmadi: #%s", order.id)
        await message.answer("⚠️ Xabar yuborilmadi. Mijoz botni bloklagan bo‘lishi mumkin.")
        return
    await message.answer(f"✅ Mijozga #{order.id:05d} bo‘yicha xabar yuborildi.")


@admin_router.callback_query(F.data.startswith("adm:"))
async def admin_callback(call: CallbackQuery, repo: Repository, settings: Settings, bot: Bot) -> None:
    if not is_admin(call.from_user.id, settings):
        await call.answer("Siz admin emassiz.", show_alert=True)
        return
    await call.answer()
    if not call.message or call.message.chat.type != "private":
        return
    parts = (call.data or "").split(":")
    action = parts[1] if len(parts) > 1 else ""
    if action == "home":
        stats = repo.stats()
        await call.message.answer(
            f"<b>🛡 Admin panel</b>\nJami: {stats['total']} | Yangi: {stats['new']} | "
            f"Jarayonda: {stats['in_progress']}",
            reply_markup=K.admin_home(),
        )
    elif action == "list" and len(parts) in (3, 4):
        status = parts[2]
        if status != "all" and status not in STATUS_LABELS:
            return
        try:
            page = int(parts[3]) if len(parts) == 4 else 0
        except ValueError:
            return
        if not 0 <= page <= 100_000:
            return
        filter_status = None if status == "all" else status
        per_page = 12
        orders = repo.list_orders(filter_status, per_page, page * per_page)
        total = repo.count_orders(filter_status)
        if not orders:
            await call.message.answer("Bu sahifada buyurtmalar yo‘q.", reply_markup=K.admin_home())
            return
        await call.message.answer(
            f"<b>📋 Buyurtmalar ({'Barchasi' if status == 'all' else label_status(status)})</b>\n"
            f"Sahifa: {page + 1} · Jami: {total}",
            reply_markup=K.admin_orders(
                [(order.id, f"{label_status(order.status)} · {order.title}") for order in orders],
                status=status, page=page, has_next=(page + 1) * per_page < total,
            ),
        )
    elif action in {"detail", "files"} and len(parts) == 3:
        try:
            order_id = int(parts[2])
        except ValueError:
            return
        order = repo.get_order(order_id)
        if not order:
            await call.message.answer("Buyurtma topilmadi.")
            return
        if action == "detail":
            await call.message.answer(
                describe_order(order, admin=True),
                reply_markup=K.admin_order(order.id, order.status, bool(order.assets)),
            )
        else:
            if not order.assets:
                await call.message.answer("Referens fayllari yo‘q.")
            for i, asset in enumerate(order.assets, 1):
                try:
                    await bot.copy_message(
                        chat_id=call.from_user.id,
                        from_chat_id=asset["original_chat_id"],
                        message_id=asset["original_message_id"],
                    )
                except Exception:
                    logger.exception("Fayl #%s buyurtma #%s uchun nusxalanmadi", i, order.id)
                    try:
                        # Telegram file_id remains usable even if source message is unavailable.
                        if asset["media_type"] == "photo":
                            await bot.send_photo(call.from_user.id, asset["telegram_file_id"])
                        else:
                            await bot.send_document(call.from_user.id, asset["telegram_file_id"])
                    except Exception:
                        logger.exception("File ID fallback failed: order #%s", order.id)
                        await call.message.answer(f"⚠️ #{i} faylni yetkazib bo‘lmadi.")
    elif action == "status" and len(parts) == 4:
        try:
            order_id = int(parts[2])
        except ValueError:
            return
        new_status = parts[3]
        order = repo.change_status(order_id, new_status, call.from_user.id)
        if not order:
            await call.message.answer("⚠️ Status o‘zgarmadi: eski tugma yoki noto‘g‘ri o‘tish. «Yangilash»ni bosing.")
            return
        await call.message.answer(
            "✅ <b>Status yangilandi</b>\n\n" + describe_order(order, admin=True),
            reply_markup=K.admin_order(order.id, order.status, bool(order.assets)),
        )
        try:
            await bot.send_message(
                order.customer_id,
                f"🔔 <b>Buyurtma #{order.id:05d} statusi o‘zgardi.</b>\n"
                f"Yangi status: {label_status(order.status)}\n\n"
                "Savollar bo‘lsa, /contact orqali bog‘laning.",
            )
        except Exception:
            logger.exception("Buyurtma #%s mijoziga statusni bildirishda xatolik", order.id)
