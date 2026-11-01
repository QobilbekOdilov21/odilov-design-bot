import unittest
from datetime import date

from app.formatting import clean_text, describe_order, money, parse_budget, parse_deadline
from app.storage import Order


class FormattingTests(unittest.TestCase):
    def test_clean_text(self):
        self.assertEqual(clean_text("  Hello   world ", 100), "Hello world")
        self.assertIsNone(clean_text("hi", 100, 3))
        self.assertIsNone(clean_text("x" * 101, 100))

    def test_budget(self):
        self.assertEqual(parse_budget("350 000"), 350_000)
        self.assertEqual(parse_budget("1_000_000"), 1_000_000)
        self.assertIsNone(parse_budget("1,000,000"))
        self.assertIsNone(parse_budget("-5"))
        self.assertIsNone(parse_budget("100"))
        self.assertEqual(money(300_000), "300 000 so‘m")

    def test_deadline(self):
        today = date(2026, 11, 1)
        self.assertEqual(parse_deadline("2026-11-01", today=today), "2026-11-01")
        self.assertIsNone(parse_deadline("2026-10-31", today=today))
        self.assertIsNone(parse_deadline("01.11.2026", today=today))
        self.assertIsNone(parse_deadline("2026-02-30", today=today))

    def test_html_escaping(self):
        order = Order(
            id=5, customer_id=123, customer_name="<evil>",
            service="logo", title="<script>alert(1)</script>", brief="hi & bye",
            deadline=None, budget=None, contact="<html>", status="new",
            created_at="2026-11-01T00:00:00+00:00", updated_at="2026-11-01T00:00:00+00:00",
        )
        text = describe_order(order, admin=True)
        self.assertIn("&lt;script&gt;", text)
        self.assertIn("hi &amp; bye", text)
        self.assertNotIn("<script>", text)
        self.assertIn("&lt;evil&gt;", text)
