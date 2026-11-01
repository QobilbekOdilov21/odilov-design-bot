"""Standard-library integration tests, no Telegram token required."""
import tempfile
import unittest
from pathlib import Path

from app.storage import Repository


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.repo = Repository(Path(self.folder.name) / "db.sqlite")
        self.repo.initialize()
        self.repo.upsert_user(101, "sample", "Test Client")

    def tearDown(self):
        self.folder.cleanup()

    def _create_order(self):
        self.repo.save_draft(101, "review", {
            "service": "logo", "title": "Coffee Shop", "brief": "Premium qora oq logo kerak",
            "assets": [{
                "media_type": "photo", "file_id": "sample_photo", "chat_id": 101,
                "message_id": 22, "file_name": None,
            }],
            "budget": 300_000,
            "deadline": "2027-01-01", "contact": "@sample",
        })
        return self.repo.submit_draft(101)

    def test_creates_tables_and_stores_draft(self):
        self.repo.save_draft(101, "title", {"service": "logo"})
        draft = self.repo.get_draft(101)
        self.assertEqual(draft.stage, "title")
        self.assertEqual(draft.data["service"], "logo")
        self.assertTrue(self.repo.clear_draft(101))
        self.assertIsNone(self.repo.get_draft(101))

    def test_persistence_between_instances(self):
        self.repo.save_draft(101, "brief", {"title": "Same data"})
        other = Repository(self.repo.path)
        self.assertEqual(other.get_draft(101).data["title"], "Same data")

    def test_submit_full_order(self):
        order = self._create_order()
        self.assertEqual(order.id, 1)
        self.assertEqual(order.status, "new")
        self.assertEqual(order.budget, 300_000)
        self.assertEqual(len(order.assets), 1)
        self.assertIsNone(self.repo.get_draft(101))
        self.assertEqual(self.repo.stats()["new"], 1)

    def test_submit_duplicate_is_idempotent(self):
        self._create_order()
        self.assertIsNone(self.repo.submit_draft(101))
        self.assertEqual(self.repo.stats()["total"], 1)

    def test_status_transitions(self):
        order = self._create_order()
        self.assertIsNone(self.repo.change_status(order.id, "completed", 999))
        self.assertEqual(self.repo.change_status(order.id, "accepted", 999).status, "accepted")
        self.assertIsNone(self.repo.change_status(order.id, "accepted", 999))
        self.assertEqual(self.repo.change_status(order.id, "in_progress", 999).status, "in_progress")
        self.assertEqual(self.repo.change_status(order.id, "completed", 999).status, "completed")
        self.assertIsNone(self.repo.change_status(order.id, "cancelled", 999))

    def test_user_orders_isolation(self):
        first = self._create_order()
        self.repo.upsert_user(102, None, "Another Client")
        self.assertEqual(len(self.repo.list_user_orders(101)), 1)
        self.assertEqual(self.repo.list_user_orders(102), [])
        self.assertEqual(self.repo.get_order(first.id).customer_id, 101)

    def test_delete_user_cascades(self):
        order = self._create_order()
        self.assertTrue(self.repo.delete_user(101))
        self.assertIsNone(self.repo.get_order(order.id))
        self.assertEqual(self.repo.stats()["total"], 0)
        self.assertIsNone(self.repo.get_draft(101))

    def test_incomplete_order_rejected(self):
        self.repo.save_draft(101, "review", {"service": "logo"})
        with self.assertRaises(ValueError):
            self.repo.submit_draft(101)
        self.assertIsNotNone(self.repo.get_draft(101))

    def test_invalid_stage_rejected(self):
        with self.assertRaises(ValueError):
            self.repo.save_draft(101, "invalid", {})

    def test_pagination(self):
        self._create_order()
        self.repo.save_draft(101, "review", {
            "service": "banner", "title": "Second", "brief": "A second design request",
        })
        self.repo.submit_draft(101)
        self.assertEqual(self.repo.count_orders(), 2)
        self.assertEqual(self.repo.list_orders(limit=1, offset=0)[0].title, "Second")
        self.assertEqual(self.repo.list_orders(limit=1, offset=1)[0].title, "Coffee Shop")

    def test_list_order_filters(self):
        order = self._create_order()
        self.assertEqual(len(self.repo.list_orders("new")), 1)
        self.repo.change_status(order.id, "accepted", 999)
        self.assertEqual(self.repo.list_orders("new"), [])
        self.assertEqual(len(self.repo.list_orders("accepted")), 1)
