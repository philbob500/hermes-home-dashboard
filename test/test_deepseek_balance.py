import unittest
from datetime import datetime, timezone

from dashboard.plugin_api import _deepseek_money, deepseek_peak_now


class DeepSeekBalanceTest(unittest.TestCase):
    def test_peak_windows_follow_the_published_utc_hours(self):
        # Monday 02:30 UTC is inside 01:00-04:00, Monday 05:00 UTC is not.
        self.assertTrue(deepseek_peak_now(datetime(2026, 9, 28, 2, 30, tzinfo=timezone.utc)))
        self.assertFalse(deepseek_peak_now(datetime(2026, 9, 28, 5, 0, tzinfo=timezone.utc)))
        # Second window 06:00-10:00 UTC.
        self.assertTrue(deepseek_peak_now(datetime(2026, 9, 28, 9, 59, tzinfo=timezone.utc)))
        self.assertFalse(deepseek_peak_now(datetime(2026, 9, 28, 10, 0, tzinfo=timezone.utc)))
        # Weekends never bill peak prices.
        self.assertFalse(deepseek_peak_now(datetime(2026, 9, 26, 2, 30, tzinfo=timezone.utc)))

    def test_naive_timestamps_are_read_as_utc(self):
        self.assertTrue(deepseek_peak_now(datetime(2026, 9, 28, 2, 30)))

    def test_money_parsing_accepts_numbers_and_strings_only(self):
        self.assertEqual(_deepseek_money(2.8), 2.8)
        self.assertEqual(_deepseek_money("2.8"), 2.8)
        self.assertEqual(_deepseek_money("1,234.50"), 1234.5)
        self.assertIsNone(_deepseek_money(True))
        self.assertIsNone(_deepseek_money("n/a"))
        self.assertIsNone(_deepseek_money(None))


if __name__ == "__main__":
    unittest.main()
