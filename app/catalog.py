"""Services and state transitions in one place."""
from __future__ import annotations

SERVICES: dict[str, str] = {
    "logo": "🎯 Logotip va brending",
    "smm": "📱 SMM / Instagram dizayn",
    "banner": "📢 Banner va reklama",
    "market": "🛍 Marketplace / Infografika",
    "print": "🖨 Poligrafiya",
    "packaging": "📦 Qadoqlash dizayni",
    "uiux": "💻 UI/UX va web dizayn",
    "gaming": "🎮 Gaming / Esports dizayn",
    "motion": "🎞 Motion design",
    "other": "✨ Boshqa dizayn",
}

STATUS_LABELS: dict[str, str] = {
    "new": "🆕 Yangi",
    "accepted": "✅ Qabul qilindi",
    "in_progress": "🛠 Jarayonda",
    "completed": "🎉 Tayyor",
    "cancelled": "❌ Bekor qilindi",
}

ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "new": ("accepted", "cancelled"),
    "accepted": ("in_progress", "cancelled"),
    "in_progress": ("completed", "cancelled"),
    "completed": (),
    "cancelled": (),
}

DRAFT_STAGES = (
    "service", "title", "brief", "files", "deadline", "budget", "contact", "review",
)
