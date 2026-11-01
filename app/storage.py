"""Durable SQLite storage: small, single-instance Telegram polling deployment.

All SQL uses bound parameters. Each write gets its own short transaction.
The database must live on a persistent volume in production.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from app.catalog import ALLOWED_TRANSITIONS, DRAFT_STAGES, SERVICES


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Draft:
    user_id: int
    stage: str
    data: dict[str, Any]


@dataclass
class Order:
    id: int
    customer_id: int
    customer_name: str
    service: str
    title: str
    brief: str
    deadline: str | None
    budget: int | None
    contact: str | None
    status: str
    created_at: str
    updated_at: str
    assets: list[dict[str, Any]] = field(default_factory=list)


class Repository:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _db(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self) -> None:
        with self._db() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    username TEXT,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS drafts (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    stage TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    customer_name TEXT NOT NULL,
                    service TEXT NOT NULL,
                    title TEXT NOT NULL,
                    brief TEXT NOT NULL,
                    deadline TEXT,
                    budget INTEGER,
                    contact TEXT,
                    status TEXT NOT NULL DEFAULT 'new',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
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
                CREATE TABLE IF NOT EXISTS status_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    old_status TEXT,
                    new_status TEXT NOT NULL,
                    changed_by INTEGER NOT NULL,
                    changed_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, id DESC);
                CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, id DESC);
            """)

    def upsert_user(self, user_id: int, username: str | None, name: str) -> None:
        with self._db() as conn:
            conn.execute("""
                INSERT INTO users (id, username, name, created_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name
            """, (user_id, username, name, now_utc()))

    def get_draft(self, user_id: int) -> Draft | None:
        with self._db() as conn:
            row = conn.execute("SELECT * FROM drafts WHERE user_id=?", (user_id,)).fetchone()
            return Draft(row["user_id"], row["stage"], json.loads(row["data_json"])) if row else None

    def save_draft(self, user_id: int, stage: str, data: dict[str, Any]) -> None:
        if stage not in DRAFT_STAGES:
            raise ValueError(f"Invalid wizard stage: {stage}")
        with self._db() as conn:
            conn.execute("""
                INSERT INTO drafts (user_id, stage, data_json, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    stage=excluded.stage, data_json=excluded.data_json, updated_at=excluded.updated_at
            """, (user_id, stage, json.dumps(data, ensure_ascii=False), now_utc()))

    def clear_draft(self, user_id: int) -> bool:
        with self._db() as conn:
            result = conn.execute("DELETE FROM drafts WHERE user_id=?", (user_id,))
            return result.rowcount > 0

    def submit_draft(self, user_id: int) -> Order | None:
        """Idempotent: duplicate confirm will not create a second order."""
        with self._db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT stage, data_json FROM drafts WHERE user_id=?", (user_id,)).fetchone()
            if row is None or row["stage"] != "review":
                return None
            data = json.loads(row["data_json"])
            if data.get("service") not in SERVICES or not data.get("title") or not data.get("brief"):
                raise ValueError("Incomplete order draft")
            usr = conn.execute("SELECT name FROM users WHERE id=?", (user_id,)).fetchone()
            if usr is None:
                raise ValueError("Customer record not found")
            created = now_utc()
            cur = conn.execute("""
                INSERT INTO orders (
                    customer_id, customer_name, service, title, brief, deadline,
                    budget, contact, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
            """, (user_id, usr["name"], data["service"], data["title"], data["brief"],
                  data.get("deadline"), data.get("budget"), data.get("contact"), created, created))
            order_id = int(cur.lastrowid)
            for asset in data.get("assets", [])[:5]:
                conn.execute("""
                    INSERT INTO assets (
                        order_id, media_type, telegram_file_id, original_chat_id,
                        original_message_id, file_name
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, (order_id, asset["media_type"], asset["file_id"], asset["chat_id"],
                      asset["message_id"], asset.get("file_name")))
            conn.execute("""
                INSERT INTO status_history (order_id, old_status, new_status, changed_by, changed_at)
                VALUES (?, NULL, 'new', ?, ?)
            """, (order_id, user_id, created))
            conn.execute("DELETE FROM drafts WHERE user_id=?", (user_id,))
        return self.get_order(order_id)

    @staticmethod
    def _to_order(row: sqlite3.Row, assets: list[dict[str, Any]] | None = None) -> Order:
        return Order(
            id=row["id"], customer_id=row["customer_id"], customer_name=row["customer_name"],
            service=row["service"], title=row["title"], brief=row["brief"],
            deadline=row["deadline"], budget=row["budget"], contact=row["contact"],
            status=row["status"], created_at=row["created_at"], updated_at=row["updated_at"],
            assets=assets or [],
        )

    def get_order(self, order_id: int) -> Order | None:
        with self._db() as conn:
            row = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
            if row is None:
                return None
            assets = [dict(asset) for asset in conn.execute(
                "SELECT * FROM assets WHERE order_id=? ORDER BY id", (order_id,)
            ).fetchall()]
            return self._to_order(row, assets)

    def list_user_orders(self, user_id: int, limit: int = 10) -> list[Order]:
        with self._db() as conn:
            rows = conn.execute(
                "SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT ?",
                (user_id, min(limit, 50)),
            ).fetchall()
            return [self._to_order(row) for row in rows]

    def list_orders(self, status: str | None = None, limit: int = 12, offset: int = 0) -> list[Order]:
        with self._db() as conn:
            if status is None:
                rows = conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT ? OFFSET ?", (min(limit, 50), max(offset, 0))).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM orders WHERE status=? ORDER BY id DESC LIMIT ? OFFSET ?",
                    (status, min(limit, 50), max(offset, 0)),
                ).fetchall()
            return [self._to_order(row) for row in rows]

    def count_orders(self, status: str | None = None) -> int:
        with self._db() as conn:
            if status is None:
                return int(conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0])
            return int(conn.execute("SELECT COUNT(*) FROM orders WHERE status=?", (status,)).fetchone()[0])

    def stats(self) -> dict[str, int]:
        with self._db() as conn:
            result = {key: 0 for key in ALLOWED_TRANSITIONS}
            result["total"] = 0
            for row in conn.execute("SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status"):
                result[row["status"]] = row["cnt"]
                result["total"] += row["cnt"]
            return result

    def change_status(self, order_id: int, new_status: str, changed_by: int) -> Order | None:
        """Atomically rejects invalid/duplicate status transitions."""
        with self._db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT status FROM orders WHERE id=?", (order_id,)).fetchone()
            if row is None or new_status not in ALLOWED_TRANSITIONS.get(row["status"], ()):
                return None
            created = now_utc()
            conn.execute(
                "UPDATE orders SET status=?, updated_at=? WHERE id=?",
                (new_status, created, order_id),
            )
            conn.execute("""
                INSERT INTO status_history (order_id, old_status, new_status, changed_by, changed_at)
                VALUES (?, ?, ?, ?, ?)
            """, (order_id, row["status"], new_status, changed_by, created))
        return self.get_order(order_id)

    def delete_user(self, user_id: int) -> bool:
        """Remove user and their draft/orders/assets/history from this database."""
        with self._db() as conn:
            result = conn.execute("DELETE FROM users WHERE id=?", (user_id,))
            return result.rowcount > 0
