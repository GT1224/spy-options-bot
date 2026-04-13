"""
HIVE H1A/H1B — Alpaca paper trading API client (read + minimal SPY equity submit).

Hard-locked paper host only. No live routing, no env base URL override.

OPTIONS-PAPER-EXEC-1: single-leg SPY option contract resolve + limit buy-to-open only (paper).
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import requests

# Paper only — never substitute from environment.
ALPACA_PAPER_BASE_URL = "https://paper-api.alpaca.markets"

_ENV_KEY_ID = "ALPACA_PAPER_KEY_ID"
_ENV_SECRET = "ALPACA_PAPER_SECRET_KEY"

# (connect timeout, read timeout) — keep GET /state responsive.
DEFAULT_TIMEOUT = (1.5, 2.5)
# Mandatory broker read before paper submit admission (H3) — tight bounds, fail closed.
PAPER_ORDER_PREFLIGHT_TIMEOUT = (1.0, 2.5)
# Submit can be slightly slower than read-only snapshots.
SUBMIT_TIMEOUT = (1.5, 5.0)

_CLIENT_ORDER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,48}$")


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


_ORDER_ID_PATH_SAFE_RE = re.compile(r"^[A-Fa-f0-9\-]{16,64}$")


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


def _post_json(
    path: str,
    key_id: str,
    secret: str,
    payload: dict[str, Any],
    timeout: tuple[float, float],
) -> dict[str, Any]:
    url = f"{ALPACA_PAPER_BASE_URL}{path}"
    try:
        r = requests.post(
            url,
            headers={**_headers(key_id, secret), "Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=timeout,
        )
    except requests.RequestException as e:
        raise AlpacaPaperError(f"broker request failed ({type(e).__name__})") from e

    if r.status_code >= 400:
        raise AlpacaPaperError(f"broker HTTP {r.status_code}")

    try:
        data = r.json()
    except ValueError as e:
        raise AlpacaPaperError("broker returned non-JSON") from e
    if not isinstance(data, dict):
        raise AlpacaPaperError("broker order payload invalid")
    return data


def validate_client_order_id(client_order_id: str) -> str | None:
    """Returns error message if invalid, else None."""
    if not isinstance(client_order_id, str) or not client_order_id.strip():
        return "client_order_id is required"
    cid = client_order_id.strip()
    if not _CLIENT_ORDER_ID_RE.match(cid):
        return "client_order_id must be 1–48 chars: letters, digits, underscore, hyphen"
    return None


def submit_spy_equity_order(
    key_id: str,
    secret: str,
    *,
    side: str,
    qty: int,
    order_type: str,
    limit_price: float | None,
    client_order_id: str,
    timeout: tuple[float, float] = SUBMIT_TIMEOUT,
) -> dict[str, Any]:
    """
    POST /v2/orders — SPY stock only (equity). No options / multi-leg.
    """
    su = side.lower().strip()
    if su not in ("buy", "sell"):
        raise AlpacaPaperError("side must be buy or sell")
    ot = order_type.lower().strip()
    if ot not in ("market", "limit"):
        raise AlpacaPaperError("order_type must be market or limit")
    if qty < 1:
        raise AlpacaPaperError("qty must be positive")
    err = validate_client_order_id(client_order_id)
    if err:
        raise AlpacaPaperError(err)

    body: dict[str, Any] = {
        "symbol": "SPY",
        "qty": str(int(qty)),
        "side": su,
        "type": ot,
        "time_in_force": "day",
        "client_order_id": client_order_id.strip(),
    }
    if ot == "limit":
        if limit_price is None or limit_price <= 0:
            raise AlpacaPaperError("limit_price required and positive for limit orders")
        body["limit_price"] = f"{float(limit_price):.4f}"

    return _post_json("/v2/orders", key_id, secret, body, timeout)


def compact_paper_order_observability(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Read-only projection of an Alpaca /v2/orders object for HIVE operator UI.
    No broker calls; maps broker status -> stable hive_lifecycle_label.
    """
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


def fetch_order_by_id_safe(
    key_id: str,
    secret: str,
    order_id: str,
    timeout: tuple[float, float] = DEFAULT_TIMEOUT,
) -> tuple[str, dict[str, Any] | None]:
    """
    GET /v2/orders/{order_id} — single-order read for terminal truth.
    Returns ("ok", dict) | ("not_found", None) | ("error", None). No secrets in return value.
    """
    oid = str(order_id).strip()
    if not oid or not _ORDER_ID_PATH_SAFE_RE.match(oid):
        return "error", None
    url = f"{ALPACA_PAPER_BASE_URL}/v2/orders/{oid}"
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


def resolve_terminal_manual_paper_order_observability(
    key_id: str,
    secret: str,
    absent_obs: dict[str, Any],
    timeout: tuple[float, float] = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """
    After reconcile says NOT IN OPEN ORDERS, one GET by order_id for Alpaca terminal status.
    Never claims FILLED unless broker response status maps to FILLED in compact_paper_order_observability.
    """
    oid = absent_obs.get("order_id")
    if oid is None or not str(oid).strip():
        return dict(absent_obs)

    kind, raw = fetch_order_by_id_safe(key_id, secret, str(oid), timeout)
    if kind == "not_found":
        out = dict(absent_obs)
        out["snapshot_freshness"] = "NOT IN OPEN ORDERS"
        out["truth_note"] = (
            "Not on the open-order list; Alpaca GET /v2/orders/{id} returned 404 for this id. "
            "Terminal state still unknown (id may be invalid or no longer retrievable)."
        )
        return out

    if kind == "error":
        out = dict(absent_obs)
        out["snapshot_freshness"] = "LOOKUP FAILED / UNKNOWN"
        out["truth_note"] = (
            "Not on the open-order list; single-order broker lookup failed (network or HTTP error). "
            "Terminal state unknown; retry Sync broker or check Alpaca."
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
            "Broker order id response client_order_id did not match HIVE's last manual submit; "
            "refusing to show terminal state. Check Alpaca."
        )
        return out

    out = compact_paper_order_observability(raw)
    out["snapshot_freshness"] = "RESOLVED FROM BROKER ORDER LOOKUP"
    out["truth_note"] = (
        "Terminal/working fields from Alpaca GET /v2/orders/{id} during last broker sync (read-only)."
    )
    return out


def reconcile_paper_order_observability(
    last: dict[str, Any],
    open_orders: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Re-read-only: match last manual paper order to Alpaca open orders from an existing snapshot fetch.
    Never infers FILLED; if absent from open list, label truthfully as not open (terminal state unknown).
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
        out = compact_paper_order_observability(match)
        out["snapshot_freshness"] = "REFRESHED FROM OPEN ORDERS"
        out["truth_note"] = (
            "Row matched Alpaca open orders on the last broker read; still working until Alpaca shows a terminal state."
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
            "This order ID is not on Alpaca's open-order list after the last broker read. "
            "That does not prove a fill; it may be filled, canceled, expired, or otherwise closed; confirm in Alpaca."
        ),
    }


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
    Returns dict: cash, equity, open_position (SPY or None), unrealized_pnl, open_orders_count,
    spy_open_order_count (open working orders for symbol SPY).
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

    spy_open_order_count = sum(
        1
        for o in orders
        if isinstance(o, dict) and str(o.get("symbol", "")).upper() == "SPY"
    )

    return {
        "cash": round(cash, 2),
        "equity": round(equity, 2),
        "open_position": op,
        "unrealized_pnl": upl,
        "open_orders_count": len(orders),
        "spy_open_order_count": spy_open_order_count,
        # Same GET as open_orders_count — exposed only for in-process reconcile (no extra broker round-trip).
        "open_orders": orders,
    }


# --- OPTIONS-PAPER-EXEC-1 (SPY single-leg, paper trading API only) ---

# OCC-style SPY option ticker: SPY + YYMMDD + C|P + 8-digit strike (strike × 1e3, zero-padded).
_SPY_OPTION_OCC_RE = re.compile(r"^SPY\d{6}[CP]\d{8}$", re.IGNORECASE)


def is_spy_option_occ_symbol(symbol: str) -> bool:
    s = str(symbol or "").strip().upper()
    return bool(s and _SPY_OPTION_OCC_RE.match(s))


def spy_option_exposure_preflight(
    positions: list[dict[str, Any]],
    open_orders: list[dict[str, Any]],
) -> tuple[bool, str]:
    """True if any open SPY option position or working order exists (fail closed for auto options)."""
    for p in positions:
        if not isinstance(p, dict):
            continue
        sym = str(p.get("symbol", "")).strip().upper()
        if is_spy_option_occ_symbol(sym):
            return True, f"open SPY option position: {sym}"
    for o in open_orders:
        if not isinstance(o, dict):
            continue
        sym = str(o.get("symbol", "")).strip().upper()
        if is_spy_option_occ_symbol(sym):
            return True, f"open SPY option order: {sym}"
    return False, ""


def _parse_date(d: str) -> date | None:
    if not d or not isinstance(d, str):
        return None
    try:
        return date.fromisoformat(d.strip()[:10])
    except ValueError:
        return None


def _strike_float(contract: dict[str, Any]) -> float | None:
    raw = contract.get("strike_price")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _open_interest_int(contract: dict[str, Any]) -> int | None:
    raw = contract.get("open_interest")
    if raw is None:
        return None
    try:
        return int(float(str(raw).strip()))
    except (TypeError, ValueError):
        return None


def _close_price_float(contract: dict[str, Any]) -> float | None:
    raw = contract.get("close_price")
    if raw is None:
        return None
    try:
        v = float(str(raw).strip())
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def fetch_spy_option_contracts(
    key_id: str,
    secret: str,
    *,
    option_type: str,
    expiration_date_gte: str,
    expiration_date_lte: str,
    timeout: tuple[float, float],
) -> list[dict[str, Any]]:
    """GET /v2/options/contracts with pagination (paper trading host)."""
    ot = option_type.strip().lower()
    if ot not in ("call", "put"):
        raise AlpacaPaperError("option_type must be call or put")

    out: list[dict[str, Any]] = []
    page_token: str | None = None
    for _ in range(25):
        q: dict[str, Any] = {
            "underlying_symbols": "SPY",
            "type": ot,
            "status": "active",
            "expiration_date_gte": expiration_date_gte,
            "expiration_date_lte": expiration_date_lte,
            "limit": "1000",
        }
        if page_token:
            q["page_token"] = page_token
        path = f"/v2/options/contracts?{urlencode(q)}"
        data = _get_json(path, key_id, secret, timeout)
        if not isinstance(data, dict):
            raise AlpacaPaperError("options contracts payload invalid")
        chunk = data.get("option_contracts")
        if not isinstance(chunk, list):
            raise AlpacaPaperError("option_contracts missing")
        for row in chunk:
            if isinstance(row, dict):
                out.append(row)
        npt = data.get("next_page_token")
        page_token = npt if isinstance(npt, str) and npt.strip() else None
        if not page_token:
            break
    return out


def resolve_spy_paper_option_contract_v1(
    key_id: str,
    secret: str,
    *,
    structure: str,
    target_dte: int,
    target_delta: float,
    underlying_spot: float,
    timeout: tuple[float, float],
    min_open_interest: int = 30,
) -> dict[str, Any]:
    """
    Pick one tradable SPY option contract: expiry closest to target_dte (calendar days),
    strike heuristically near target_delta vs spot (no options data-API; uses close_price + OI only).
    long_call / long_put only. Fails closed if no suitable contract.
    """
    st = str(structure or "").strip().lower()
    if st == "long_call":
        opt_type = "call"
    elif st == "long_put":
        opt_type = "put"
    else:
        raise AlpacaPaperError("structure must be long_call or long_put")

    if underlying_spot <= 0:
        raise AlpacaPaperError("underlying_spot must be positive")

    try:
        td = int(target_dte)
    except (TypeError, ValueError):
        td = 4
    td = max(1, min(21, td))

    try:
        delta_t = float(target_delta)
    except (TypeError, ValueError):
        delta_t = 0.40
    delta_t = max(0.15, min(0.55, delta_t))

    today = datetime.now(timezone.utc).date()
    gte = today.isoformat()
    lte = (today + timedelta(days=28)).isoformat()

    contracts = fetch_spy_option_contracts(
        key_id,
        secret,
        option_type=opt_type,
        expiration_date_gte=gte,
        expiration_date_lte=lte,
        timeout=timeout,
    )

    # Delta proxy: slightly OTM single-leg — move strike away from spot as delta moves below ~0.5 ATM.
    away = max(0.0, (0.48 - delta_t)) * 0.35
    if opt_type == "call":
        target_strike = underlying_spot * (1.0 + away)
    else:
        target_strike = underlying_spot * (1.0 - away)

    candidates: list[dict[str, Any]] = []
    for c in contracts:
        if not bool(c.get("tradable")):
            continue
        if str(c.get("status", "")).lower() != "active":
            continue
        exp = _parse_date(str(c.get("expiration_date") or ""))
        if exp is None:
            continue
        strike = _strike_float(c)
        if strike is None or strike <= 0:
            continue
        oi = _open_interest_int(c)
        if oi is not None and oi < min_open_interest:
            continue
        cp = _close_price_float(c)
        if cp is None:
            continue
        dte_actual = (exp - today).days
        if dte_actual < 1:
            continue
        candidates.append(c)

    if not candidates:
        raise AlpacaPaperError("no SPY option contracts passed liquidity/close_price filters")

    def _expiry_key(c: dict[str, Any]) -> tuple[int, float]:
        exp = _parse_date(str(c.get("expiration_date") or ""))
        assert exp is not None
        dte_actual = (exp - today).days
        return (abs(dte_actual - td), float(exp.toordinal()))

    tier = min(_expiry_key(c)[0] for c in candidates)
    exp_matched = [c for c in candidates if _expiry_key(c)[0] == tier]
    best = min(
        exp_matched,
        key=lambda c: abs((_strike_float(c) or 0.0) - target_strike),
    )

    sym = str(best.get("symbol") or "").strip().upper()
    if not is_spy_option_occ_symbol(sym):
        raise AlpacaPaperError("resolved contract symbol failed OCC shape check")

    return {
        "symbol": sym,
        "id": best.get("id"),
        "expiration_date": best.get("expiration_date"),
        "strike_price": _strike_float(best),
        "type": best.get("type"),
        "close_price": _close_price_float(best),
        "open_interest": _open_interest_int(best),
    }


def submit_spy_option_limit_buy_open(
    key_id: str,
    secret: str,
    *,
    symbol: str,
    qty: int,
    limit_price: float,
    client_order_id: str,
    timeout: tuple[float, float] = SUBMIT_TIMEOUT,
) -> dict[str, Any]:
    """
    Single-leg buy-to-open style: side=buy, US option symbol, limit order (marketable cap).
    Paper trading API /v2/orders only.
    """
    sym = str(symbol or "").strip().upper()
    if not is_spy_option_occ_symbol(sym):
        raise AlpacaPaperError("invalid SPY option symbol for submit")
    if qty < 1:
        raise AlpacaPaperError("qty must be positive")
    if limit_price <= 0:
        raise AlpacaPaperError("limit_price must be positive")
    err = validate_client_order_id(client_order_id)
    if err:
        raise AlpacaPaperError(err)

    body: dict[str, Any] = {
        "symbol": sym,
        "qty": str(int(qty)),
        "side": "buy",
        "type": "limit",
        "limit_price": f"{round(float(limit_price), 2):.2f}",
        "time_in_force": "day",
        "client_order_id": client_order_id.strip(),
    }
    return _post_json("/v2/orders", key_id, secret, body, timeout)
