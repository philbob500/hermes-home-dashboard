import unittest

from dashboard.plugin_api import _valid_layout


class LayoutApiVersionTest(unittest.TestCase):
    def test_current_and_previous_layout_versions_are_accepted(self):
        widgets = [{"id": "codex", "gx": 0, "gy": 0, "gw": 4, "gh": 3}]
        self.assertTrue(_valid_layout({"version": 1, "widgets": widgets}))
        self.assertTrue(_valid_layout({"version": 2, "widgets": widgets}))
        self.assertFalse(_valid_layout({"version": 3, "widgets": widgets}))


if __name__ == "__main__":
    unittest.main()
