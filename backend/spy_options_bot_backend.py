from __future__ import annotations

import asyncio
import os
from collections import deque
from datetime import datetime
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="SPY Options Bot", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3005",
        "http://192.168.68.53:3005",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.68.62:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BOT_ADMIN_KEY = os.getenv("BOT_ADMIN_KEY", "mysecret123")

state: dict[str, Any] = {
    "running": False,
    "enabled": False,
    "provider_mode": "mock",
    "cash": 15000,
    "equity": 15000,
    "realized_pnl_today": 0,
    "consecutive_losses": 0,
    "last_loop_at": None,
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

        await asyncio.sleep(state["config"]["poll_seconds"])

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
    return state


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
    return {"message": "bot stopping"}


@app.post("/cycle")
async def run_cycle():
    run_signal_cycle()
    return {"message": "cycle done"}


@app.post("/config")
def update_config(patch: dict):
    for k, v in patch.items():
        if k in state["config"]:
            state["config"][k] = v

    log(f"config updated {patch}")
    return state["config"]


@app.post("/risk/reset")
def reset_risk():
    state["realized_pnl_today"] = 0
    state["consecutive_losses"] = 0
    log("risk reset")
    return {"message": "risk reset"}