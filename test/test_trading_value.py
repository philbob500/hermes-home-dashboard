import json
import threading
import unittest
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

from dashboard import plugin_api


class TradingValueTest(unittest.TestCase):
    def test_normalizes_only_dated_finite_paper_marks(self):
        result = plugin_api._normalize_trading_value({
            "view": {
                "start_eur": "100",
                "portfolio": {"paper": {"total_eur": "98.5", "as_of": "2026-09-30T12:00:00Z"}},
                "paper_series": [
                    {"at": "2026-09-30T11:00:00Z", "total_eur": "99.1", "source": "runner"},
                    {"at": "not-a-date", "total_eur": "90", "source": "bad"},
                    {"at": "2026-09-30T12:10:00", "total_eur": "90", "source": "naive"},
                    {"at": "2026-09-30T12:00:00Z", "total_eur": "NaN", "source": "bad"},
                    {"at": "2026-09-30T12:30:00Z", "total_eur": "98.8", "source": "paper_fill_bid"},
                ],
            }
        })

        self.assertEqual(result, {
            "available": True,
            "start_eur": 100.0,
            "current": {"total_eur": 98.8, "as_of": "2026-09-30T12:30:00Z", "source": "paper_fill_bid"},
            "series": [
                {"at": "2026-09-30T11:00:00Z", "total_eur": 99.1, "source": "runner"},
                {"at": "2026-09-30T12:30:00Z", "total_eur": 98.8, "source": "paper_fill_bid"},
            ],
        })

    def test_rejects_probe_data_and_public_proxy_targets(self):
        self.assertFalse(plugin_api._normalize_trading_value({
            "view": {"is_probe": True, "paper_series": []}
        })["available"])
        self.assertFalse(plugin_api._internal_trading_url("https://example.com/api/status.json"))
        self.assertFalse(plugin_api._internal_trading_url("http://8.8.8.8/api/status.json"))
        self.assertFalse(plugin_api._internal_trading_url("http://127.0.0.1/api/status.json?x=1"))
        self.assertTrue(plugin_api._internal_trading_url("http://100.109.224.79:8787/api/status.json"))

    def test_keeps_incomplete_portfolio_unknown_instead_of_using_ledger_total(self):
        result = plugin_api._normalize_trading_value({
            "view": {
                "start_eur": "100",
                "portfolio": {"total_eur": "101.2", "paper": None},
                "paper_series": [],
            }
        })

        self.assertEqual(result, {
            "available": False,
            "start_eur": 100.0,
            "current": None,
            "series": [],
        })
    def test_malformed_portfolio_shapes_return_unavailable(self):
        for portfolio in ("oops", ["oops"], {"paper": "oops"}, {"paper": [1]}):
            with self.subTest(portfolio=portfolio):
                result = plugin_api._normalize_trading_value({"view": {"portfolio": portfolio}})
                self.assertFalse(result["available"])

    def test_infers_source_by_instant_for_mixed_timezone_offsets(self):
        result = plugin_api._normalize_trading_value({
            "view": {
                "portfolio": {"paper": {"total_eur": 10, "as_of": "2026-09-30T12:30:00Z"}},
                "paper_series": [
                    {"at": "2026-09-30T14:00:00+02:00", "total_eur": 9, "source": "runner"},
                    {"at": "2026-09-30T11:00:00Z", "total_eur": 8, "source": "paper_fill_bid"},
                ],
            }
        })
        self.assertEqual(result["current"]["source"], "runner")

    def test_latest_series_mark_wins_over_an_older_snapshot(self):
        result = plugin_api._normalize_trading_value({
            "view": {
                "portfolio": {"paper": {"total_eur": 10, "as_of": "2026-09-30T12:00:00Z", "source": "snapshot"}},
                "paper_series": [{"at": "2026-09-30T12:30:00Z", "total_eur": 9, "source": "runner"}],
            }
        })
        self.assertEqual(result["current"], {
            "total_eur": 9.0, "as_of": "2026-09-30T12:30:00Z", "source": "runner",
        })

    def test_fetch_refuses_redirects_from_allowed_endpoint(self):
        requested_paths = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requested_paths.append(self.path)
                if self.path == "/api/status.json":
                    self.send_response(302)
                    self.send_header("Location", "/other.json")
                    self.end_headers()
                else:
                    body = json.dumps({"view": {"portfolio": {"paper": {
                        "total_eur": 1, "as_of": "2026-09-30T12:00:00Z"}}}}).encode()
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
            def log_message(self, format, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(plugin_api, "TRADING_SIM_URL", f"http://127.0.0.1:{server.server_port}/api/status.json"):
                with self.assertRaises(urllib.error.HTTPError) as redirect_error:
                    plugin_api._fetch_trading_payload()
                redirect_error.exception.close()
            self.assertEqual(requested_paths, ["/api/status.json"])
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    def test_empty_configured_url_fails_closed(self):
        with patch.object(plugin_api, "TRADING_SIM_URL", ""):
            with self.assertRaises(ValueError):
                plugin_api._fetch_trading_payload()


class TradingValueRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_route_returns_a_normalized_live_series(self):
        payload = {
            "view": {
                "start_eur": "100",
                "portfolio": {"paper": {"total_eur": "99", "as_of": "2026-09-30T12:00:00Z", "source": "runner"}},
                "paper_series": [{"at": "2026-09-30T12:00:00Z", "total_eur": "99", "source": "runner"}],
            }
        }
        with patch.object(plugin_api, "_fetch_trading_payload", return_value=payload):
            result = await plugin_api.get_trading_value()

        self.assertTrue(result["available"])
        self.assertEqual(result["current"]["total_eur"], 99.0)
        self.assertEqual(len(result["series"]), 1)

    async def test_route_returns_unavailable_for_malformed_upstream_shape(self):
        with patch.object(plugin_api, "_fetch_trading_payload", return_value={"view": {"paper_series": 42}}):
            result = await plugin_api.get_trading_value()

        self.assertEqual(result, {
            "available": False,
            "start_eur": None,
            "current": None,
            "series": [],
        })

    async def test_route_marks_unreachable_source_unavailable(self):
        with patch.object(plugin_api, "_fetch_trading_payload", side_effect=OSError("offline")):
            result = await plugin_api.get_trading_value()

        self.assertEqual(result, {
            "available": False,
            "start_eur": None,
            "current": None,
            "series": [],
        })


if __name__ == "__main__":
    unittest.main()
