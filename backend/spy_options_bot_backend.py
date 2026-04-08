from __future__ import annotations

import asyncio
import hashlib
import json
import os
import threading
from collections import deque
from datetime import datetime
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
from hive_session_regime_v1 import compute_hive_session_regime_v1
from hive_signal_memory_v1 import compute_hive_signal_memory_v1
from hive_signal_rank_v1 import compute_hive_rank_v1

load_dotenv()

app = FastAPI(title="SPY Options Bot", version="2.0")
# Single stack: union of the two former CORSMiddleware registrations (strict superset).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3005",
        "http://192.168.68.53:3005",
        "https://spy-options-frqj0c08q-grant-turnbows-projects.vercel.app",
        "https://hive-control-ah90ycp6j-grant-turnbows-projects.vercel.app",
        "https://hive-control-2.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BOT_ADMIN_KEY = os.getenv("BOT_ADMIN_KEY", "mysecret123")

# Serializes run_signal_cycle across bot_loop and POST /cycle (sync + threadpool).
_signal_cycle_lock = threading.Lock()

state: dict[str, Any] = {
    "running": False,
    # Duplicates config["enabled"] for raw /state; kept in sync in update_config only.
    "enabled": False,
    "provider_mode": "mock",
    "cash": 15000,
    "equity": 15000,
    "realized_pnl_today": 0,
    "consecutive_losses": 0,
    "last_loop_at": None,
    "signal_cycle_count": 0,
    "recent_signal_flow": [],
    "prior_pulse_compact": None,
    "open_position": None,
    "logs": [],
    "signal_snapshot": {},
    "config": {
        "enabled": False,
        "use_live_alpaca": False,
        "poll_seconds": 10,
    }
}

prices = deque(maxlen=100)
volumes = deque(maxlen=100)
opening_range_prices = []
mock_price = 580.0
cycle_count = 0


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


def build_hive_contract_v1() -> dict[str, Any]:
    """Wave-1 HIVE contract: FastAPI-owned JSON for Next.js (no external services)."""
    snap = state.get("signal_snapshot") or {}
    cfg = state.get("config") or {}
    trade = snap.get("recommended_trade") or {}
    bias = snap.get("bias")
    setup_score = snap.get("setup_score")

    confidence: float | None
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

    return {
        "system_state": {
            "bot_running": bool(state.get("running")),
            "trading_enabled": trading_enabled,
            # Alpaca toggle is a settings preference only — this process does not route orders.
            "mode": "live" if use_live else "paper",
            "execution_surface": "signal_only",
            "provider_mode": state.get("provider_mode"),
            "last_cycle_at": state.get("last_loop_at"),
            # No in-process order queue; reserved for future broker wiring (not used today).
            "pending_signals_count": 0,
            "health": {"ok": True},
            "freshness": {"signal_stale_after_ms": 25 * 60 * 1000},
            "session_regime": session_regime,
        },
        "top_signal": {
            "signal_id": signal_id,
            "underlying": "SPY",
            "direction": direction,
            "confidence": confidence,
            "signal_type": "rules",
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
            "unrealized_pnl": None,
        },
        "ui_visibility": {
            "core": [
                "system_state",
                "system_state.session_regime",
                "system_state.execution_surface",
                "top_signal.setup",
                "top_signal.recommended_trade",
                "performance_state",
            ],
            "advanced": [
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
        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized"}
        )

    return await call_next(request)


async def bot_loop():
    log("bot started")

    while state["running"]:
        if state["config"]["enabled"]:
            run_signal_cycle()

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
        "provider": state["provider_mode"]
    }


@app.get("/state")
def get_state():
    body = dict(state)
    body["hive_contract_v1"] = build_hive_contract_v1()
    return body


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
    return {"message": "cycle done"}


@app.post("/config")
def update_config(patch: dict):
    for k, v in patch.items():
        if k not in state["config"]:
            continue
        if k == "poll_seconds":
            try:
                n = int(v)
            except (TypeError, ValueError):
                continue
            state["config"][k] = max(1, min(3600, n))
        elif k in ("enabled", "use_live_alpaca"):
            state["config"][k] = bool(v)
        else:
            state["config"][k] = v

    state["enabled"] = bool(state["config"]["enabled"])
    log(f"config updated {patch}")
    return state["config"]


@app.post("/risk/reset")
def reset_risk():
    state["realized_pnl_today"] = 0
    state["consecutive_losses"] = 0
    log("risk reset")
    return {"message": "risk reset"}