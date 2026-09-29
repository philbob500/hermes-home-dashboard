import sys
import types
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from dashboard import plugin_api


class SubscriptionUsageApiTest(unittest.IsolatedAsyncioTestCase):
    async def test_codex_usage_is_serialized_as_provider_neutral_windows(self):
        snapshot = types.SimpleNamespace(
            provider="openai-codex",
            fetched_at=datetime(2026, 9, 29, 12, 0, tzinfo=timezone.utc),
            windows=(types.SimpleNamespace(
                label="Session",
                used_percent=11.0,
                reset_at=datetime(2026, 9, 29, 15, 0, tzinfo=timezone.utc),
            ),),
            available=True,
            unavailable_reason=None,
        )
        fake_usage = types.SimpleNamespace(fetch_account_usage=lambda provider: snapshot)

        with patch.dict(sys.modules, {"agent.account_usage": fake_usage}):
            result = await plugin_api.get_subscription_usage("openai-codex")

        self.assertEqual(result, {
            "provider": "openai-codex",
            "available": True,
            "fetched_at": "2026-09-29T12:00:00+00:00",
            "windows": [{
                "label": "Session",
                "used_percent": 11.0,
                "reset_at": "2026-09-29T15:00:00+00:00",
            }],
        })

    async def test_anthropic_uses_the_same_provider_neutral_contract(self):
        snapshot = types.SimpleNamespace(
            provider="anthropic",
            fetched_at=datetime(2026, 9, 29, 12, 0, tzinfo=timezone.utc),
            windows=(types.SimpleNamespace(
                label="Current week",
                used_percent=34.0,
                reset_at=None,
            ),),
            available=True,
            unavailable_reason=None,
        )
        calls = []
        fake_usage = types.SimpleNamespace(
            fetch_account_usage=lambda provider: calls.append(provider) or snapshot,
        )

        with patch.dict(sys.modules, {"agent.account_usage": fake_usage}):
            result = await plugin_api.get_subscription_usage("anthropic")

        self.assertEqual(calls, ["anthropic"])
        self.assertEqual(result["provider"], "anthropic")
        self.assertEqual(result["windows"][0]["label"], "Current week")
        self.assertIsNone(result["windows"][0]["reset_at"])

    async def test_unsupported_provider_is_rejected_before_fetch(self):
        with self.assertRaises(plugin_api.HTTPException) as error:
            await plugin_api.get_subscription_usage("openrouter")
        self.assertEqual(error.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
