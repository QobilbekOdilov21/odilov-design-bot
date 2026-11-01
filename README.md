# ODILOV STUDIO — Telegram Orders Bot

**Cloudflare Free version (recommended):** [cloudflare/README.md](cloudflare/README.md) — Telegram webhook + Cloudflare D1. **Admin panel is entirely inside Telegram**, no external web admin.

The previous Python/aiogram + SQLite polling code is retained at the repository root as a **legacy VPS edition**. Do not run Python polling simultaneously with the Cloudflare webhook using the same bot token.

## Quick start

```bash
cd cloudflare
npm install
npm run check
npm test
npx wrangler login
npx wrangler deploy
npx wrangler d1 migrations apply DB --remote
```

Follow [Cloudflare deployment instructions](cloudflare/README.md) to configure secrets and webhook. No token or customer information belongs in GitHub.
