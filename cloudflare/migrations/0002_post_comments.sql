-- Bot-based channel comments, separate from Telegram's native Discussion threads.
CREATE TABLE IF NOT EXISTS channel_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  channel_username TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, message_id)
);
CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK(length(text) BETWEEN 2 AND 600),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_post ON post_comments(user_id, post_id, id DESC);
