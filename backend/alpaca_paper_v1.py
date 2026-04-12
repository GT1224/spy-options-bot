"""
HIVE H1A — Alpaca paper trading API read-only client.

Hard-locked paper host only. No live routing, no env base URL override.
"""

from __future__ import annotations

import os
from typing import Any

import requests

# Paper only — never substitute from environment.
ALPACA_PAPER_BASE_URL = "https://paper-api.alpaca.markets"

_ENV_KEY_ID = "ALPACA_PAPER_KEY_ID"
_ENV_SECRET = "ALPACA_PAPER_SECRET_KEY"

# (connect timeout, read timeout) — keep GET /state responsive.
DEFAULT_TIMEOUT = (1.5, 2.5)


class AlpacaPaperError(Exception):
    """Non-sensitive error for operators/logs (no secrets, no raw response bodies)."""


def load_paper_credentials() -> tuple[str | None, str | None]:
    key_id = os.getenv(_ENV_KEY_ID, "").strip()
    secret = os.getenv(_ENV_SECRET, "").strip()
    if not key_id or not secret:
        return None, None
    return key_id, secret


def _headers(key_id: str, secret: str) -> dict[str, str]:
    return {
        "APCA-API-KEY-ID": key_id,
        "APCA-API-SECRET-KEY": secret,
    }


def _get_json(path: str, key_id: str, secret: str, timeout: tuple[float, float]) -> Any:
    url = f"{ALPACA_PAPER_BASE_URL}{path}"
    try:
        r = requests.get(
            url,
            headers=_headers(key_id, secret),
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise AlpacaPaperError(f"broker request failed ({type(e).__name__})") from e

    if r.status_code >= 400:
        raise AlpacaPaperError(f"broker HTTP {r.status_code}")

    try:
        return r.json()
    except ValueError as e:
        raise AlpacaPaperError("broker returned non-JSON") from e


def fetch_account(key_id: str, secret: str, timeout: tuple[float, float] = DEFAULT_TIMEOUT) -> dict[str, Any]:
    data = _get_json("/v2/account", key_id, secret, timeout)
    if not isinstance(data, dict):
        raise AlpacaPaperError("broker account payload invalid")
    return data


def fetch_positions(key_id: str, secret: str, timeout: tuple[float, float] = DEFAULT_TIMEOUT) -> list[dict[str, Any]]:
    data = _get_json("/v2/positions", key_id, secret, timeout)
    if not isinstance(data, list):
        raise AlpacaPaperError("broker positions payload invalid")
    return [p for p in data if isinstance(p, dict)]


def fetch_open_orders(key_id: str, secret: str, timeout: tuple[float, float] = DEFAULT_TIMEOUT) -> list[dict[str, Any]]:
    data = _get_json("/v2/orders?status=open&limit=100", key_id, secret, timeout)
    if not isinstance(data, list):
        raise AlpacaPaperError("broker orders payload invalid")
    return [o for o in data if isinstance(o, dict)]


def _f(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def aggregate_spy_equity_position(positions: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Single consolidated SPY equity line for HIVE open_position; None if flat."""
    spy_rows = [p for p in positions if str(p.get("symbol", "")).upper() == "SPY"]
    if not spy_rows:
        return None

    total_qty = 0.0
    total_mv = 0.0
    total_upl = 0.0
    wap_num = 0.0

    for p in spy_rows:
        q = _f(p.get("qty"))
        if q is None:
            continue
        total_qty += q
        mv = _f(p.get("market_value"))
        if mv is not None:
            total_mv += mv
        upl = _f(p.get("unrealized_pl"))
        if upl is not None:
            total_upl += upl
        avg = _f(p.get("avg_entry_price"))
        if avg is not None and q != 0:
            wap_num += abs(q) * avg

    if abs(total_qty) < 1e-9:
        return None

    avg_entry = None
    if abs(total_qty) > 1e-9 and wap_num > 0:
        avg_entry = wap_num / abs(total_qty)

    return {
        "symbol": "SPY",
        "qty": total_qty,
        "side": "long" if total_qty >= 0 else "short",
        "avg_entry_price": round(avg_entry, 4) if avg_entry is not None else None,
        "market_value": round(total_mv, 2),
        "unrealized_pl": round(total_upl, 2),
    }


def sum_unrealized_pl(positions: list[dict[str, Any]]) -> float | None:
    total = 0.0
    any_ok = False
    for p in positions:
        v = _f(p.get("unrealized_pl"))
        if v is not None:
            total += v
            any_ok = True
    return round(total, 2) if any_ok else None


def read_paper_portfolio_snapshot(
    key_id: str,
    secret: str,
    timeout: tuple[float, float] = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """
    Fetches account + positions + open orders from paper API.
    Returns dict: cash, equity, open_position (SPY or None), unrealized_pnl, open_orders_count.
    """
    acct = fetch_account(key_id, secret, timeout)
    pos = fetch_positions(key_id, secret, timeout)
    orders = fetch_open_orders(key_id, secret, timeout)

    cash = _f(acct.get("cash"))
    equity = _f(acct.get("equity"))
    if cash is None:
        raise AlpacaPaperError("broker account missing cash")
    if equity is None:
        raise AlpacaPaperError("broker account missing equity")

    upl = sum_unrealized_pl(pos)
    op = aggregate_spy_equity_position(pos)

    return {
        "cash": round(cash, 2),
        "equity": round(equity, 2),
        "open_position": op,
        "unrealized_pnl": upl,
        "open_orders_count": len(orders),
    }
