# ODILOV STUDIO — Telegram-native Order Bot (Cloudflare Free)

**Barcha boshqaruv Telegram ichida.** Web admin panel yo‘q. Serverless Telegram webhook Cloudflare Workers’da, buyurtmalar D1 bazasida saqlanadi. Ushbu loyiha eski Python/SQLite polling botining Cloudflare uchun qayta yozilgan versiyasi; eski SQLite bazasi avtomatik ko‘chmaydi.

## Imkoniyatlar

**Mijoz:** 10 turdagi dizayn xizmati, nom, brief, 5 tagacha Telegram foto/hujjat, muddat, budjet, aloqa, tekshirish, tasdiqlash, buyurtmalarim, portfolio, narxlar, maxfiylik va ma’lumotlarni o‘chirish.

**Admin:** `/admin`, yangi/qabul qilingan/jarayondagi/barcha/menga biriktirilgan buyurtmalar, sahifalash, buyurtmani ID orqali qidirish, statuslar, mas’ulni tayinlash, mijozga botdan yozish, ichki izoh, fayllarni ko‘rish, tarix, statistika. **Faqat bosh admin:** admin qo‘shish/o‘chirish, xizmatni yoqish/o‘chirish va narxlarni o‘zgartirish. Adminlarni qo‘shish faqat oldindan botga `/start` yuborgan ID lar uchun ruxsat etiladi. Bosh admin `OWNER_ID` bilan o‘rnatiladi va botdan o‘chirib bo‘lmaydi.

**Muhim:** Botga kiritilgan telefon/brief va buyurtma ma’lumotlari D1 da saqlanadi; admin chatlariga yetkazilgan xabarlar Telegram’da alohida qoladi. Faqat bitta Telegram webhook tokenini ishlating. Bepul limit oshishi holatlarida xabarlar kechikishi mumkin; Telegram retry qiladi.

## Cloudflare Dashboard orqali GitHub'dan deploy (terminal talab qilinmaydi)

1. [Workers & Pages](https://dash.cloudflare.com/) → **Create application** → **Import a repository** → **GitHub**.
2. Repository: `QobilbekOdilov21/odilov-design-bot`, branch: `main`.
3. **Worker name:** `odilov-design-bot` — `wrangler.jsonc` dagi nom bilan bir xil bo‘lsin.
4. **Root directory:** `cloudflare` (bu loyiha monorepo ichida).
5. **Build command:** `npm run check`.
6. **Deploy command:** `npm run deploy:production`. Bu Worker'ni chiqaradi va D1 migratsiyasini avtomatik bajarishga urinadi. D1 ruxsati yetishmasa, alohida `npx wrangler d1 migrations apply DB --remote` orqali bajaring.
7. **Save and Deploy**; Cloudflare avtomatik D1 DB yaratishi mumkin. Deploy logida Worker URL va D1 holatini tekshiring. `GET /` uchun 404 qaytishi normal.
8. Worker → **Settings → Runtime variables and secrets** orqali qiymatlarni kiriting. `BOT_TOKEN` va `WEBHOOK_SECRET` Secret, qolganlari oddiy Variable bo‘lishi mumkin. GitHub build variables bilan adashtirmang:
   - `BOT_TOKEN` — BotFather tokeni
   - `WEBHOOK_SECRET` — 32+ belgili tasodifiy sir (harf, raqam, `_` yoki `-`)
   - `OWNER_ID` — bosh admin Telegram numeric ID
   - `PORTFOLIO_URL` — kanalga haqiqiy `https://t.me/...` link
   - `MANAGER_USERNAME` — `@` siz Telegram username
9. Telegram webhook'ni o‘rnating: loyihaning `scripts/set-webhook.mjs` skriptini lokal terminalda `npm run webhook:set` orqali ishga tushirish mumkin. Unda token va secret interaktiv kiritiladi, kodga yozilmaydi.
10. Adminning akkauntidan botga `/start`, `/admin` yuboring. Alohida mijoz akkauntida sinov buyurtmasi berib statusni boshqaring.

**Muhim:** Cloudflare Git integration avtomatik deploy qiladi, lekin Telegram webhook birinchi marta alohida ulanishi shart. Token/secret'larni GitHub'ga, chatga yoki ochiq screenshotga joylamang. Bepul Workers/D1 limitlari qo‘llanadi. 

## 1. Bepul Cloudflare hisob

1. https://dash.cloudflare.com/sign-up — hisob oching.
2. Kompyuterda Node.js 22+ va Git o‘rnating.
3. `git clone https://github.com/QobilbekOdilov21/odilov-design-bot.git`
4. `cd odilov-design-bot/cloudflare`
5. `npm install`
6. `npm test`
7. `npx wrangler login` — Cloudflare hisobingizga kiring.

## 2. Worker va D1 yaratish

`wrangler.jsonc` da D1 `database_id` allaqachon biriktirilgan. Bazani qayta yaratmang. **Hali webhook o‘rnatilmang** — avval baza migratsiyasini bajaring.

```bash
npx wrangler deploy
npx wrangler d1 migrations apply DB --remote
```

Deploy'dan keyin berilgan `https://odilov-design-bot.qobilbekodilov21.workers.dev` URL ni nusxalab oling. D1 ulanishida xatolik bo‘lsa, Cloudflare Dashboard’dagi mavjud `odilov-studio-db` ID va DB bindingni tekshiring.

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


## Kanalga kafolatliroq izoh tugmasi bilan post chiqarish: /publish

Agar kanalga qo‘lda joylangan postlarda `message to edit not found` yoki `MESSAGE_ID_INVALID` xatoligi paydo bo‘lsa, Telegram API ushbu postning tugmasini tahrirlashga ruxsat bermagan. Kanal administratori huquqi mavjud bo‘lishiga qaramay bunday xatolar kelishi mumkin.

**Ishonchliroq variant:** botdagi admin akkauntidan `/publish` yuboring, keyin **bitta matn, rasm, video, audio yoki hujjat** yuboring. Bot bu xabarni `copyMessage` orqali `@odilovstudio` kanalida yangidan e’lon qiladi va o‘zi chiqargan postga **💬 Izoh qoldirish** tugmasini biriktiradi. Kanalga oldindan qo‘lda joylangan postni o‘chirmaydi yoki almashtirmaydi. Botdagi `/cancel` orqali jo‘natishni bekor qilish mumkin.

Har bir alohida kanal posti uchun qaytadan `/publish` yuboring. Bu bir martalik post chiqarish rejimi; har qanday matn yoki fayl avtomatik ravishda kanalga yuborilmaydi. Agar Telegram baribir tugmani qo‘shishni rad etsa, post o‘zi kanalda saqlanadi, bot esa adminni ogohlantiradi va `/posts` xato sababini ko‘rsatadi. `/fixpost N` post tugmasini qayta sinaydi. Bu funksiyani ishlatish uchun botga kanalning **Post Messages** va **Edit Messages** huquqlari kerak.

**Muhim:** `/publish` orqali yuborilgan postlar bot tomonidan chiqariladi; avval qo‘lda yuborilgan kanal postlariga tugma avtomatik qo‘shilishi Telegram tomonidan kafolatlanmaydi.

## Kanal postlariga bot orqali izoh qoldirish

Telegram’ning haqiqiy **Comment** tredi faqat kanalga muhokama guruhi ulanganda ishlaydi. Ushbu funksiya **guruh talab qilmaydigan muqobil izoh tizimi**: kanal postidagi **💬 Izoh qoldirish** tugmasi `@odilovstudiobot` ning shaxsiy chatini ochadi. Izohlar D1 da saqlanadi va post bo‘yicha bot ichida ko‘rsatiladi; izohlar kanal ichida alohida native Telegram thread bo‘lib ko‘rinmaydi.

1. `@odilovstudiobot` ni `@odilovstudio` kanaliga **administrator** qilib qo‘shing; **Edit messages / Xabarlarni tahrirlash** ruxsatini bering.
2. [GitHub webhook workflow](https://github.com/QobilbekOdilov21/odilov-design-bot/actions/workflows/set-telegram-webhook.yml) sahifasida **Run workflow → main → Run workflow** ni yana bajaring. Endi `allowed_updates` ichida `channel_post` ham bor. GitHub Actions’dagi `BOT_TOKEN` va `WEBHOOK_SECRET` mos bo‘lishi kerak.
3. Cloudflare deployning eng so‘nggi commitini olganini va `0002_post_comments.sql` migratsiyasi bajarilganini tekshiring.
4. Kanalga **yangi** test postini qo‘ying. Bot yangi postga inline **💬 Izoh qoldirish** tugmasini qo‘shadi. Oldin e’lon qilingan postlarga tugma avtomatik qo‘shilmaydi.
5. Boshqa Telegram akkaunti bilan tugmani ochib, izoh yozing. Izohlar post bo‘yicha botda ko‘rinadi; admin botdagi izohlar ekranidan **🗑 Izohni o‘chirish** tugmasini ko‘radi.
6. Har bir foydalanuvchi har bir postga ko‘pi bilan 5 ta izoh, 30 soniyadan kam bo‘lmagan oraliqda yozishi mumkin; izoh 2–600 belgi.

`CHANNEL_USERNAME` (ixtiyoriy runtime Variable) orqali kuzatiladigan kanalni tanlash mumkin (masalan, `odilovstudio`). Agar belgilanmagan bo‘lsa, bot `PORTFOLIO_URL` dan kanal username’ni oladi, u ham bo‘lmasa `odilovstudio` ishlatiladi. `BOT_USERNAME` (ixtiyoriy runtime Variable) bot username o‘zgarganda kerak; hozirda standart qiymat `odilovstudiobot`.

**Eslatma:** `wrangler.jsonc` da `keep_vars: true` bor; bu Cloudflare Dashboard’dagi runtime Variable’larni keyingi GitHub deploylarda saqlaydi. Secret qiymatlarini GitHub kodiga qo‘ymang.

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

`src/index.js` webhook · `src/bot.js` mijoz/admin flow · `src/db.js` D1 data access · `src/ui.js` tugmalar · `migrations/0001_init.sql` va `0002_post_comments.sql` schema · `tests/` testlar · `scripts/set-webhook.mjs` webhook setup.
