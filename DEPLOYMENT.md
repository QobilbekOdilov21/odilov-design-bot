# ODILOV STUDIO — Production deployment

Repository: https://github.com/QobilbekOdilov21/odilov-design-bot

## Prerequisites

- Your own Telegram bot created with https://t.me/BotFather (`/newbot`)
- Your Telegram **numeric user ID** for `ADMIN_IDS`
- A single running Linux VPS with Docker + Docker Compose, or another hosting platform with **one continuously running worker** and a persistent volume
- Your real portfolio channel URL and Telegram contact username

**Security:** Never commit `.env`, share `BOT_TOKEN` in chat, or print it in CI logs. Use the server's environment/secret manager.

## Recommended: VPS + Docker Compose

1. Install Docker Engine and Docker Compose on an Ubuntu VPS (follow the official Docker installation guide for your Ubuntu version).
2. SSH to the VPS and run:

```bash
git clone https://github.com/QobilbekOdilov21/odilov-design-bot.git
cd odilov-design-bot
cp .env.example .env
chmod 600 .env
nano .env
```

3. In `.env`, replace *all* placeholders:

```dotenv
BOT_TOKEN=<enter the token DIRECTLY on your server>
ADMIN_IDS=<your Telegram numeric ID>
PORTFOLIO_URL=https://t.me/<your_actual_channel>
MANAGER_USERNAME=<your_actual_username_without_at>
DATABASE_PATH=/data/odilov.db
TIMEZONE=Asia/Tashkent
```

4. Start the bot:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 odilov-bot
```

Logs should show `ODILOV STUDIO bot @... started`. **Do not run a second polling process using the same token.**

5. Test all the following in Telegram:
   - Admin opens the bot and sends `/start` (required before notification)
   - Customer sends `/start`, chooses `Buyurtma berish` and submits a brief, assets (optional), deadline and budget
   - Admin sees the newly created order and uses `/admin` to move it through the allowed states
   - Customer receives a status notification and can open `/myorders`
   - Confirm a double-tap on the final confirmation does not create a duplicate order

## Persisting and backing up SQLite

The bundled `compose.yaml` mounts a named Docker volume at `/data`. Keep that volume across updates:

```bash
git pull --ff-only
docker compose up -d --build
```

Back up the live SQLite database safely using SQLite's online backup API:

```bash
docker compose exec -T odilov-bot python -c "import sqlite3; a=sqlite3.connect('/data/odilov.db'); b=sqlite3.connect('/data/odilov-backup.db'); a.backup(b); b.close(); a.close()"
docker compose cp odilov-bot:/data/odilov-backup.db ./odilov-backup.db
```

Store the backup securely; it contains customer information.

## Render or similar cloud platforms

This is a **long-polling worker**, not an HTTP web app. Do not deploy it as a free web service that sleeps or lacks a persistent filesystem. Choose a **continuously running background worker** and attach a **persistent disk** mounted at `/data`, with `DATABASE_PATH=/data/odilov.db`. Select **one instance**. Check pricing before enabling a paid plan. The currently connected Render tool cannot create background workers; use the dashboard or select a VPS.

## Troubleshooting

- Bot is silent: verify token in the server's secret config, admin IDs and logs.
- Admin receives no orders: admin must first send `/start` to the bot, and `ADMIN_IDS` must contain their numeric ID.
- Polling conflict (Telegram 409): stop duplicate bot deployments.
- Orders disappear after restart: storage is not on a persistent disk/volume.
- Token leaked: revoke/regenerate using BotFather and update the server secret. Never keep an old exposed token.
