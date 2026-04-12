"""
HIVE Wave-1 local signal rank — distilled from premium signalRank ideas without
remote DB rows, external timestamps, or prediction-market fields. Explainable scoring.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _num(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _freshness_points(last_cycle_at: str | None) -> tuple[int, str]:
    if not last_cycle_at or not isinstance(last_cycle_at, str):
        return 0, "no cycle timestamp"
    try:
        raw = last_cycle_at.replace("Z", "+00:00")
        ts = datetime.fromisoformat(raw)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age_s = max(0.0, (datetime.now(timezone.utc) - ts).total_seconds())
    except (ValueError, TypeError):
        return 0, "unparsed cycle time"

    if age_s <= 300:
        return 20, "fresh (≤5m)"
    if age_s <= 900:
        return 14, "recent (≤15m)"
    if age_s <= 1800:
        return 8, "aging (≤30m)"
    if age_s <= 3600:
        return 4, "stale (≤60m)"
    return 0, "old (>60m)"


def compute_hive_rank_v1(
    setup: dict[str, Any],
    trade: dict[str, Any],
    direction: str | None,
    last_cycle_at: str | None,
) -> dict[str, Any]:
    """
    Returns rank_score 0–100, rank_factors breakdown, rationale { thesis, points }.
    When there is no usable setup yet, rank_score and rank_factors are null.
    """
    setup_score = _num(setup.get("setup_score"))
    spot = _num(setup.get("spot"))
    bias = setup.get("bias")
    bias_s = bias if isinstance(bias, str) else None

    if setup_score is None and spot is None:
        return {
            "rank_score": None,
            "rank_factors": None,
            "rationale": {
                "thesis": None,
                "points": ["Awaiting first signal cycle — no rank yet."],
            },
        }

    ss = int(round(max(0.0, min(100.0, setup_score or 0.0))))
    setup_quality = int(round(ss * 0.40))
    setup_quality = max(0, min(40, setup_quality))

    action = trade.get("action")
    struct = trade.get("structure")
    aligned = False
    if bias_s == "bullish" and struct == "long_call":
        aligned = True
    elif bias_s == "bearish" and struct == "long_put":
        aligned = True

    if aligned:
        directional_alignment = 20
    elif bias_s in ("bullish", "bearish") and action == "no_trade":
        directional_alignment = 8
    elif bias_s == "neutral":
        directional_alignment = 10
    elif bias_s in ("bullish", "bearish"):
        directional_alignment = 6
    else:
        directional_alignment = 5

    vwap = _num(setup.get("vwap"))
    ema8 = _num(setup.get("ema8"))
    ema21 = _num(setup.get("ema21"))
    momentum_alignment = 0
    mom_note = "insufficient tape"
    if spot is not None and vwap is not None and ema8 is not None and ema21 is not None:
        bull_tape = ema8 > ema21 and spot > vwap
        bear_tape = ema8 < ema21 and spot < vwap
        if bias_s == "bullish" and bull_tape:
            momentum_alignment = 15
            mom_note = "tape aligns with bullish bias"
        elif bias_s == "bearish" and bear_tape:
            momentum_alignment = 15
            mom_note = "tape aligns with bearish bias"
        elif bias_s == "neutral":
            momentum_alignment = 7
            mom_note = "neutral bias — mixed tape ok"
        else:
            momentum_alignment = 3
            mom_note = "tape vs bias mixed"
    else:
        momentum_alignment = 4
        mom_note = "partial tape — low confidence"

    vr = _num(setup.get("volume_ratio"))
    if vr is None:
        volume_confirmation = 0
        vol_note = "no volume ratio"
    elif vr > 1.2:
        volume_confirmation = 15
        vol_note = "volume elevated vs lookback"
    elif vr > 1.0:
        volume_confirmation = 10
        vol_note = "volume slightly above lookback"
    else:
        volume_confirmation = 5
        vol_note = "volume near or below lookback"

    if action == "trade" and struct:
        structure_clarity = 10 if trade.get("dte") is not None else 8
        struct_note = "actionable structure present"
    elif action == "no_trade":
        structure_clarity = 5
        struct_note = "explicit no-trade"
    else:
        structure_clarity = 2
        struct_note = "unclear structure"

    freshness, fresh_note = _freshness_points(last_cycle_at)

    penalties = 0
    pen_notes: list[str] = []
    if ss >= 75 and action == "no_trade":
        penalties = -8
        pen_notes.append("high setup score but no_trade — tempered rank")

    raw_total = (
        setup_quality
        + directional_alignment
        + momentum_alignment
        + volume_confirmation
        + structure_clarity
        + freshness
        + penalties
    )
    rank_score = int(max(0, min(100, raw_total)))

    rank_factors = {
        "setup_quality": setup_quality,
        "directional_alignment": directional_alignment,
        "momentum_alignment": momentum_alignment,
        "volume_confirmation": volume_confirmation,
        "structure_clarity": structure_clarity,
        "freshness": freshness,
        "penalties": penalties,
    }

    if direction == "call":
        dir_word = "call-biased"
    elif direction == "put":
        dir_word = "put-biased"
    else:
        dir_word = "neutral"

    if action == "trade" and struct:
        thesis = f"SPY {bias_s or 'mixed'} setup favors a {struct.replace('_', ' ')} — rank {rank_score}/100."
    elif action == "no_trade":
        # Mirrors recommended_trade() gates only (score ≥ 75 + directional bias); no new strategy.
        if bias_s == "neutral":
            thesis = (
                f"SPY neutral bias — rules hold no_trade this pulse (setup_score {ss}/100, hive rank {rank_score}/100)."
            )
        elif ss < 75:
            thesis = (
                f"SPY {bias_s or 'mixed'} — no trade: setup_score {ss}/100 is below the 75 bar "
                f"used by rules v1 (hive rank {rank_score}/100)."
            )
        else:
            thesis = (
                f"SPY {bias_s or 'mixed'} — no_trade despite score {ss}/100 (hive rank {rank_score}/100); "
                f"check snapshot if this looks unexpected."
            )
    elif bias_s in ("bullish", "bearish"):
        thesis = f"SPY {bias_s} tone ({dir_word}) — no qualified trade this cycle (rank {rank_score}/100)."
    else:
        thesis = f"SPY setup muted — rank {rank_score}/100."

    if action == "no_trade":
        if bias_s == "neutral":
            gate_lines = [
                f"Trade gate: neutral bias — rules do not emit long_call/long_put (setup_score {ss}/100).",
            ]
        elif ss < 75:
            gate_lines = [
                f"Trade gate: setup_score {ss}/100 is under the 75 minimum for a directional recommendation.",
            ]
        else:
            gate_lines = [
                f"Trade gate: no_trade with score {ss}/100 — verify bias/structure in the raw pulse if unclear.",
            ]
        points = [
            f"Setup quality +{setup_quality}/40 (from setup_score {ss}).",
            *gate_lines,
            f"Direction match +{directional_alignment}/20.",
            f"Momentum +{momentum_alignment}/15 — {mom_note}.",
            f"Volume +{volume_confirmation}/15 — {vol_note}.",
            f"Freshness +{freshness}/20 — {fresh_note}.",
        ]
        if pen_notes:
            points.extend(pen_notes)
        points = points[:5]
    else:
        points = [
            f"Setup quality +{setup_quality}/40 (from setup_score {ss}).",
            f"Direction match +{directional_alignment}/20.",
            f"Momentum +{momentum_alignment}/15 — {mom_note}.",
            f"Volume +{volume_confirmation}/15 — {vol_note}.",
            f"Structure +{structure_clarity}/10 — {struct_note}.",
            f"Freshness +{freshness}/20 — {fresh_note}.",
        ]
        if pen_notes:
            points.extend(pen_notes)
        points = points[:5]

    return {
        "rank_score": rank_score,
        "rank_factors": rank_factors,
        "rationale": {"thesis": thesis, "points": points},
    }
