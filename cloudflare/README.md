# ODILOV STUDIO — Telegram-native Order Bot (Cloudflare Free)

**Barcha boshqaruv Telegram ichida.** Web admin panel yo‘q. Serverless Telegram webhook Cloudflare Workers’da, buyurtmalar D1 bazasida saqlanadi. Ushbu loyiha eski Python/SQLite polling botining Cloudflare uchun qayta yozilgan versiyasi; eski SQLite bazasi avtomatik ko‘chmaydi.

## Imkoniyatlar

**Mijoz:** 10 turdagi dizayn xizmati, nom, brief, 5 tagacha Telegram foto/hujjat, muddat, budjet, aloqa, tekshirish, tasdiqlash, buyurtmalarim, portfolio, narxlar, maxfiylik va ma’lumotlarni o‘chirish.

**Admin:** `/admin`, yangi/qabul qilingan/jarayondagi/barcha/menga biriktirilgan buyurtmalar, sahifalash, buyurtmani ID orqali qidirish, statuslar, mas’ulni tayinlash, mijozga botdan yozish, ichki izoh, fayllarni ko‘rish, tarix, statistika. **Faqat bosh admin:** admin qo‘shish/o‘chirish, xizmatni yoqish/o‘chirish va narxlarni o‘zgartirish. Adminlarni qo‘shish faqat oldindan botga `/start` yuborgan ID lar uchun ruxsat etiladi. Bosh admin `OWNER_ID` bilan o‘rnatiladi va botdan o‘chirib bo‘lmaydi.

**Muhim:** Botga kiritilgan telefon/brief va buyurtma ma’lumotlari D1 da saqlanadi; admin chatlariga yetkazilgan xabarlar Telegram’da alohida qoladi. Faqat bitta Telegram webhook tokenini ishlating. Bepul limit oshishi holatlarida xabarlar kechikishi mumkin; Telegram retry qiladi.

## 1. Bepul Cloudflare hisob

1. https://dash.cloudflare.com/sign-up — hisob oching.
2. Kompyuterda Node.js 22+ va Git o‘rnating.
3. `git clone https://github.com/QobilbekOdilov21/odilov-design-bot.git`
4. `cd odilov-design-bot/cloudflare`
5. `npm install`
6. `npm test`
7. `npx wrangler login` — Cloudflare hisobingizga kiring.

## 2. Worker va D1 yaratish

`wrangler.jsonc` da D1 `database_id` ko‘rsatilmagan: zamonaviy Wrangler deploy vaqtida avtomatik provision qiladi. Bu Cloudflare Free rejasi bilan ham ishlaydi. **Hali webhook o‘rnatilmang** — avval baza migratsiyasini bajaring.

```bash
npx wrangler deploy
npx wrangler d1 migrations apply DB --remote
```

Deploy'dan keyin berilgan `https://odilov-studio-orders.<YOUR_SUBDOMAIN>.workers.dev` URL ni nusxalab oling. D1 resurs yaratishda xatolik bo‘lsa, `npx wrangler d1 create odilov-studio-db` bajarib `database_id` ni `wrangler.jsonc` ichiga kiriting va qayta deploy qiling.

**Eslatma:** Worker URL `GET /` so‘rovlari uchun ataylab `404` qaytaradi — bu veb-sayt emas. Telegram faqat `POST /webhook` yuboradi.

## 3. BotFather va maxfiy sozlamalar

1. https://t.me/BotFather da `/newbot` bilan bot yarating (yoki mavjud bot tokenidan foydalaning).
2. Telegram raqamli ID’ingizni aniqlang (username emas!) va `OWNER_ID` sifatida ishlating.
3. `WEBHOOK_SECRET` uchun kamida 32 ta tasodifiy alfanumerik belgidan iborat satr yarating. Buni hech kimga yubormang.
4. `cloudflare/` ichida quyidagi maxfiy muhit qiymatlarini kiriting:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put OWNER_ID
npx wrangler secret put PORTFOLIO_URL
npx wrangler secret put MANAGER_USERNAME
```

Kiritiladigan ma’lumotlar: `BOT_TOKEN` — BotFather tokeni; `WEBHOOK_SECRET` — maxfiy satr; `OWNER_ID` — bosh adminning raqamli Telegram IDsi; `PORTFOLIO_URL` — haqiqiy kanal URL; `MANAGER_USERNAME` — `@` siz username.

**Hech qachon** tokenni Github `.env`, commit, chat, screenshot yoki terminal buyruq argumentiga joylamang.

## 4. Webhook ulash

```bash
npm run webhook:set
```

Dastur Telegram token, Worker URL va **Cloudflare’ga kiritilgan o‘sha WEBHOOK_SECRET** ni interaktiv ravishda so‘raydi. Token faylga saqlanmaydi.

Holatini tekshirish: `npm run webhook:info`.

## 5. Telegram ichida foydalanish

1. Bosh admin botga `/start`, so‘ng `/admin` yuboradi.
2. Mijoz boshqa Telegram akkauntdan `/start` -> `🎨 Buyurtma` -> barcha brief bosqichlari -> `✅ Tasdiqlash`.
3. Bosh admin yangi buyurtma xabarini oladi. `/admin` -> `🆕 Yangi` -> buyurtma -> `✅ Qabul qilingan` -> `🛠 Jarayonda` -> `🎉 Tayyor`.
4. `👤 Mas’ul admin` tugmasi bilan mas’ul tayinlash; `💬 Mijozga javob` dan shaxsiy xabar yuborish.
5. `👥 Adminlar` -> `➕ Admin qo‘shish`. Yangi admin avval botga `/start` bosgan va numeric ID sizda bo‘lishi kerak. Shu menyudan adminni o‘chirish ham mumkin.
6. `🛠 Xizmatlar / narxlar` menyusi orqali narx yoki xizmat holatini o‘zgartiring (bosh admin).

## Buyruqlar

`/start` `/order` `/myorders` `/prices` `/portfolio` `/help` `/privacy` `/delete_my_data` `/cancel` `/admin` `/stats`.

## Testlar

```bash
npm run check
npm test
```

Testlar D1 ning SQL sintaksisiga yaqin Node.js ichki SQLite bazasi bilan ishlaydi. Mahalliy testlar o‘tgani real Telegram–Cloudflare integratsiyasi sinovdan o‘tganini anglatmaydi. Deploy'dan keyin real ikki akkaunt bilan test qiling.

## Xavfsizlik va cheklovlar

- Telegram webhook xabarlarini faqat `X-Telegram-Bot-Api-Secret-Token` mos kelsa qabul qiladi; webhook’dan tashqari HTTP endpoint yo‘q.
- Admin huquqi har bir callback/message uchun bazadan qayta tekshiriladi; bosh admin `OWNER_ID` bilan himoyalangan.
- Buyurtma ma’lumotlari HTML formatida escape qilinadi va SQL so‘rovlari parameter bind ishlatadi.
- Takror bosilgan tasdiq uchun `draft_key` unique; webhook retry `processed_updates` bilan deduplikatsiya qilinadi.
- D1 ga Telegram fayllarning o‘zi ko‘chirilmaydi; Telegram `file_id` va original xabar ID saqlanadi.
- Bepul tarifda 100 ming Worker request/kun va D1 quota limitlari bor; kafolatlangan 100% uptime yo‘q.
- `/delete_my_data` mijozning shu bot bazasidagi yozuvlarini o‘chiradi, ammo oldin admin chatlariga yuborilgan xabarlarni o‘chirmaydi.
- Bu MVP: to‘lov integratsiyasi, avtomatik invoice, bulk marketing xabarlari, tashqi CRM yo‘q.
- D1 da o‘chirilgan buyurtmalarni tiklash uchun alohida zaxira siyosati zarur.

## Tuzilma

`src/index.js` webhook · `src/bot.js` mijoz/admin flow · `src/db.js` D1 data access · `src/ui.js` tugmalar · `migrations/0001_init.sql` schema · `tests/` testlar · `scripts/set-webhook.mjs` webhook setup.
