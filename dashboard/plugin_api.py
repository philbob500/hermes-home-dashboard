"""Home dashboard plugin backend.

Mounted at /api/plugins/home-dashboard/ by the Hermes dashboard host.
Persists the widget layout to a JSON file inside the plugin's own directory
so it survives Hermes updates (the plugin lives under ~/.hermes/plugins/,
outside the repo that `git reset --hard` touches).
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

try:
    from hermes_constants import get_hermes_home
except ImportError:  # pragma: no cover - allows standalone unit tests
    import os as _os

    def get_hermes_home() -> Path:  # type: ignore[misc]
        val = (_os.environ.get("HERMES_HOME") or "").strip()
        return Path(val) if val else Path.home() / ".hermes"

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
except Exception:  # pragma: no cover - allows local unit tests
    class APIRouter:  # type: ignore
        def get(self, *_a, **_k):
            return lambda fn: fn

        def put(self, *_a, **_k):
            return lambda fn: fn

    class BaseModel:  # type: ignore
        pass

    class HTTPException(Exception):  # type: ignore
        def __init__(self, status_code: int, detail: str = "") -> None:
            self.status_code = status_code
            self.detail = detail


router = APIRouter()

LAYOUT_FILE = get_hermes_home() / "plugins" / "home-dashboard" / "layout.json"
_MAX_WIDGETS = 64


def _valid_layout(layout: Any) -> bool:
    if not isinstance(layout, dict) or layout.get("version") not in {1, 2}:
        return False
    widgets = layout.get("widgets")
    if not isinstance(widgets, list) or len(widgets) > _MAX_WIDGETS:
        return False
    for w in widgets:
        if not isinstance(w, dict) or not isinstance(w.get("id"), str):
            return False
        if not all(isinstance(w.get(k), int) for k in ("gx", "gy", "gw", "gh")):
            return False
    return True


@router.get("/layout")
async def get_layout() -> Dict[str, Any]:
    """Return the saved layout, or {"layout": null} for the client default."""
    if LAYOUT_FILE.exists():
        try:
            data = json.loads(LAYOUT_FILE.read_text("utf-8"))
            if _valid_layout(data):
                return {"layout": data}
        except Exception:
            pass
    return {"layout": None}


class LayoutBody(BaseModel):
    layout: dict


@router.put("/layout")
async def set_layout(body: "LayoutBody") -> Dict[str, Any]:
    """Persist the widget layout (positions/sizes/per-widget props)."""
    if not _valid_layout(body.layout):
        raise HTTPException(status_code=400, detail="invalid layout document")
    LAYOUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text(json.dumps(body.layout), encoding="utf-8")
    return {"ok": True}


# Hermes Desktop deliberately exposes plugin-scoped REST instead of a generic
# core-API escape hatch.  These read-only routes adapt the same current Hermes
# services the web dashboard uses, keeping the Desktop bundle inside its public
# ``ctx.rest`` boundary while preserving the richer Home widgets.
@router.get("/system")
async def get_desktop_system() -> Dict[str, Any]:
    from hermes_cli.web_routers.status import get_system_stats

    return await get_system_stats()


@router.get("/analytics")
async def get_desktop_analytics(days: int = 30, profile: str | None = None) -> Dict[str, Any]:
    from hermes_cli.web_routers.analytics import get_usage_analytics

    return await get_usage_analytics(days=max(1, min(365, days)), profile=profile)


@router.get("/cron")
async def get_desktop_cron(profile: str = "all") -> list[Dict[str, Any]]:
    from hermes_cli.web_routers.cron import list_cron_jobs

    return await list_cron_jobs(profile=profile or "all")


@router.get("/sessions")
async def get_desktop_sessions(
    limit: int = 20,
    offset: int = 0,
    profile: str | None = None,
) -> Dict[str, Any]:
    from hermes_cli.web_routers.sessions import get_sessions

    return await asyncio.to_thread(
        get_sessions,
        limit=max(1, min(100, limit)),
        offset=max(0, offset),
        order="recent",
        profile=profile,
    )


@router.get("/subscription-usage/{provider}")
async def get_subscription_usage(provider: str) -> Dict[str, Any]:
    """Read normalized account quota windows for provider-specific Home widgets."""
    key = str(provider or "").strip().lower()
    if key not in {"openai-codex", "anthropic"}:
        raise HTTPException(status_code=404, detail="unsupported subscription provider")

    from agent.account_usage import fetch_account_usage

    snapshot = await asyncio.to_thread(fetch_account_usage, key)
    if snapshot is None:
        return {"provider": key, "available": False, "fetched_at": None, "windows": []}
    return {
        "provider": snapshot.provider,
        "available": snapshot.available,
        "fetched_at": snapshot.fetched_at.isoformat(),
        "windows": [
            {
                "label": window.label,
                "used_percent": window.used_percent,
                "reset_at": window.reset_at.isoformat() if window.reset_at else None,
            }
            for window in snapshot.windows
        ],
    }


# DeepSeek exposes no quota windows — it is prepaid credit. Resetwatch reads the
# same endpoint; the balance is the only number the provider publishes.
DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance"
# Official peak windows, Monday-Friday UTC. Off-peak calls cost half price.
DEEPSEEK_PEAK_WINDOWS_UTC = ((1, 4), (6, 10))


def _api_key(name: str) -> str:
    """Read a key from the process environment, else from this profile's .env."""
    value = (os.environ.get(name) or "").strip()
    if value:
        return value
    try:
        for line in (get_hermes_home() / ".env").read_text("utf-8").splitlines():
            key, separator, raw = line.partition("=")
            if separator and key.strip() == name:
                return raw.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def deepseek_peak_now(now: datetime | None = None) -> bool:
    """True inside DeepSeek's peak pricing windows (Mon-Fri, UTC)."""
    stamp = now or datetime.now(timezone.utc)
    stamp = stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp.astimezone(timezone.utc)
    minutes = stamp.hour * 60 + stamp.minute
    return stamp.weekday() < 5 and any(
        start * 60 <= minutes < end * 60 for start, end in DEEPSEEK_PEAK_WINDOWS_UTC
    )


def _deepseek_money(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value.strip().replace(",", ""))
        except ValueError:
            return None
    return None


def _fetch_deepseek_balance(key: str) -> Dict[str, Any]:
    import httpx

    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            DEEPSEEK_BALANCE_URL,
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
    return payload if isinstance(payload, dict) else {}


@router.get("/balance/deepseek")
async def get_deepseek_balance() -> Dict[str, Any]:
    """Prepaid credit of the DeepSeek account configured on this machine."""
    peak = deepseek_peak_now()
    key = _api_key("DEEPSEEK_API_KEY")
    if not key:
        return {"provider": "deepseek", "available": False, "fetched_at": None, "peak": peak, "reason": "no_api_key"}
    try:
        payload = await asyncio.to_thread(_fetch_deepseek_balance, key)
    except Exception:
        return {"provider": "deepseek", "available": False, "fetched_at": None, "peak": peak, "reason": "unreachable"}

    infos = [item for item in payload.get("balance_infos") or [] if isinstance(item, dict)]
    chosen = next(
        (item for item in infos if str(item.get("currency") or "").strip().upper() == "USD"),
        infos[0] if infos else None,
    )
    total = _deepseek_money((chosen or {}).get("total_balance"))
    if chosen is None or total is None:
        return {"provider": "deepseek", "available": False, "fetched_at": None, "peak": peak, "reason": "no_balance"}

    return {
        "provider": "deepseek",
        "available": payload.get("is_available") is not False,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "peak": peak,
        "currency": str(chosen.get("currency") or "USD").strip().upper() or "USD",
        "total": total,
        "topped_up": _deepseek_money(chosen.get("topped_up_balance")),
        "granted": _deepseek_money(chosen.get("granted_balance")),
    }
