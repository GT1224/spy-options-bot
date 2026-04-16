"""
HIVE W5-LIVE-1 — Alpaca live trading API (isolated read + minimal SPY equity submit).

Hard-locked live host only. No paper keys, no paper base URL, no env override of host.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

# Live trading API only — never substitute from environment.
ALPACA_LIVE_BASE_URL = "https://api.alpaca.markets"

_ENV_KEY_ID = "ALPACA_LIVE_KEY_ID"
_ENV_SECRET = "ALPACA_LIVE_SECRET_KEY"

DEFAULT_TIMEOUT = (1.5, 2.5)
LIVE_ORDER_PREFLIGHT_TIMEOUT = (1.0, 2.5)
SUBMIT_TIMEOUT = (1.5, 5.0)

_CLIENT_ORDER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,48}$")


class AlpacaLiveError(Exception):
    """Non-sensitive error for operators/logs (no secrets, no raw response bodies)."""


def load_live_credentials() -> tuple[str | None, str | None]:
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
    url = f"{ALPACA_LIVE_BASE_URL}{path}"
    try:
        r = requests.get(url, headers=_headers(key_id, secret), timeout=timeout)
    except requests.RequestException as e:
        raise AlpacaLiveError(f"broker request failed ({type(e).__name__})") from e
    if r.status_code >= 400:
        raise AlpacaLiveError(f"broker HTTP {r.status_code}")
    try:
        return r.json()
    except ValueError as e:
        raise AlpacaLiveError("broker returned non-JSON") from e


def _post_json(
    path: str,
    key_id: str,
    secret: str,
    payload: dict[str, Any],
    timeout: tuple[float, float],
) -> dict[str, Any]:
    url = f"{ALPACA_LIVE_BASE_URL}{path}"
    try:
        r = requests.post(
            url,
            headers={**_headers(key_id, secret), "Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise AlpacaLiveError(f"broker request failed ({type(e).__name__})") from e
    if r.status_code >= 400:
        raise AlpacaLiveError(f"broker HTTP {r.status_code}")
    try:
        data = r.json()
    except ValueError as e:
        raise AlpacaLiveError("broker returned non-JSON") from e
    if not isinstance(data, dict):
        raise AlpacaLiveError("broker order payload invalid")
    return data


def validate_live_client_order_id(client_order_id: str) -> str | None:
    if not isinstance(client_order_id, str) or not client_order_id.strip():
        return "client_order_id is required"
    cid = client_order_id.strip()
    if not _CLIENT_ORDER_ID_RE.match(cid):
        return "client_order_id must be 1–48 chars: letters, digits, underscore, hyphen"
    return None


def _f(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def sum_unrealized_pl(positions: list[dict[str, Any]]) -> float | None:
    total = 0.0
    any_ok = False
    for p in positions:
        v = _f(p.get("unrealized_pl"))
        if v is not None:
            total += v
            any_ok = True
    return round(total, 2) if any_ok else None


def aggregate_spy_equity_position(positions: list[dict[str, Any]]) -> dict[str, Any] | None:
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


def fetch_live_account(key_id: str, secret: str, timeout: tuple[float, float] = DEFAULT_TIMEOUT) -> dict[str, Any]:
    data = _get_json("/v2/account", key_id, secret, timeout)
    if not isinstance(data, dict):
        raise AlpacaLiveError("broker account payload invalid")
    return data


def fetch_live_positions(key_id: str, secret: str, timeout: tuple[float, float] = DEFAULT_TIMEOUT) -> list[dict[str, Any]]:
    data = _get_json("/v2/positions", key_id, secret, timeout)
    if not isinstance(data, list):
        raise AlpacaLiveError("broker positions payload invalid")
    return [p for p in data if isinstance(p, dict)]


def fetch_live_open_orders(key_id: str, secret: str, timeout: tuple[float, float] = DEFAULT_TIMEOUT) -> list[dict[str, Any]]:
    data = _get_json("/v2/orders?status=open&limit=100", key_id, secret, timeout)
    if not isinstance(data, list):
        raise AlpacaLiveError("broker orders payload invalid")
    return [o for o in data if isinstance(o, dict)]


def read_live_portfolio_snapshot(
    key_id: str,
    secret: str,
    timeout: tuple[float, float] = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """
    Fetches account + positions + open orders from live API.
    Same key shape as paper preflight for backend reuse.
    """
    acct = fetch_live_account(key_id, secret, timeout)
    pos = fetch_live_positions(key_id, secret, timeout)
    orders = fetch_live_open_orders(key_id, secret, timeout)

    cash = _f(acct.get("cash"))
    equity = _f(acct.get("equity"))
    if cash is None:
        raise AlpacaLiveError("broker account missing cash")
    if equity is None:
        raise AlpacaLiveError("broker account missing equity")

    upl = sum_unrealized_pl(pos)
    op = aggregate_spy_equity_position(pos)

    spy_open_order_count = sum(
        1 for o in orders if isinstance(o, dict) and str(o.get("symbol", "")).upper() == "SPY"
    )

    return {
        "cash": round(cash, 2),
        "equity": round(equity, 2),
        "open_position": op,
        "unrealized_pnl": upl,
        "open_orders_count": len(orders),
        "spy_open_order_count": spy_open_order_count,
        "open_orders": orders,
    }


def compact_live_order_observability(raw: dict[str, Any]) -> dict[str, Any]:
    """Read-only projection of Alpaca /v2/orders for live manual equity (naming distinct from paper)."""
    st_raw = raw.get("status")
    st = str(st_raw).strip().lower() if st_raw is not None else ""

    def _num(x: Any) -> float | None:
        if x is None:
            return None
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    qty = _num(raw.get("qty"))
    filled_qty = _num(raw.get("filled_qty"))
    fap = _num(raw.get("filled_avg_price"))

    if st == "filled":
        label = "FILLED"
    elif st == "partially_filled":
        label = "PARTIAL FILL"
    elif st == "canceled":
        label = "CANCELED"
    elif st == "expired":
        label = "EXPIRED"
    elif st == "rejected":
        label = "REJECTED"
    elif st == "done_for_day":
        label = "DONE FOR DAY"
    elif st in (
        "new",
        "accepted",
        "pending_new",
        "accepted_for_bidding",
        "pending_cancel",
        "pending_replace",
        "held",
        "calculated",
    ):
        label = "ACCEPTED / WORKING"
    elif st in ("replaced",):
        label = "REPLACED"
    elif st in ("stopped", "suspended"):
        label = "BROKER HELD"
    elif not st:
        label = "STATUS UNKNOWN"
    else:
        label = "STATUS UNKNOWN"

    return {
        "order_id": raw.get("id"),
        "client_order_id": raw.get("client_order_id"),
        "symbol": raw.get("symbol"),
        "side": raw.get("side"),
        "order_type": raw.get("type") or raw.get("order_type"),
        "broker_status": raw.get("status"),
        "hive_lifecycle_label": label,
        "qty": qty,
        "filled_qty": filled_qty,
        "filled_avg_price": round(fap, 4) if fap is not None else None,
        "submitted_at": raw.get("submitted_at"),
        "filled_at": raw.get("filled_at"),
        "canceled_at": raw.get("canceled_at"),
        "expired_at": raw.get("expired_at"),
    }


def submit_spy_equity_live_order(
    key_id: str,
    secret: str,
    *,
    side: str,
    qty: int,
    limit_price: float,
    client_order_id: str,
    timeout: tuple[float, float] = SUBMIT_TIMEOUT,
) -> dict[str, Any]:
    """POST /v2/orders — SPY stock only, limit only (probation slice)."""
    su = side.lower().strip()
    if su not in ("buy", "sell"):
        raise AlpacaLiveError("side must be buy or sell")
    if qty != 1:
        raise AlpacaLiveError("qty must be 1 for live probation slice")
    if limit_price <= 0:
        raise AlpacaLiveError("limit_price must be positive")
    err = validate_live_client_order_id(client_order_id)
    if err:
        raise AlpacaLiveError(err)

    body: dict[str, Any] = {
        "symbol": "SPY",
        "qty": "1",
        "side": su,
        "type": "limit",
        "limit_price": f"{float(limit_price):.4f}",
        "time_in_force": "day",
        "client_order_id": client_order_id.strip(),
    }
    return _post_json("/v2/orders", key_id, secret, body, timeout)
