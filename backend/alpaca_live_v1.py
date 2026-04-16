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
_ORDER_ID_PATH_SAFE_RE = re.compile(r"^[A-Fa-f0-9\-]{16,64}$")


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


def fetch_live_order_by_id_safe(
    key_id: str,
    secret: str,
    order_id: str,
    timeout: tuple[float, float] = DEFAULT_TIMEOUT,
) -> tuple[str, dict[str, Any] | None]:
    """GET /v2/orders/{order_id} on live host. Returns ("ok", dict) | ("not_found", None) | ("error", None)."""
    oid = str(order_id).strip()
    if not oid or not _ORDER_ID_PATH_SAFE_RE.match(oid):
        return "error", None
    url = f"{ALPACA_LIVE_BASE_URL}/v2/orders/{oid}"
    try:
        r = requests.get(url, headers=_headers(key_id, secret), timeout=timeout)
    except requests.RequestException:
        return "error", None
    if r.status_code == 404:
        return "not_found", None
    if r.status_code >= 400:
        return "error", None
    try:
        data = r.json()
    except ValueError:
        return "error", None
    if not isinstance(data, dict):
        return "error", None
    return "ok", data


def resolve_terminal_manual_live_order_observability(
    key_id: str,
    secret: str,
    absent_obs: dict[str, Any],
    timeout: tuple[float, float] = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """
    After reconcile says NOT IN OPEN ORDERS, one GET by order_id for Alpaca terminal status (live only).
    """
    oid = absent_obs.get("order_id")
    if oid is None or not str(oid).strip():
        return dict(absent_obs)

    kind, raw = fetch_live_order_by_id_safe(key_id, secret, str(oid), timeout)
    if kind == "not_found":
        out = dict(absent_obs)
        out["snapshot_freshness"] = "NOT IN OPEN ORDERS"
        out["truth_note"] = (
            "Not on the open-order list; Alpaca live GET /v2/orders/{id} returned 404 for this id. "
            "Terminal state still unknown (id may be invalid or no longer retrievable)."
        )
        return out

    if kind == "error":
        out = dict(absent_obs)
        out["snapshot_freshness"] = "LOOKUP FAILED / UNKNOWN"
        out["truth_note"] = (
            "Not on the open-order list; single-order live broker lookup failed (network or HTTP error). "
            "Terminal state unknown; retry POST /live/sync or check Alpaca live."
        )
        return out

    cid_expect = absent_obs.get("client_order_id")
    cid_got = raw.get("client_order_id")
    if (
        cid_expect is not None
        and str(cid_expect).strip()
        and cid_got is not None
        and str(cid_got).strip()
        and str(cid_expect).strip() != str(cid_got).strip()
    ):
        out = dict(absent_obs)
        out["snapshot_freshness"] = "LOOKUP FAILED / UNKNOWN"
        out["truth_note"] = (
            "Broker order id response client_order_id did not match HIVE's last manual live submit; "
            "refusing to show terminal state. Check Alpaca live."
        )
        return out

    out = compact_live_order_observability(raw)
    out["snapshot_freshness"] = "RESOLVED FROM BROKER ORDER LOOKUP"
    out["truth_note"] = (
        "Live: terminal/working fields from Alpaca GET /v2/orders/{id} during last live broker sync (read-only)."
    )
    return out


def reconcile_live_order_observability(
    last: dict[str, Any],
    open_orders: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Match last manual live order to Alpaca live open orders from an existing snapshot fetch (read-only).
    """
    oid = last.get("order_id")
    cid = last.get("client_order_id")

    if last.get("snapshot_freshness") == "RESOLVED FROM BROKER ORDER LOOKUP" and oid is not None:
        still_open = False
        for o in open_orders:
            if not isinstance(o, dict):
                continue
            if str(o.get("id") or "") == str(oid):
                still_open = True
                break
            if cid is not None and str(o.get("client_order_id") or "") == str(cid):
                still_open = True
                break
        if not still_open:
            return dict(last)

    match: dict[str, Any] | None = None
    for o in open_orders:
        if not isinstance(o, dict):
            continue
        if oid is not None and str(o.get("id") or "") == str(oid):
            match = o
            break
        if cid is not None and str(o.get("client_order_id") or "") == str(cid):
            match = o
            break

    if match is not None:
        out = compact_live_order_observability(match)
        out["snapshot_freshness"] = "REFRESHED FROM OPEN ORDERS"
        out["truth_note"] = (
            "Live: row matched Alpaca open orders on the last broker read; still working until a terminal state."
        )
        return out

    prior = last.get("broker_status")
    if prior is None:
        prior = last.get("prior_broker_status")

    return {
        "order_id": last.get("order_id"),
        "client_order_id": last.get("client_order_id"),
        "symbol": last.get("symbol"),
        "side": last.get("side"),
        "order_type": last.get("order_type"),
        "broker_status": None,
        "prior_broker_status": prior,
        "hive_lifecycle_label": "NOT IN OPEN ORDERS",
        "qty": last.get("qty"),
        "filled_qty": last.get("filled_qty"),
        "filled_avg_price": last.get("filled_avg_price"),
        "submitted_at": last.get("submitted_at"),
        "filled_at": last.get("filled_at"),
        "canceled_at": last.get("canceled_at"),
        "expired_at": last.get("expired_at"),
        "snapshot_freshness": "NOT IN OPEN ORDERS",
        "truth_note": (
            "Live: this order ID is not on Alpaca's open-order list after the last broker read. "
            "That does not prove a fill; it may be filled, canceled, expired, or otherwise closed; confirm in Alpaca live."
        ),
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
