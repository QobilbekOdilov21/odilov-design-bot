PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  added_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS services (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  price TEXT NOT NULL DEFAULT 'Kelishiladi',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  draft_key TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_key TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  service TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  deadline TEXT,
  budget TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','accepted','in_progress','completed','cancelled')),
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  telegram_file_id TEXT NOT NULL,
  original_chat_id INTEGER NOT NULL,
  original_message_id INTEGER NOT NULL,
  file_name TEXT
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  order_id INTEGER,
  data_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_assignee ON orders(assignee_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_history_order ON history(order_id, id DESC);
INSERT OR IGNORE INTO services (code,label,sort_order) VALUES
 ('logo','🎯 Logotip va brending',1),
 ('smm','📱 SMM / Instagram dizayn',2),
 ('banner','📢 Banner va reklama',3),
 ('market','🛍 Marketplace / Infografika',4),
 ('print','🖨 Poligrafiya',5),
 ('packaging','📦 Qadoqlash dizayni',6),
 ('uiux','💻 UI/UX va web dizayn',7),
 ('gaming','🎮 Gaming / Esports dizayn',8),
 ('motion','🎞 Motion design',9),
 ('other','✨ Boshqa dizayn',10);
