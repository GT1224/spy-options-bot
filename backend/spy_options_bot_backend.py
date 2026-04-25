from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from hive_contract_quality_v1 import compute_hive_contract_quality_v1
from hive_cycle_delta_v1 import compact_pulse_snapshot, compute_hive_cycle_delta_v1
from hive_execution_edge_v1 import compute_hive_execution_edge_v1
from hive_flow_context_v1 import FLOW_BUFFER_CAP, compute_hive_flow_context_v1
from hive_guardrails_v1 import compute_hive_guardrails_v1
from hive_promotion_gate_v1 import compute_hive_promotion_gate_v1
from hive_regime_observability_v1 import compute_hive_regime_observability_v1
from hive_ai_governance_v1 import compute_hive_ai_governance_v1
from hive_capital_posture_v1 import compute_hive_capital_posture_v1
from hive_operator_review_v1 import compute_hive_operator_review_v1
from hive_shadow_book_v1 import compute_hive_shadow_book_v1
from hive_signal_freshness_v1 import compute_hive_signal_freshness_v1
from hive_session_regime_v1 import compute_hive_session_regime_v1
from hive_signal_memory_v1 import compute_hive_signal_memory_v1
from hive_signal_rank_v1 import compute_hive_rank_v1

from alpaca_live_v1 import (
    AlpacaLiveError,
    LIVE_ORDER_PREFLIGHT_TIMEOUT,
    compact_live_order_observability,
    load_live_credentials,
    read_live_portfolio_snapshot,
    reconcile_live_order_observability,
    resolve_terminal_manual_live_order_observability,
    submit_spy_equity_live_order,
    validate_live_client_order_id,
)
from alpaca_paper_v1 import (
    AlpacaPaperError,
    PAPER_ORDER_PREFLIGHT_TIMEOUT,
    compact_paper_order_observability,
    fetch_open_orders,
    fetch_positions,
    load_paper_credentials,
    read_paper_portfolio_snapshot,
    reconcile_paper_order_observability,
    resolve_spy_paper_option_contract_v1,
    resolve_terminal_manual_paper_order_observability,
    spy_option_exposure_preflight,
    submit_spy_equity_order,
    submit_spy_option_limit_buy_open,
    validate_client_order_id,
)

# Operator-facing stale threshold (must match hive_contract_v1.system_state.freshness.signal_stale_after_ms).
SIGNAL_STALE_AFTER_MS = 25 * 60 * 1000

# H1A: throttle broker reads so GET /state stays responsive and Alpaca is not hammered.
BROKER_SYNC_TTL_SECONDS = 45.0
BROKER_MIN_ATTEMPT_INTERVAL_SECONDS = 12.0
# W5-LIVE-2: live read sync TTL — isolated from paper throttles.
LIVE_BROKER_SYNC_TTL_SECONDS = 45.0
LIVE_BROKER_MIN_ATTEMPT_INTERVAL_SECONDS = 12.0

_broker_sync_lock = threading.Lock()
_live_broker_sync_lock = threading.Lock()
# H1B: serialize manual paper submits + idempotency deque (maxlen in deque ctor).
_paper_order_lock = threading.Lock()
_paper_client_order_ids: deque[str] = deque(maxlen=500)
# W5-LIVE-1: isolated manual live equity — separate lock + idempotency from paper.
_live_equity_order_lock = threading.Lock()
_live_client_order_ids: deque[str] = deque(maxlen=500)
# OPTIONS-PAPER-EXEC-1: one auto submit at a time; no overlap with manual equity submit lock.
_auto_options_exec_lock = threading.Lock()
# Fingerprints (structure/bias/scores without last_loop_at) already auto-submitted this process lifetime.
_auto_options_submitted_fingerprints: deque[str] = deque(maxlen=200)
# Minimum wall-clock gap between any two auto option submits (seconds).
_OPTIONS_AUTO_SUBMIT_COOLDOWN_SEC = 600.0

load_dotenv()

_MIN_BOT_ADMIN_KEY_LEN = 32


def _hive_allow_weak_admin_key() -> bool:
    return os.getenv("HIVE_ALLOW_WEAK_ADMIN_KEY", "").strip().lower() in ("1", "true", "yes")


def _resolve_bot_admin_key() -> str:
    """
    Fail closed: require BOT_ADMIN_KEY (>=32 chars) unless HIVE_ALLOW_WEAK_ADMIN_KEY is set
    for explicit local-dev-only use (optional default key when unset).
    """
    raw = os.getenv("BOT_ADMIN_KEY", "").strip()
    if _hive_allow_weak_admin_key():
        return raw if raw else "mysecret123"
    if not raw:
        print(
            "FATAL: BOT_ADMIN_KEY is required (min 32 chars). "
            "For local dev only, set HIVE_ALLOW_WEAK_ADMIN_KEY=1.",
            file=sys.stderr,
        )
        sys.exit(1)
    if len(raw) < _MIN_BOT_ADMIN_KEY_LEN:
        print(
            f"FATAL: BOT_ADMIN_KEY must be at least {_MIN_BOT_ADMIN_KEY_LEN} characters.",
            file=sys.stderr,
        )
        sys.exit(1)
    return raw


def _cors_origins() -> list[str]:
    base = [
        "http://localhost:3000",
        "http://localhost:3005",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3005",
    ]
    extra = os.getenv("HIVE_CORS_ORIGINS", "").strip()
    if not extra:
        return base
    out = list(base)
    for part in extra.split(","):
        p = part.strip()
        if p and p not in out:
            out.append(p)
    return out


BOT_ADMIN_KEY = _resolve_bot_admin_key()

app = FastAPI(title="SPY Options Bot", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serializes run_signal_cycle across bot_loop and POST /cycle (sync + threadpool).
_signal_cycle_lock = threading.Lock()

state: dict[str, Any] = {
    "running": False,
    # Mirrors config["enabled"] for legacy raw /state JSON; authoritative toggle is state["config"]["enabled"].
    "enabled": False,
    "provider_mode": "mock",
    "cash": 15000,
    "equity": 15000,
    "realized_pnl_today": 0,
    "consecutive_losses": 0,
    # Pulse timestamp (UTC ISO); hive_contract_v1 exposes the same instant as system_state.last_cycle_at.
    "last_loop_at": None,
    "signal_cycle_count": 0,
    "recent_signal_flow": [],
    "prior_pulse_compact": None,
    "open_position": None,
    "unrealized_pnl": None,
    # Alpaca paper GET /v2/account buying_power when performance_source is alpaca_paper; else None.
    "buying_power": None,
    "performance_source": "demo_seed",
    "broker_last_success_at": None,
    "broker_last_attempt_at": None,
    "broker_last_sync_ok": False,
    "broker_last_error": None,
    "broker_open_orders_count": 0,
    # Last manual paper submit broker snapshot (in-process; cleared when paper broker is disabled).
    "last_paper_order_observability": None,
    # W5-LIVE-1: last manual live equity submit only — never mixed with paper observability.
    "last_live_order_observability": None,
    # W5-LIVE-2: live broker read sync telemetry (never used for paper performance_source).
    "live_broker_last_success_at": None,
    "live_broker_last_attempt_at": None,
    "live_broker_last_sync_ok": False,
    "live_broker_last_error": None,
    "live_snapshot_spy_open_order_count": None,
    "live_snapshot_open_orders_count": None,
    "logs": [],
    "signal_snapshot": {},
    "config": {
        "enabled": False,
        "use_live_alpaca": False,
        "alpaca_paper_enabled": False,
        "alpaca_options_auto_enabled": False,
        "paper_max_qty": 25,
        "poll_seconds": 10,
    },
    # OPTIONS-PAPER-EXEC-1 observability (in-process; surfaced on raw GET /state).
    "auto_options_paper_exec": {
        "last_signal_id": None,
        "last_trade_fingerprint": None,
        "last_order_id": None,
        "last_client_order_id": None,
        "last_contract_symbol": None,
        "last_outcome": None,
        "last_reason": None,
        "last_at": None,
        "last_submit_wallclock_at": None,
    },
}

prices = deque(maxlen=100)
volumes = deque(maxlen=100)
opening_range_prices = []
mock_price = 580.0
cycle_count = 0


def _reset_demo_portfolio_after_alpaca_off() -> None:
    """Operator disabled paper broker — restore static demo treasury fields."""
    state["cash"] = 15000
    state["equity"] = 15000
    state["open_position"] = None
    state["unrealized_pnl"] = None
    state["performance_source"] = "demo_seed"
    state["broker_last_success_at"] = None
    state["broker_last_attempt_at"] = None
    state["broker_last_sync_ok"] = False
    state["broker_last_error"] = None
    state["broker_open_orders_count"] = 0
    state["last_paper_order_observability"] = None
    _paper_client_order_ids.clear()
    state["auto_options_paper_exec"] = {
        "last_signal_id": None,
        "last_trade_fingerprint": None,
        "last_order_id": None,
        "last_client_order_id": None,
        "last_contract_symbol": None,
        "last_outcome": None,
        "last_reason": None,
        "last_at": None,
        "last_submit_wallclock_at": None,
    }
    _auto_options_submitted_fingerprints.clear()


def _spy_net_qty_from_open_position(op: Any) -> float | None:
    if op is None or not isinstance(op, dict):
        return None
    if str(op.get("symbol", "")).upper() != "SPY":
        return None
    try:
        return float(op.get("qty"))
    except (TypeError, ValueError):
        return None


def maybe_sync_alpaca_paper(*, force: bool) -> None:
    """
    TTL-throttled read sync from Alpaca paper. On failure, retains last-good cash/equity/position.
    Never logs secrets. Fast-fail via short HTTP timeouts inside the client.
    """
    cfg = state.get("config") or {}
    if not bool(cfg.get("alpaca_paper_enabled")):
        return

    key_id, secret = load_paper_credentials()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    with _broker_sync_lock:
        if not key_id or not secret:
            state["broker_last_attempt_at"] = now_iso
            state["broker_last_sync_ok"] = False
            state["broker_last_error"] = "missing ALPACA_PAPER_KEY_ID or ALPACA_PAPER_SECRET_KEY"
            return

        if not force:
            succ_age = _utc_age_seconds(
                state["broker_last_success_at"] if isinstance(state.get("broker_last_success_at"), str) else None
            )
            # Only throttle on fresh success — otherwise a prior failure (or missing-keys attempt)
            # leaves broker_last_sync_ok false while success_at may still look "fresh", and we never retry.
            if (
                succ_age is not None
                and succ_age < BROKER_SYNC_TTL_SECONDS
                and bool(state.get("broker_last_sync_ok"))
            ):
                return

            att_age = _utc_age_seconds(
                state["broker_last_attempt_at"] if isinstance(state.get("broker_last_attempt_at"), str) else None
            )
            # Do not throttle failed / missing-cred recovery: last attempt may be seconds ago but we never
            # reached a successful read, so broker_last_error would stay stale forever.
            if (
                att_age is not None
                and att_age < BROKER_MIN_ATTEMPT_INTERVAL_SECONDS
                and bool(state.get("broker_last_sync_ok"))
            ):
                return
        # force=True bypasses TTL and min-interval throttles (POST /paper/sync).

        state["broker_last_attempt_at"] = now_iso
        try:
            snap = read_paper_portfolio_snapshot(key_id, secret)
            state["cash"] = snap["cash"]
            state["equity"] = snap["equity"]
            state["buying_power"] = snap.get("buying_power")
            state["open_position"] = snap["open_position"]
            state["unrealized_pnl"] = snap["unrealized_pnl"]
            state["broker_open_orders_count"] = int(snap["open_orders_count"])
            state["broker_last_success_at"] = now_iso
            state["broker_last_sync_ok"] = True
            state["broker_last_error"] = None
            state["performance_source"] = "alpaca_paper"
            last_obs = state.get("last_paper_order_observability")
            oo = snap.get("open_orders")
            if isinstance(last_obs, dict) and isinstance(oo, list):
                state["last_paper_order_observability"] = reconcile_paper_order_observability(last_obs, oo)
            obs2 = state.get("last_paper_order_observability")
            if (
                isinstance(obs2, dict)
                and obs2.get("snapshot_freshness") == "NOT IN OPEN ORDERS"
                and obs2.get("order_id")
            ):
                state["last_paper_order_observability"] = resolve_terminal_manual_paper_order_observability(
                    key_id, secret, obs2
                )
            log("alpaca paper broker sync ok")
        except AlpacaPaperError as e:
            state["broker_last_sync_ok"] = False
            state["broker_last_error"] = str(e)[:240]
            log(f"alpaca paper broker sync failed ({type(e).__name__})")


def maybe_sync_alpaca_live(*, force: bool) -> None:
    """
    TTL-throttled read sync from Alpaca live (read-only). Updates last_live_order_observability only;
    never touches paper fields, performance_source, or execution_surface.
    """
    key_id, secret = load_live_credentials()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    if not key_id or not secret:
        if force:
            with _live_broker_sync_lock:
                state["live_broker_last_attempt_at"] = now_iso
                state["live_broker_last_sync_ok"] = False
                state["live_broker_last_error"] = "missing ALPACA_LIVE_KEY_ID or ALPACA_LIVE_SECRET_KEY"
        return

    with _live_broker_sync_lock:
        last_obs = state.get("last_live_order_observability")
        if not force and not isinstance(last_obs, dict):
            return

        if not force:
            succ_age = _utc_age_seconds(
                state["live_broker_last_success_at"]
                if isinstance(state.get("live_broker_last_success_at"), str)
                else None
            )
            if (
                succ_age is not None
                and succ_age < LIVE_BROKER_SYNC_TTL_SECONDS
                and bool(state.get("live_broker_last_sync_ok"))
            ):
                return

            att_age = _utc_age_seconds(
                state["live_broker_last_attempt_at"]
                if isinstance(state.get("live_broker_last_attempt_at"), str)
                else None
            )
            if (
                att_age is not None
                and att_age < LIVE_BROKER_MIN_ATTEMPT_INTERVAL_SECONDS
                and bool(state.get("live_broker_last_sync_ok"))
            ):
                return

        state["live_broker_last_attempt_at"] = now_iso
        try:
            snap = read_live_portfolio_snapshot(key_id, secret)
            state["live_snapshot_spy_open_order_count"] = int(snap["spy_open_order_count"])
            state["live_snapshot_open_orders_count"] = int(snap["open_orders_count"])
            oo = snap.get("open_orders")
            last_obs = state.get("last_live_order_observability")
            if isinstance(last_obs, dict) and isinstance(oo, list):
                state["last_live_order_observability"] = reconcile_live_order_observability(last_obs, oo)
                obs2 = state.get("last_live_order_observability")
                if (
                    isinstance(obs2, dict)
                    and obs2.get("snapshot_freshness") == "NOT IN OPEN ORDERS"
                    and obs2.get("order_id")
                ):
                    state["last_live_order_observability"] = resolve_terminal_manual_live_order_observability(
                        key_id, secret, obs2
                    )
            state["live_broker_last_success_at"] = now_iso
            state["live_broker_last_sync_ok"] = True
            state["live_broker_last_error"] = None
            log("alpaca live broker sync ok")
        except AlpacaLiveError as e:
            state["live_broker_last_sync_ok"] = False
            state["live_broker_last_error"] = str(e)[:240]
            log(f"alpaca live broker sync failed ({type(e).__name__})")


def _compute_execution_surface() -> str:
    cfg = state.get("config") or {}
    if not bool(cfg.get("alpaca_paper_enabled")):
        return "signal_only"
    key_id, secret = load_paper_credentials()
    if not key_id or not secret:
        return "signal_only"

    succ_at = state.get("broker_last_success_at") if isinstance(state.get("broker_last_success_at"), str) else None
    age = _utc_age_seconds(succ_at)
    ok = bool(state.get("broker_last_sync_ok"))
    if ok and age is not None and age <= BROKER_SYNC_TTL_SECONDS:
        return "alpaca_paper"
    return "alpaca_paper_degraded"


def _compute_canonical_provider() -> str:
    """
    Single operator-facing provider string aligned with execution_surface (HIVE-R1).
    Legacy state['provider_mode'] is not updated; this is derived at read time.
    """
    surface = _compute_execution_surface()
    if surface == "alpaca_paper":
        return "alpaca_paper"
    if surface == "alpaca_paper_degraded":
        return "alpaca_paper_degraded"
    cfg = state.get("config") or {}
    if not bool(cfg.get("alpaca_paper_enabled")):
        return "mock"
    return "alpaca_paper_missing_creds"


def _broker_sync_contract_block() -> dict[str, Any]:
    surface = _compute_execution_surface()
    succ_at = state.get("broker_last_success_at") if isinstance(state.get("broker_last_success_at"), str) else None
    stale = surface == "alpaca_paper_degraded"

    err = state.get("broker_last_error")
    return {
        "last_sync_at": succ_at,
        "last_attempt_at": state.get("broker_last_attempt_at")
        if isinstance(state.get("broker_last_attempt_at"), str)
        else None,
        "ok": bool(state.get("broker_last_sync_ok")),
        "error": err if isinstance(err, str) else None,
        "stale": stale,
        "performance_source": state.get("performance_source")
        if state.get("performance_source") in ("demo_seed", "alpaca_paper")
        else "demo_seed",
    }


def _live_broker_sync_contract_block() -> dict[str, Any]:
    """Additive contract slice for live read sync — never labels alpaca_paper."""
    succ_at = (
        state.get("live_broker_last_success_at")
        if isinstance(state.get("live_broker_last_success_at"), str)
        else None
    )
    err = state.get("live_broker_last_error")
    ok = bool(state.get("live_broker_last_sync_ok"))
    return {
        "last_sync_at": succ_at,
        "last_attempt_at": state.get("live_broker_last_attempt_at")
        if isinstance(state.get("live_broker_last_attempt_at"), str)
        else None,
        "ok": ok,
        "error": err if isinstance(err, str) else None,
        "stale": not ok,
        "execution_context": "alpaca_live",
    }


def _compute_live_readiness() -> dict[str, Any]:
    """
    Operator-facing live lane status (read-side only). Never implies paper routing.
    Distinct states: missing credentials, read-ready, sync-failed, never synced with creds present.
    """
    key_id, secret = load_live_credentials()
    credentials_present = bool(key_id and secret)
    submit_armed = os.getenv("HIVE_LIVE_SUBMIT_ARMED", "").strip() == "1"
    sync_ok = bool(state.get("live_broker_last_sync_ok"))
    att = state.get("live_broker_last_attempt_at") if isinstance(state.get("live_broker_last_attempt_at"), str) else None
    succ = state.get("live_broker_last_success_at") if isinstance(state.get("live_broker_last_success_at"), str) else None
    err = state.get("live_broker_last_error") if isinstance(state.get("live_broker_last_error"), str) else None
    has_live_obs = isinstance(state.get("last_live_order_observability"), dict)

    if not credentials_present:
        summary_code = "missing_credentials"
        hint = (
            "LIVE BLOCKED — Alpaca live API keys are not configured on this worker "
            "(ALPACA_LIVE_KEY_ID / ALPACA_LIVE_SECRET_KEY). Awaiting Alpaca live credential provisioning. "
            "Paper HIVE is unchanged; there is no live money read until keys exist."
        )
        if submit_armed:
            hint += (
                " HIVE_LIVE_SUBMIT_ARMED is set but live keys are missing — do not treat this as ready for live submit."
            )
    elif sync_ok:
        summary_code = "live_read_ready"
        hint = (
            "LIVE READ READY — last live broker read succeeded. Treasury rows in /state remain paper-backed unless "
            "documented otherwise; use live_broker_sync and last_live_order_observability for live order truth."
        )
    elif att is not None and not sync_ok:
        summary_code = "live_sync_failed"
        hint = (
            "LIVE READ DEGRADED — last forced or throttled live sync failed. "
            "Use POST /live/sync after fixing keys or connectivity; see live_broker_last_error."
        )
    else:
        summary_code = "live_credentials_ok_not_synced"
        hint = (
            "LIVE KEYS PRESENT — no successful live read yet this process (use POST /live/sync to pull live open "
            "orders and reconcile last_live_order_observability)."
        )

    return {
        "credentials_present": credentials_present,
        "submit_armed": submit_armed,
        "summary_code": summary_code,
        "operator_hint": hint,
        "live_broker_last_sync_ok": sync_ok,
        "live_broker_last_error": err,
        "live_broker_last_attempt_at": att,
        "live_broker_last_success_at": succ,
        "last_live_order_observability_present": has_live_obs,
    }


def _utc_age_seconds(iso_ts: str | None) -> float | None:
    """Age of last_cycle_at / last_loop_at in seconds (UTC), or None if unparsable."""
    if not iso_ts or not isinstance(iso_ts, str):
        return None
    try:
        raw = iso_ts.replace("Z", "+00:00")
        ts = datetime.fromisoformat(raw)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - ts).total_seconds())
    except (ValueError, TypeError):
        return None


def log(message: str):
    line = f"{datetime.utcnow().isoformat()} | {message}"
    state["logs"].append(line)
    state["logs"] = state["logs"][-100:]
    print(line)


def sma(values: list[float], length: int):
    if len(values) < length:
        return None
    return sum(values[-length:]) / length


def calc_vwap(price_list: list[float], volume_list: list[int]):
    if not price_list or not volume_list or len(price_list) != len(volume_list):
        return None
    total_pv = sum(p * v for p, v in zip(price_list, volume_list))
    total_v = sum(volume_list)
    if total_v == 0:
        return None
    return total_pv / total_v


def calc_volume_ratio(volume_list: list[int], lookback: int = 5):
    if len(volume_list) < lookback + 1:
        return None
    current = volume_list[-1]
    previous = volume_list[-(lookback + 1):-1]
    avg_prev = sum(previous) / len(previous)
    if avg_prev == 0:
        return None
    return current / avg_prev


def calc_bias(spot, vwap, ema8, ema21, or_high, or_low):
    if None in (spot, vwap, ema8, ema21, or_high, or_low):
        return "neutral"

    if spot > vwap and ema8 > ema21 and spot > or_high:
        return "bullish"

    if spot < vwap and ema8 < ema21 and spot < or_low:
        return "bearish"

    return "neutral"


def calc_setup_score(spot, vwap, ema8, ema21, or_high, or_low, volume_ratio):
    score = 0

    if None in (spot, vwap, ema8, ema21, or_high, or_low, volume_ratio):
        return score

    bullish = spot > vwap and ema8 > ema21 and spot > or_high
    bearish = spot < vwap and ema8 < ema21 and spot < or_low

    if ema8 > ema21 or ema8 < ema21:
        score += 25

    if spot > vwap or spot < vwap:
        score += 20

    if spot > or_high or spot < or_low:
        score += 20

    if volume_ratio > 1.2:
        score += 20

    if bullish or bearish:
        score += 15

    return min(score, 100)


def recommended_trade(bias, score):
    if score < 75:
        return {
            "action": "no_trade",
            "structure": None,
            "dte": None,
            "delta": None,
        }

    if bias == "bullish":
        return {
            "action": "trade",
            "structure": "long_call",
            "dte": 4,
            "delta": 0.40,
        }

    if bias == "bearish":
        return {
            "action": "trade",
            "structure": "long_put",
            "dte": 4,
            "delta": 0.40,
        }

    return {
        "action": "no_trade",
        "structure": None,
        "dte": None,
        "delta": None,
    }


def run_signal_cycle():
    global mock_price, cycle_count

    with _signal_cycle_lock:
        cycle_count += 1

        # simple fake movement with some up/down behavior
        if cycle_count % 7 == 0:
            mock_price -= 0.8
        else:
            mock_price += 0.5

        volume = 1000 + (cycle_count % 5) * 250

        prices.append(mock_price)
        volumes.append(volume)

        if len(opening_range_prices) < 5:
            opening_range_prices.append(mock_price)

        spot = round(mock_price, 2)
        ema8 = sma(list(prices), 8)
        ema21 = sma(list(prices), 21)
        vwap = calc_vwap(list(prices), list(volumes))
        volume_ratio = calc_volume_ratio(list(volumes), 5)

        opening_range_high = max(opening_range_prices) if opening_range_prices else None
        opening_range_low = min(opening_range_prices) if opening_range_prices else None

        bias = calc_bias(spot, vwap, ema8, ema21, opening_range_high, opening_range_low)
        setup_score = calc_setup_score(spot, vwap, ema8, ema21, opening_range_high, opening_range_low, volume_ratio)
        trade = recommended_trade(bias, setup_score)

        state["last_loop_at"] = datetime.utcnow().isoformat()
        state["signal_cycle_count"] = cycle_count
        state["signal_snapshot"] = {
            "spot": spot,
            "vwap": round(vwap, 2) if vwap is not None else None,
            "ema8": round(ema8, 2) if ema8 is not None else None,
            "ema21": round(ema21, 2) if ema21 is not None else None,
            "opening_range_high": round(opening_range_high, 2) if opening_range_high is not None else None,
            "opening_range_low": round(opening_range_low, 2) if opening_range_low is not None else None,
            "volume_ratio": round(volume_ratio, 2) if volume_ratio is not None else None,
            "bias": bias,
            "setup_score": setup_score,
            "recommended_trade": trade,
        }

        log(f"cycle executed | spot={spot} | bias={bias} | score={setup_score}")

        flow_entry = {
            "at": state["last_loop_at"],
            "action": trade.get("action"),
            "bias": bias,
            "structure": trade.get("structure"),
            "setup_score": setup_score,
        }
        flow_buf = state.get("recent_signal_flow")
        if not isinstance(flow_buf, list):
            flow_buf = []
        last = flow_buf[-1] if flow_buf else None
        duplicate_pulse = (
            isinstance(last, dict)
            and last.get("action") == flow_entry.get("action")
            and last.get("bias") == flow_entry.get("bias")
            and last.get("structure") == flow_entry.get("structure")
            and last.get("setup_score") == flow_entry.get("setup_score")
        )
        if not duplicate_pulse:
            flow_buf.append(flow_entry)
        state["recent_signal_flow"] = flow_buf[-FLOW_BUFFER_CAP:]


def _derive_direction_from_trade(trade: dict[str, Any], bias: str | None) -> str | None:
    struct = trade.get("structure")
    if struct == "long_call":
        return "call"
    if struct == "long_put":
        return "put"
    if bias == "bullish":
        return "call"
    if bias == "bearish":
        return "put"
    return None


def _compute_hive_rank_through_promotion() -> dict[str, Any]:
    """Shared rank → promotion_gate chain for hive_contract_v1 and OPTIONS-PAPER-EXEC-1."""
    snap = state.get("signal_snapshot") or {}
    cfg = state.get("config") or {}
    trade = snap.get("recommended_trade") or {}
    bias = snap.get("bias")
    setup_score = snap.get("setup_score")

    if setup_score is None:
        confidence = None
    else:
        try:
            confidence = max(0.0, min(1.0, float(setup_score) / 100.0))
        except (TypeError, ValueError):
            confidence = None

    id_payload = json.dumps(
        {
            "last_loop_at": state.get("last_loop_at"),
            "spot": snap.get("spot"),
            "setup_score": setup_score,
            "bias": bias,
            "action": trade.get("action"),
        },
        sort_keys=True,
        default=str,
    )
    signal_id = hashlib.sha256(id_payload.encode()).hexdigest()[:24]

    trading_enabled = bool(cfg.get("enabled"))
    use_live = bool(cfg.get("use_live_alpaca"))

    direction = _derive_direction_from_trade(trade, bias if isinstance(bias, str) else None)
    setup_payload = {
        "spot": snap.get("spot"),
        "vwap": snap.get("vwap"),
        "ema8": snap.get("ema8"),
        "ema21": snap.get("ema21"),
        "opening_range_high": snap.get("opening_range_high"),
        "opening_range_low": snap.get("opening_range_low"),
        "volume_ratio": snap.get("volume_ratio"),
        "bias": bias,
        "setup_score": setup_score,
    }
    rank_bundle = compute_hive_rank_v1(
        setup_payload,
        trade,
        direction,
        state.get("last_loop_at"),
    )

    rank_score = rank_bundle["rank_score"]
    guardrails = compute_hive_guardrails_v1(
        setup=setup_payload,
        trade=trade,
        direction=direction,
        last_cycle_at=state.get("last_loop_at"),
        rank_score=rank_score if isinstance(rank_score, int) else None,
        bot_running=bool(state.get("running")),
        trading_enabled=trading_enabled,
        open_position=state.get("open_position"),
        consecutive_losses=state.get("consecutive_losses"),
    )

    contract_quality = compute_hive_contract_quality_v1(
        setup_payload,
        trade,
        direction,
        rank_score if isinstance(rank_score, int) else None,
        guardrails,
    )

    execution_edge = compute_hive_execution_edge_v1(
        setup_payload,
        trade,
        state.get("last_loop_at"),
        rank_bundle,
        guardrails,
        contract_quality,
        bot_running=bool(state.get("running")),
        trading_enabled=trading_enabled,
        mode="live" if use_live else "paper",
        open_position=state.get("open_position"),
        consecutive_losses=state.get("consecutive_losses"),
    )

    promotion_gate = compute_hive_promotion_gate_v1(
        setup=setup_payload,
        trade=trade,
        rank_score=rank_score if isinstance(rank_score, int) else None,
        guardrails=guardrails,
        contract_quality=contract_quality,
        execution_edge=execution_edge,
    )

    return {
        "snap": snap,
        "cfg": cfg,
        "trade": trade,
        "bias": bias,
        "setup_score": setup_score,
        "confidence": confidence,
        "signal_id": signal_id,
        "trading_enabled": trading_enabled,
        "use_live": use_live,
        "direction": direction,
        "setup_payload": setup_payload,
        "rank_bundle": rank_bundle,
        "guardrails": guardrails,
        "contract_quality": contract_quality,
        "execution_edge": execution_edge,
        "promotion_gate": promotion_gate,
    }


def _set_auto_options_exec_record(**kwargs: Any) -> None:
    cur = state.get("auto_options_paper_exec")
    if not isinstance(cur, dict):
        cur = {}
    nxt = dict(cur)
    for k, v in kwargs.items():
        nxt[k] = v
    nxt["last_at"] = datetime.now(timezone.utc).isoformat()
    state["auto_options_paper_exec"] = nxt


def maybe_auto_execute_options_paper() -> None:
    """
    OPTIONS-PAPER-EXEC-1: after a signal pulse, optionally submit one SPY option limit BTO on Alpaca paper.
    Kill switch: config alpaca_options_auto_enabled (default false). Uses same gate stack as hive_contract_v1.
    """
    cfg = state.get("config") or {}
    if not bool(cfg.get("alpaca_options_auto_enabled")):
        return
    if not bool(state.get("running")) or not bool(cfg.get("enabled")):
        return
    if not bool(cfg.get("alpaca_paper_enabled")):
        _set_auto_options_exec_record(
            last_outcome="skipped",
            last_reason="alpaca_paper_enabled is false",
        )
        return

    surface = _compute_execution_surface()
    if surface != "alpaca_paper":
        _set_auto_options_exec_record(
            last_outcome="skipped",
            last_reason=f"execution_surface is {surface!r} (need fresh alpaca_paper sync)",
        )
        return

    key_id, secret = load_paper_credentials()
    if not key_id or not secret:
        _set_auto_options_exec_record(
            last_outcome="skipped",
            last_reason="missing ALPACA_PAPER_KEY_ID or ALPACA_PAPER_SECRET_KEY",
        )
        return

    layers = _compute_hive_rank_through_promotion()
    trade = layers["trade"]
    snap = layers["snap"]
    pg = layers["promotion_gate"]
    ee = layers["execution_edge"]
    cq = layers["contract_quality"]
    signal_id = layers["signal_id"]

    if trade.get("action") != "trade":
        return
    struct = trade.get("structure")
    if struct not in ("long_call", "long_put"):
        return

    if not isinstance(pg, dict) or pg.get("status") != "promoted":
        return
    if not isinstance(ee, dict) or ee.get("status") != "go":
        return
    cq_st = cq.get("status") if isinstance(cq, dict) else None
    if cq_st not in ("strong", "acceptable"):
        return

    fp_payload = json.dumps(
        {
            "structure": trade.get("structure"),
            "bias": snap.get("bias"),
            "action": trade.get("action"),
            "setup_score": layers["setup_score"],
            "rank_score": layers["rank_bundle"].get("rank_score"),
            "dte": trade.get("dte"),
            "delta": trade.get("delta"),
        },
        sort_keys=True,
        default=str,
    )
    trade_fp = hashlib.sha256(fp_payload.encode()).hexdigest()[:24]

    rec = state.get("auto_options_paper_exec")
    if isinstance(rec, dict):
        wall = rec.get("last_submit_wallclock_at")
        age = _utc_age_seconds(wall if isinstance(wall, str) else None)
        if age is not None and age < _OPTIONS_AUTO_SUBMIT_COOLDOWN_SEC:
            _set_auto_options_exec_record(
                last_outcome="skipped",
                last_reason="cooldown: recent auto options submit",
                last_signal_id=signal_id,
                last_trade_fingerprint=trade_fp,
            )
            return

    if trade_fp in _auto_options_submitted_fingerprints:
        _set_auto_options_exec_record(
            last_outcome="skipped",
            last_reason="duplicate trade fingerprint already auto-submitted this session",
            last_signal_id=signal_id,
            last_trade_fingerprint=trade_fp,
        )
        return

    spot = snap.get("spot")
    try:
        spot_f = float(spot)
    except (TypeError, ValueError):
        _set_auto_options_exec_record(
            last_outcome="skipped",
            last_reason="missing or invalid spot for option resolve",
            last_signal_id=signal_id,
            last_trade_fingerprint=trade_fp,
        )
        return

    dte_raw = trade.get("dte")
    delta_raw = trade.get("delta")
    try:
        dte_i = int(dte_raw) if dte_raw is not None else 4
    except (TypeError, ValueError):
        dte_i = 4
    try:
        delta_f = float(delta_raw) if delta_raw is not None else 0.40
    except (TypeError, ValueError):
        delta_f = 0.40

    client_order_id = f"a{trade_fp}"[:48]
    if len(client_order_id) < 3:
        client_order_id = f"a{signal_id}"[:48]

    with _auto_options_exec_lock:
        if trade_fp in _auto_options_submitted_fingerprints:
            return
        wall2 = state.get("auto_options_paper_exec", {}).get("last_submit_wallclock_at")
        age2 = _utc_age_seconds(wall2 if isinstance(wall2, str) else None)
        if age2 is not None and age2 < _OPTIONS_AUTO_SUBMIT_COOLDOWN_SEC:
            return

        try:
            pos = fetch_positions(key_id, secret, PAPER_ORDER_PREFLIGHT_TIMEOUT)
            oo = fetch_open_orders(key_id, secret, PAPER_ORDER_PREFLIGHT_TIMEOUT)
        except AlpacaPaperError as e:
            _set_auto_options_exec_record(
                last_outcome="error",
                last_reason=f"positions/orders preflight: {str(e)[:200]}",
                last_signal_id=signal_id,
                last_trade_fingerprint=trade_fp,
            )
            log(f"auto options preflight failed ({type(e).__name__})")
            return

        bad, why = spy_option_exposure_preflight(pos, oo)
        if bad:
            _set_auto_options_exec_record(
                last_outcome="skipped",
                last_reason=why,
                last_signal_id=signal_id,
                last_trade_fingerprint=trade_fp,
            )
            return

        try:
            resolved = resolve_spy_paper_option_contract_v1(
                key_id,
                secret,
                structure=str(struct),
                target_dte=dte_i,
                target_delta=delta_f,
                underlying_spot=spot_f,
                timeout=PAPER_ORDER_PREFLIGHT_TIMEOUT,
            )
        except AlpacaPaperError as e:
            _set_auto_options_exec_record(
                last_outcome="error",
                last_reason=f"resolve: {str(e)[:200]}",
                last_signal_id=signal_id,
                last_trade_fingerprint=trade_fp,
            )
            log(f"auto options resolve failed ({type(e).__name__})")
            return

        close_px = resolved.get("close_price")
        try:
            base = float(close_px)
        except (TypeError, ValueError):
            _set_auto_options_exec_record(
                last_outcome="error",
                last_reason="resolved contract missing close_price",
                last_signal_id=signal_id,
                last_trade_fingerprint=trade_fp,
            )
            return
        limit_px = round(base * 1.12, 2)
        if limit_px < 0.01:
            _set_auto_options_exec_record(
                last_outcome="skipped",
                last_reason="limit_price too small after markup",
                last_signal_id=signal_id,
                last_trade_fingerprint=trade_fp,
            )
            return

        try:
            out = submit_spy_option_limit_buy_open(
                key_id,
                secret,
                symbol=str(resolved["symbol"]),
                qty=1,
                limit_price=limit_px,
                client_order_id=client_order_id,
            )
        except AlpacaPaperError as e:
            _set_auto_options_exec_record(
                last_outcome="error",
                last_reason=f"submit: {str(e)[:200]}",
                last_signal_id=signal_id,
                last_trade_fingerprint=trade_fp,
            )
            log(f"auto options submit failed ({type(e).__name__})")
            return

        _auto_options_submitted_fingerprints.append(trade_fp)
        now_iso = datetime.now(timezone.utc).isoformat()
        _set_auto_options_exec_record(
            last_outcome="submitted",
            last_reason="Alpaca accepted options limit order (not a fill)",
            last_signal_id=signal_id,
            last_trade_fingerprint=trade_fp,
            last_order_id=out.get("id"),
            last_client_order_id=client_order_id,
            last_contract_symbol=str(resolved.get("symbol")),
            last_submit_wallclock_at=now_iso,
        )
        log(
            f"auto options paper submitted | id={out.get('id')} | sym={resolved.get('symbol')} | "
            f"limit={limit_px} | fp={trade_fp}"
        )
        maybe_sync_alpaca_paper(force=True)


def build_hive_contract_v1() -> dict[str, Any]:
    """Wave-1 HIVE contract: FastAPI-owned JSON for Next.js (no external services).

    Raw /state still uses last_loop_at; hive_contract_v1.system_state.last_cycle_at is the same clock for operators.
    top_signal.warnings duplicates guardrails.warnings for simple consumers that only read top_signal.
    """
    layers = _compute_hive_rank_through_promotion()
    snap = layers["snap"]
    trade = layers["trade"]
    bias = layers["bias"]
    setup_score = layers["setup_score"]
    confidence = layers["confidence"]
    signal_id = layers["signal_id"]
    trading_enabled = layers["trading_enabled"]
    use_live = layers["use_live"]
    direction = layers["direction"]
    setup_payload = layers["setup_payload"]
    rank_bundle = layers["rank_bundle"]
    guardrails = layers["guardrails"]
    contract_quality = layers["contract_quality"]
    execution_edge = layers["execution_edge"]
    promotion_gate = layers["promotion_gate"]
    rank_score = rank_bundle["rank_score"]

    signal_memory = compute_hive_signal_memory_v1(
        signal_cycle_count=int(state.get("signal_cycle_count") or 0),
        last_loop_at=state.get("last_loop_at") if isinstance(state.get("last_loop_at"), str) else None,
        spot=snap.get("spot"),
        setup_score=setup_score,
        consecutive_losses=state.get("consecutive_losses"),
        open_position=state.get("open_position"),
    )

    flow_context = compute_hive_flow_context_v1(
        recent_entries=list(state.get("recent_signal_flow") or []),
        consecutive_losses=state.get("consecutive_losses"),
        open_position=state.get("open_position"),
        promotion_gate=promotion_gate,
    )

    session_regime = compute_hive_session_regime_v1()

    last_at = state.get("last_loop_at") if isinstance(state.get("last_loop_at"), str) else None
    regime_obs = compute_hive_regime_observability_v1(
        session_regime=session_regime,
        setup=setup_payload,
        last_loop_at=last_at,
        recent_flow=state.get("recent_signal_flow"),
        market_intel_items=[],  # R1-P2: event_driven when items exist
        provider_mode=_compute_canonical_provider(),
    )

    current_pulse = compact_pulse_snapshot(
        rank_score=rank_score if isinstance(rank_score, int) else None,
        promotion_gate=promotion_gate,
        execution_edge=execution_edge,
        contract_quality=contract_quality,
        direction=direction,
        bias=bias,
        trade=trade,
        session_regime=session_regime,
    )
    prior_raw = state.get("prior_pulse_compact")
    prior_pulse = prior_raw if isinstance(prior_raw, dict) else None
    cycle_delta = compute_hive_cycle_delta_v1(prior=prior_pulse, current=current_pulse)
    state["prior_pulse_compact"] = dict(current_pulse)

    age_sec = _utc_age_seconds(last_at)
    signal_stale = age_sec is not None and (age_sec * 1000.0) > float(SIGNAL_STALE_AFTER_MS)
    signal_freshness = compute_hive_signal_freshness_v1(
        last_loop_at=last_at,
        age_seconds=age_sec,
        signal_stale=signal_stale,
        stale_after_ms=SIGNAL_STALE_AFTER_MS,
        spot=snap.get("spot"),
        setup_score=snap.get("setup_score"),
        regime_code=regime_obs.get("code") if isinstance(regime_obs.get("code"), str) else None,
    )
    shadow_book = compute_hive_shadow_book_v1(
        recent_flow=state.get("recent_signal_flow"),
        active_bias=bias,
        last_loop_at=last_at,
        flow_buffer_cap=FLOW_BUFFER_CAP,
    )
    bot_running = bool(state.get("running"))
    if not bot_running:
        lifecycle_phase = "idle"
        lifecycle_hint = "Swarm idle — no automated poll loop; Pulse Cycle still refreshes the snapshot."
    elif not trading_enabled:
        lifecycle_phase = "paused"
        lifecycle_hint = "Swarm running but trading disarmed — timed pulses are skipped until armed."
    else:
        lifecycle_phase = "polling"
        lifecycle_hint = "Swarm running and armed — timed pulses follow poll_seconds."

    trade_action = trade.get("action") if isinstance(trade.get("action"), str) else None
    if trade_action == "no_trade":
        posture_hint = "Recommended posture is no_trade — gate and trade leg are reference only."
    elif trade_action == "trade":
        posture_hint = "Trade-shaped recommendation — confirm gate, guardrails, and execution edge before any manual action."
    else:
        posture_hint = "Awaiting a clear recommended_trade action from the latest pulse."

    execution_surface = _compute_execution_surface()
    broker_sync = _broker_sync_contract_block()
    pending_ct = (
        int(state.get("broker_open_orders_count") or 0)
        if execution_surface in ("alpaca_paper", "alpaca_paper_degraded")
        else 0
    )
    perf_src = (
        state.get("performance_source")
        if state.get("performance_source") in ("demo_seed", "alpaca_paper")
        else "demo_seed"
    )
    unrealized_out = state.get("unrealized_pnl") if perf_src == "alpaca_paper" else None
    buying_power_out = state.get("buying_power") if perf_src == "alpaca_paper" else None

    live_readiness = _compute_live_readiness()
    operator_review = compute_hive_operator_review_v1(
        regime_obs=regime_obs,
        signal_freshness=signal_freshness,
        shadow_book=shadow_book,
        broker_sync=broker_sync,
        live_readiness=live_readiness,
        cycle_delta=cycle_delta,
        execution_surface=execution_surface,
        signal_stale=signal_stale,
        last_loop_at=last_at,
    )
    capital_posture = compute_hive_capital_posture_v1(
        last_loop_at=last_at,
        signal_stale=signal_stale,
        signal_freshness=signal_freshness,
        shadow_book=shadow_book,
        guardrails=guardrails,
        contract_quality=contract_quality,
        execution_edge=execution_edge,
        promotion_gate=promotion_gate,
        execution_surface=execution_surface,
        broker_sync=broker_sync,
        trading_enabled=trading_enabled,
        bot_running=bot_running,
        trade_action=trade_action,
    )
    contract_signal_type = "rules"
    ai_governance = compute_hive_ai_governance_v1(
        signal_type=contract_signal_type,
        last_loop_at=last_at,
        capital_posture_tier=capital_posture.get("tier") if isinstance(capital_posture.get("tier"), str) else None,
        alpaca_options_auto_enabled=bool((state.get("config") or {}).get("alpaca_options_auto_enabled")),
    )

    return {
        "system_state": {
            "bot_running": bot_running,
            "trading_enabled": trading_enabled,
            # use_live_alpaca is rejected in /config (True); still not a live execution path in H1A.
            "mode": "live" if use_live else "paper",
            "execution_surface": execution_surface,
            "provider_mode": _compute_canonical_provider(),
            # Same instant as raw state["last_loop_at"] (operator-facing name).
            "last_cycle_at": state.get("last_loop_at"),
            "pending_signals_count": pending_ct,
            "pending_signals_semantics": "broker_orders_only",
            # Count is len(Alpaca open orders), not SPY-filtered; not positions or fills.
            "pending_open_orders_scope": "all_symbols_alpaca_status_open",
            "lifecycle_phase": lifecycle_phase,
            "lifecycle_hint": lifecycle_hint,
            "signal_age_seconds": int(round(age_sec)) if age_sec is not None else None,
            "signal_stale": signal_stale,
            # D1-P1: read-only decay map — not consumed by ranking/guardrails/execution.
            "signal_freshness": signal_freshness,
            # S1-P1: read-only shadow context from recent_signal_flow — not a rejected-candidate engine.
            "shadow_book": shadow_book,
            # OAR1-P1: current-state operator review — not historical daily after-action.
            "operator_review": operator_review,
            # C1-P1: provisional trust tier / capital posture — not an allocator.
            "capital_posture": capital_posture,
            # AI1-P1: AI attribution / governance — not an AI allocator or scorecard.
            "ai_governance": ai_governance,
            "operator_posture_hint": posture_hint,
            "freshness": {"signal_stale_after_ms": SIGNAL_STALE_AFTER_MS},
            "session_regime": session_regime,
            # R1-P1: read-only observability — not consumed by execution/ranking/guardrails.
            "regime": regime_obs,
            "broker_sync": broker_sync,
            "manual_paper_last_broker_snapshot": state.get("last_paper_order_observability")
            if isinstance(state.get("last_paper_order_observability"), dict)
            else None,
            "manual_live_last_broker_snapshot": state.get("last_live_order_observability")
            if isinstance(state.get("last_live_order_observability"), dict)
            else None,
            "live_broker_sync": _live_broker_sync_contract_block(),
            "live_readiness": live_readiness,
        },
        "top_signal": {
            "signal_id": signal_id,
            "underlying": "SPY",
            "direction": direction,
            "confidence": confidence,
            "signal_type": contract_signal_type,
            "rank": 1,
            "rank_score": rank_bundle["rank_score"],
            "rank_factors": rank_bundle["rank_factors"],
            "rationale": rank_bundle["rationale"],
            "guardrails": guardrails,
            "contract_quality": contract_quality,
            "execution_edge": execution_edge,
            "promotion_gate": promotion_gate,
            "signal_memory": signal_memory,
            "flow_context": flow_context,
            "cycle_delta": cycle_delta,
            "recommended_trade": trade,
            "setup": setup_payload,
            # Denormalized from guardrails.warnings (identical list).
            "warnings": list(guardrails.get("warnings") or []),
        },
        "market_intel": {
            "items": [],
            "last_updated_at": None,
        },
        "performance_state": {
            "cash": state.get("cash"),
            "equity": state.get("equity"),
            "realized_pnl_today": state.get("realized_pnl_today"),
            "open_position": state.get("open_position"),
            "consecutive_losses": state.get("consecutive_losses"),
            "unrealized_pnl": unrealized_out,
            # From Alpaca paper GET /v2/account when performance_source is alpaca_paper; None if absent or demo.
            "buying_power": buying_power_out,
            # Never written from Alpaca reads in this build — only init + risk reset (POST /risk/reset).
            "realized_pnl_today_source": "hive_internal_only_not_alpaca_account_sync",
            "consecutive_losses_source": "hive_internal_only_not_alpaca_account_sync",
        },
        # Hints for UIs/docs only — not enforced when serializing the contract.
        "ui_visibility": {
            "core": [
                "system_state",
                "system_state.broker_sync",
                "system_state.live_readiness",
                "system_state.session_regime",
                "system_state.regime",
                "system_state.signal_freshness",
                "system_state.shadow_book",
                "system_state.operator_review",
                "system_state.capital_posture",
                "system_state.ai_governance",
                "system_state.execution_surface",
                "system_state.lifecycle_phase",
                "system_state.lifecycle_hint",
                "system_state.signal_age_seconds",
                "system_state.signal_stale",
                "system_state.operator_posture_hint",
                "system_state.pending_signals_semantics",
                "top_signal.setup",
                "top_signal.recommended_trade",
                "performance_state",
            ],
            "advanced": [
                "system_state.manual_live_last_broker_snapshot",
                "system_state.live_broker_sync",
                "top_signal.rank_score",
                "top_signal.rank_factors",
                "top_signal.rationale",
                "top_signal.guardrails",
                "top_signal.contract_quality",
                "top_signal.execution_edge",
                "top_signal.promotion_gate",
                "top_signal.signal_memory",
                "top_signal.flow_context",
                "top_signal.cycle_delta",
            ],
            "future_hidden": [
                "market_intel",
            ],
        },
    }


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    if request.url.path == "/health":
        return await call_next(request)

    key = request.headers.get("x-bot-admin-key")

    if key != BOT_ADMIN_KEY:
        if not key:
            print("401 unauthorized: missing x-bot-admin-key header", file=sys.stderr)
        else:
            print("401 unauthorized: x-bot-admin-key mismatch", file=sys.stderr)
        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized"}
        )

    return await call_next(request)


# Ops: always-on worker required for this loop — see HIVE_RUNTIME_CONTRACT.md (repo root).
async def bot_loop():
    log("bot started")

    while state["running"]:
        if state["config"]["enabled"]:
            run_signal_cycle()
            maybe_auto_execute_options_paper()

        try:
            poll = int(state["config"]["poll_seconds"])
        except (TypeError, ValueError):
            poll = 10
        await asyncio.sleep(max(1, min(3600, poll)))

    log("bot stopped")


@app.get("/health")
def health():
    return {
        "ok": True,
        "running": state["running"],
        "provider": _compute_canonical_provider(),
    }


@app.get("/state")
def get_state():
    maybe_sync_alpaca_paper(force=False)
    maybe_sync_alpaca_live(force=False)
    body = dict(state)
    body["provider_mode"] = _compute_canonical_provider()
    body["live_readiness"] = _compute_live_readiness()
    body["hive_contract_v1"] = build_hive_contract_v1()
    return body


@app.post("/paper/sync")
def paper_sync():
    """Force Alpaca paper read sync (admin). Bypasses TTL / min-interval throttles."""
    cfg = state.get("config") or {}
    if not bool(cfg.get("alpaca_paper_enabled")):
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "alpaca_paper_enabled is false"},
        )
    key_id, secret = load_paper_credentials()
    if not key_id or not secret:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "missing ALPACA_PAPER_KEY_ID or ALPACA_PAPER_SECRET_KEY"},
        )

    maybe_sync_alpaca_paper(force=True)
    if not bool(state.get("broker_last_sync_ok")):
        err = state.get("broker_last_error")
        msg = err if isinstance(err, str) else "broker sync failed"
        return JSONResponse(status_code=502, content={"ok": False, "error": msg[:240]})
    return {"ok": True, "error": None}


@app.post("/live/sync")
def live_sync():
    """Force Alpaca live read sync (admin). Read-only — no order placement; refreshes live observability."""
    maybe_sync_alpaca_live(force=True)
    readiness = _compute_live_readiness()
    key_id, secret = load_live_credentials()
    if not key_id or not secret:
        return {
            "ok": False,
            "error": "missing ALPACA_LIVE_KEY_ID or ALPACA_LIVE_SECRET_KEY",
            "blocker": "missing_live_credentials",
            "live_readiness": readiness,
            "spy_open_order_count": None,
            "live_open_orders_count": None,
            "last_live_order_observability": state.get("last_live_order_observability"),
        }

    if not bool(state.get("live_broker_last_sync_ok")):
        err = state.get("live_broker_last_error")
        msg = err if isinstance(err, str) else "live broker sync failed"
        return {
            "ok": False,
            "error": str(msg)[:240],
            "blocker": "live_broker_request_failed",
            "live_readiness": readiness,
            "spy_open_order_count": state.get("live_snapshot_spy_open_order_count"),
            "live_open_orders_count": state.get("live_snapshot_open_orders_count"),
            "last_live_order_observability": state.get("last_live_order_observability"),
        }
    return {
        "ok": True,
        "error": None,
        "blocker": None,
        "live_readiness": readiness,
        "live_broker_last_sync_ok": True,
        "spy_open_order_count": state.get("live_snapshot_spy_open_order_count"),
        "live_open_orders_count": state.get("live_snapshot_open_orders_count"),
        "last_live_order_observability": state.get("last_live_order_observability"),
    }


@app.post("/paper/order")
def paper_order(payload: dict[str, Any]):
    """Manual Alpaca paper equity order — SPY only. Admin auth. H1B."""
    cfg = state.get("config") or {}
    if not bool(cfg.get("alpaca_paper_enabled")):
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "alpaca_paper_enabled is false"},
        )
    key_id, secret = load_paper_credentials()
    if not key_id or not secret:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "missing ALPACA_PAPER_KEY_ID or ALPACA_PAPER_SECRET_KEY"},
        )

    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"ok": False, "error": "JSON object body required"})

    sym = str(payload.get("symbol") or "SPY").strip().upper()
    if sym != "SPY":
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "symbol must be SPY (equity only in this build)"},
        )

    side_raw = payload.get("side")
    if not isinstance(side_raw, str) or not side_raw.strip():
        return JSONResponse(status_code=400, content={"ok": False, "error": "side is required (buy or sell)"})
    side = side_raw.strip().lower()
    if side not in ("buy", "sell"):
        return JSONResponse(status_code=400, content={"ok": False, "error": "side must be buy or sell"})

    qty_raw = payload.get("qty")
    try:
        qty = int(qty_raw)
    except (TypeError, ValueError):
        return JSONResponse(status_code=400, content={"ok": False, "error": "qty must be a positive integer"})
    if qty < 1:
        return JSONResponse(status_code=400, content={"ok": False, "error": "qty must be at least 1"})

    try:
        max_q = int(cfg.get("paper_max_qty", 25))
    except (TypeError, ValueError):
        max_q = 25
    max_q = max(1, min(500, max_q))
    if qty > max_q:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": f"qty exceeds paper_max_qty ({max_q})"},
        )

    ot_raw = payload.get("order_type") or payload.get("type")
    if not isinstance(ot_raw, str) or not ot_raw.strip():
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "order_type is required (market or limit)"},
        )
    order_type = ot_raw.strip().lower()
    if order_type not in ("market", "limit"):
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "order_type must be market or limit"},
        )

    limit_price: float | None = None
    if order_type == "limit":
        lp = payload.get("limit_price")
        try:
            limit_price = float(lp)
        except (TypeError, ValueError):
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "limit_price required for limit orders"},
            )
        if limit_price <= 0:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "limit_price must be positive"},
            )

    cid_raw = payload.get("client_order_id")
    if cid_raw is None:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "client_order_id is required"},
        )
    cid_err = validate_client_order_id(str(cid_raw).strip())
    if cid_err:
        return JSONResponse(status_code=400, content={"ok": False, "error": cid_err})
    client_order_id = str(cid_raw).strip()

    # H3: mandatory broker preflight — admission uses fresh Alpaca truth, not TTL-stale state.
    try:
        snap = read_paper_portfolio_snapshot(
            key_id, secret, timeout=PAPER_ORDER_PREFLIGHT_TIMEOUT
        )
    except AlpacaPaperError as e:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "error": f"broker preflight failed: {str(e)[:200]}"},
        )

    try:
        spy_open_orders = int(snap["spy_open_order_count"])
    except (KeyError, TypeError, ValueError):
        return JSONResponse(
            status_code=502,
            content={"ok": False, "error": "broker preflight failed: invalid snapshot"},
        )

    if spy_open_orders > 0:
        return JSONResponse(
            status_code=409,
            content={
                "ok": False,
                "error": "broker preflight: outstanding SPY open orders exist; wait for fills or cancel before submit",
            },
        )

    now_pf = datetime.now(timezone.utc)
    now_iso_pf = now_pf.isoformat()
    with _broker_sync_lock:
        state["cash"] = snap["cash"]
        state["equity"] = snap["equity"]
        state["buying_power"] = snap.get("buying_power")
        state["open_position"] = snap["open_position"]
        state["unrealized_pnl"] = snap["unrealized_pnl"]
        state["broker_open_orders_count"] = int(snap["open_orders_count"])
        state["broker_last_success_at"] = now_iso_pf
        state["broker_last_sync_ok"] = True
        state["broker_last_error"] = None
        state["performance_source"] = "alpaca_paper"
        state["broker_last_attempt_at"] = now_iso_pf

    net = _spy_net_qty_from_open_position(snap["open_position"])
    if side == "buy" and net is not None and net > 1e-9:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "buy rejected - SPY position already open (no stacking in H1B)"},
        )
    if side == "sell" and (net is None or net <= 1e-9):
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "sell rejected - no SPY long position to reduce"},
        )

    if order_type == "market":
        regime_submit = compute_hive_session_regime_v1()
        if not bool(regime_submit.get("market_hours")):
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": (
                        "Manual SPY market orders are blocked outside NYSE regular trading hours (RTH). "
                        "Use a limit order, or submit during Mon–Fri 9:30–16:00 ET, or manage working orders in Alpaca."
                    ),
                    "reason": "outside_regular_trading_hours",
                    "session_code": regime_submit.get("code"),
                    "session_label": regime_submit.get("label"),
                },
            )

    with _paper_order_lock:
        if client_order_id in _paper_client_order_ids:
            return JSONResponse(
                status_code=409,
                content={"ok": False, "error": "duplicate client_order_id in local idempotency window"},
            )
        try:
            out = submit_spy_equity_order(
                key_id,
                secret,
                side=side,
                qty=qty,
                order_type=order_type,
                limit_price=limit_price,
                client_order_id=client_order_id,
            )
        except AlpacaPaperError as e:
            log(f"alpaca paper order failed ({type(e).__name__})")
            return JSONResponse(
                status_code=502,
                content={"ok": False, "error": str(e)[:240]},
            )
        _paper_client_order_ids.append(client_order_id)

    log("alpaca paper order submitted")
    maybe_sync_alpaca_paper(force=True)
    oid = out.get("id")
    obs = compact_paper_order_observability(out) if isinstance(out, dict) else None
    if isinstance(obs, dict):
        obs["snapshot_freshness"] = "SUBMIT SNAPSHOT"
        obs["truth_note"] = (
            "Captured from Alpaca submit response; reconciles on the next successful broker read (GET /state, Sync broker, or post-submit sync)."
        )
        state["last_paper_order_observability"] = obs
    return {
        "ok": True,
        "error": None,
        "order_id": oid,
        "client_order_id": client_order_id,
        "broker_stage": "accepted_by_broker",
        "paper_order_observability": obs,
        "message": (
            "Alpaca accepted the order — not a fill. Working orders can remain open until fill, expiry, or cancel; "
            "check Alpaca for status."
        ),
    }


def _hive_live_submit_armed() -> bool:
    return os.getenv("HIVE_LIVE_SUBMIT_ARMED", "").strip() == "1"


@app.post("/live/equity/order")
def live_equity_order(payload: dict[str, Any]):
    """
    Manual Alpaca live SPY equity limit order — qty 1 only. Admin auth + HIVE_LIVE_SUBMIT_ARMED=1.
    Does not touch paper sync, performance_source, or last_paper_order_observability.
    """
    if not _hive_live_submit_armed():
        return JSONResponse(
            status_code=403,
            content={
                "ok": False,
                "error": "live submit not armed: set HIVE_LIVE_SUBMIT_ARMED=1 on the worker (no live order without explicit env)",
            },
        )

    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"ok": False, "error": "JSON object body required"})

    key_id, secret = load_live_credentials()
    if not key_id or not secret:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "missing ALPACA_LIVE_KEY_ID or ALPACA_LIVE_SECRET_KEY"},
        )

    regime = compute_hive_session_regime_v1()
    if not bool(regime.get("market_hours")):
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": (
                    "Live probation slice: orders only during NYSE regular trading hours (RTH). "
                    "Retry Mon–Fri 9:30–16:00 ET."
                ),
                "reason": "outside_regular_trading_hours",
                "session_code": regime.get("code"),
                "session_label": regime.get("label"),
            },
        )

    try:
        snap = read_live_portfolio_snapshot(key_id, secret, timeout=LIVE_ORDER_PREFLIGHT_TIMEOUT)
    except AlpacaLiveError as e:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "error": f"live broker preflight failed: {str(e)[:200]}"},
        )

    try:
        spy_open_orders = int(snap["spy_open_order_count"])
    except (KeyError, TypeError, ValueError):
        return JSONResponse(
            status_code=502,
            content={"ok": False, "error": "live broker preflight failed: invalid snapshot"},
        )

    if spy_open_orders > 0:
        return JSONResponse(
            status_code=409,
            content={
                "ok": False,
                "error": (
                    "live broker preflight: outstanding SPY open orders exist; "
                    "wait for fills or cancel before submit"
                ),
            },
        )

    sym = str(payload.get("symbol") or "SPY").strip().upper()
    if sym != "SPY":
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "symbol must be SPY (equity only in this slice)"},
        )

    qty_raw = payload.get("qty")
    try:
        qty = int(qty_raw)
    except (TypeError, ValueError):
        return JSONResponse(status_code=400, content={"ok": False, "error": "qty must be integer 1"})
    if qty != 1:
        return JSONResponse(status_code=400, content={"ok": False, "error": "qty must be exactly 1 for live probation"})

    ot_raw = payload.get("order_type") or payload.get("type")
    if not isinstance(ot_raw, str) or not ot_raw.strip():
        return JSONResponse(status_code=400, content={"ok": False, "error": "order_type is required"})
    if ot_raw.strip().lower() != "limit":
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "order_type must be limit only for live probation"},
        )

    lp = payload.get("limit_price")
    try:
        limit_price = float(lp)
    except (TypeError, ValueError):
        return JSONResponse(status_code=400, content={"ok": False, "error": "limit_price required for limit orders"})
    if limit_price <= 0:
        return JSONResponse(status_code=400, content={"ok": False, "error": "limit_price must be positive"})

    side_raw = payload.get("side")
    if not isinstance(side_raw, str) or not side_raw.strip():
        return JSONResponse(status_code=400, content={"ok": False, "error": "side is required (buy or sell)"})
    side = side_raw.strip().lower()
    if side not in ("buy", "sell"):
        return JSONResponse(status_code=400, content={"ok": False, "error": "side must be buy or sell"})

    cid_raw = payload.get("client_order_id")
    if cid_raw is None:
        return JSONResponse(status_code=400, content={"ok": False, "error": "client_order_id is required"})
    cid_err = validate_live_client_order_id(str(cid_raw).strip())
    if cid_err:
        return JSONResponse(status_code=400, content={"ok": False, "error": cid_err})
    client_order_id = str(cid_raw).strip()

    net = _spy_net_qty_from_open_position(snap["open_position"])
    if side == "buy" and net is not None and net > 1e-9:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "buy rejected - SPY position already open (no stacking)"},
        )
    if side == "sell" and (net is None or net <= 1e-9):
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": "sell rejected - no SPY long position to reduce"},
        )

    if client_order_id in _live_client_order_ids:
        return JSONResponse(
            status_code=409,
            content={"ok": False, "error": "duplicate client_order_id in live idempotency window"},
        )

    with _live_equity_order_lock:
        if client_order_id in _live_client_order_ids:
            return JSONResponse(
                status_code=409,
                content={"ok": False, "error": "duplicate client_order_id in live idempotency window"},
            )
        try:
            out = submit_spy_equity_live_order(
                key_id,
                secret,
                side=side,
                qty=1,
                limit_price=limit_price,
                client_order_id=client_order_id,
            )
        except AlpacaLiveError as e:
            log(f"alpaca live equity order failed ({type(e).__name__})")
            return JSONResponse(
                status_code=502,
                content={"ok": False, "error": str(e)[:240]},
            )
        _live_client_order_ids.append(client_order_id)

    log("alpaca live equity order submitted")
    oid = out.get("id")
    obs = compact_live_order_observability(out) if isinstance(out, dict) else None
    if isinstance(obs, dict):
        obs["snapshot_freshness"] = "SUBMIT SNAPSHOT"
        obs["truth_note"] = (
            "Live: captured from Alpaca submit response; confirm status in Alpaca live dashboard."
        )
        state["last_live_order_observability"] = obs
    maybe_sync_alpaca_live(force=True)
    obs_out = state.get("last_live_order_observability")
    return {
        "ok": True,
        "error": None,
        "order_id": oid,
        "client_order_id": client_order_id,
        "broker_stage": "accepted_by_broker",
        "live_order_observability": obs_out,
        "message": (
            "Alpaca live accepted the order — not a fill. Working orders remain risk until closed; "
            "check Alpaca live for status."
        ),
    }


@app.post("/bot/start")
async def start_bot():
    if state["running"]:
        return {"message": "already running"}

    state["running"] = True
    asyncio.create_task(bot_loop())
    return {"message": "bot started"}


@app.post("/bot/stop")
def stop_bot():
    state["running"] = False
    log("bot stop requested — loop will exit after current sleep")
    return {"message": "bot stopping"}


@app.post("/cycle")
async def run_cycle():
    run_signal_cycle()
    maybe_auto_execute_options_paper()
    return {"message": "cycle done"}


@app.post("/config")
def update_config(patch: dict):
    if patch.get("use_live_alpaca") is True:
        return JSONResponse(
            status_code=400,
            content={
                "error": "use_live_alpaca=true is disabled in this build; live Alpaca routing is not available (H1A paper read sync only).",
            },
        )

    for k, v in patch.items():
        if k not in state["config"]:
            continue
        if k == "poll_seconds":
            try:
                n = int(v)
            except (TypeError, ValueError):
                continue
            state["config"][k] = max(1, min(3600, n))
        elif k == "paper_max_qty":
            try:
                n = int(v)
            except (TypeError, ValueError):
                continue
            state["config"][k] = max(1, min(500, n))
        elif k in ("enabled", "use_live_alpaca", "alpaca_paper_enabled", "alpaca_options_auto_enabled"):
            state["config"][k] = bool(v)
        else:
            state["config"][k] = v

    state["enabled"] = bool(state["config"]["enabled"])
    if "alpaca_paper_enabled" in patch and not bool(state["config"].get("alpaca_paper_enabled")):
        _reset_demo_portfolio_after_alpaca_off()

    log(f"config updated {patch}")
    return state["config"]


@app.post("/risk/reset")
def reset_risk():
    state["realized_pnl_today"] = 0
    state["consecutive_losses"] = 0
    log("risk reset")
    return {"message": "risk reset"}