# ODILOV STUDIO — Telegram Design Orders Bot

Telegram orqali grafik dizayn buyurtmalarini qabul qilish va boshqarish uchun tayyor Python bot.

## Funksiyalar

- 🎨 10 ta dizayn xizmatidan birini tanlash
- 🧾 Loyiha nomi va batafsil brief
- 📎 5 tagacha rasm/hujjat-referens (Telegram file IDlari saqlanadi)
- 📅 Topshirish muddati, 💰 UZS budjet va ixtiyoriy aloqa
- ✅ Buyurtmani ko‘rib chiqish va tasdiqlash; takror bosishdan himoya
- 💬 Barcha adminlarga yangi buyurtma xabari
- 🛡 Telegram ichidagi admin panel: yangi / qabul qilindi / jarayonda / tayyor / bekor
- 🔔 Status o‘zgarganda mijozga avtomatik xabar
- 📋 Mijozning o‘z buyurtmalarini ko‘rishi (boshqalarinikini ko‘rolmaydi)
- 💾 Yarim to‘ldirilgan anketalar va buyurtmalar **SQLite** bazada saqlanadi
- 🔒 `/privacy`, `/delete_my_data`, admin ID tekshiruvi, HTML escape, maxfiy token `.env` da
- 🐳 Docker, Docker Compose, GitHub Actions, unit/integration testlar

## 1. Telegram botni ochish

1. `https://t.me/BotFather` ga kirib `/newbot` yuboring.
2. Bot nomini `ODILOV STUDIO | Orders`, username ni (bo‘sh bo‘lsa) `OdilovStudioOrdersBot` kabi tanlang.
3. BotFather bergan **token**ni maxfiy saqlang. Hech qachon GitHub yoki chatga yubormang.
4. Shaxsiy **Telegram numeric ID** ni (masalan `@userinfobot`) orqali oling.
5. **Admin botga avval `/start` bosishi kerak**, aks holda bot admin chatiga xabar yubora olmaydi.

## 2. Lokal o‘rnatish

Python 3.12 tavsiya etiladi.

```bash
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows PowerShell:
# .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
```

`.env` ni to‘ldiring:

```dotenv
BOT_TOKEN=YOUR_PRIVATE_TOKEN_FROM_BOTFATHER
ADMIN_IDS=123456789
PORTFOLIO_URL=https://t.me/your_real_portfolio_channel
MANAGER_USERNAME=your_username
DATABASE_PATH=./data/odilov.db
TIMEZONE=Asia/Tashkent
```

Bir nechta admin uchun: `ADMIN_IDS=111111111,222222222`. Botni ishga tushiring:

```bash
python -m app.main
```

Buyruqlar: `/start`, `/order`, `/myorders`, `/cancel`, `/portfolio`, `/prices`, `/contact`, `/help`, `/admin`, `/stats`, `/find 12`, `/reply 12 Xabar` (faqat admin), `/privacy`, `/delete_my_data`.

## 3. Docker bilan ishga tushirish

```bash
cp .env.example .env
# .env ni tahrirlang
docker compose up -d --build
docker compose logs -f odilov-bot
```

`compose.yaml` ma'lumotlar bazasini **named volume**da saqlaydi. Docker volume o‘chirilsa, buyurtmalar ham yo‘qoladi; muntazam backup oling.

## 4. GitHub’ga yuklash (keyingi bosqich)

```bash
git init
git add .
git commit -m "Build ODILOV STUDIO Telegram order bot"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/odilov-studio-bot.git
git push -u origin main
```

> GitHub repository-ni avval yaratish kerak. **`.env` faylini push qilmang.** `.gitignore` uni bloklaydi.

## 5. Serverga joylashtirish

**Tavsiya: Docker ishlaydigan VPS yoki persistent volume beradigan cloud worker.** Bot long polling ishlatadi; **veb-sayt yoki HTTP port talab qilmaydi**. Bir vaqtda **faqat bitta nusxa** ishlating: parallel polling instance’lar bir-biriga xalaqit beradi.

VPS’da loyihani klonlang, `.env` yozing va `docker compose up -d --build` ishga tushiring.

**Railway yoki shunga o‘xshash cloud:** GitHub repository ni worker sifatida ulang, `BOT_TOKEN`, `ADMIN_IDS`, `PORTFOLIO_URL`, `MANAGER_USERNAME`, `TIMEZONE` env varlarini kiriting. **Persistent disk/volume** ni `/data` ga ulang va `DATABASE_PATH=/data/odilov.db` o‘rnating. Bir replica ishlating. Bepul/ephemeral filesystemda SQLite buyurtmalari yo‘qolishi mumkin.

**Render:** faqat polling **Background Worker** sifatida ishlating va bazani doimiy diskda saqlang. Oddiy web service rejimi bu bot uchun mos emas (HTTP endpoint yo‘q).

## 6. Testlar

```bash
python -m unittest discover -s tests -v
python -m compileall -q app tests
```

GitHub Actions har pushda lint/syntax/testlarni tekshiradi.

## Xavfsizlik va cheklovlar

- Token, server parollari, foydalanuvchi ma'lumotlari va ma'lumotlar bazasini repository'ga yuklamang.
- Adminlarga buyurtmalar Telegram orqali yuboriladi. Foydalanuvchi `/delete_my_data` qilsa, **bot bazasidagi** ma'lumotlar o‘chadi, ammo oldin admin chatiga yuborilgan Telegram xabarlari alohida qoladi.
- Telegramga yuborilgan referenslar bot diskiga yuklab olinmaydi. Fayl identifikatorlari va original xabar IDsi saqlanadi; admin faylni bot orqali ko‘ra oladi.
- Statuslar: `new → accepted → in_progress → completed` (yoki faol bosqichdan `cancelled`).
- Bot v1 bir worker va kichik/o‘rtacha buyurtma oqimi uchun mo‘ljallangan. Katta hajm/ko‘p instance uchun PostgreSQL, queue va migratsiya tizimi qo‘shing.
- Dastlabki schema `CREATE TABLE IF NOT EXISTS` bilan yaratiladi; keyingi schema o‘zgarishlari uchun alohida migratsiya zarur.
- V1 avtomatik online to‘lov, to‘lov chekini tekshirish va webhook qo‘llamaydi. Narx individual kelishiladi.

**Brand:** ODILOV STUDIO · Red × Black · Creative Graphic Design.
