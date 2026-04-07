"""
HIVE Wave-1 local guardrails — conservative gates from FastAPI state only.
No remote DB or prediction-market fields.
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


def _age_seconds(last_cycle_at: str | None) -> float | None:
    if not last_cycle_at or not isinstance(last_cycle_at, str):
        return None
    try:
        raw = last_cycle_at.replace("Z", "+00:00")
        ts = datetime.fromisoformat(raw)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - ts).total_seconds())
    except (ValueError, TypeError):
        return None


def compute_hive_guardrails_v1(
    *,
    setup: dict[str, Any],
    trade: dict[str, Any],
    direction: str | None,
    last_cycle_at: str | None,
    rank_score: int | None,
    bot_running: bool,
    trading_enabled: bool,
    open_position: Any,
    consecutive_losses: Any,
) -> dict[str, Any]:
    """
    Returns guardrails object (never null). Uses conservative Wave-1 rules only.
    """
    triggered: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []

    spot = setup.get("spot")
    setup_score = _num(setup.get("setup_score"))
    bias = setup.get("bias")
    bias_s = bias if isinstance(bias, str) else None
    vr = _num(setup.get("volume_ratio"))
    action = trade.get("action")
    struct = trade.get("structure")

    age = _age_seconds(last_cycle_at)
    losses = 0
    if consecutive_losses is not None:
        try:
            losses = int(consecutive_losses)
        except (TypeError, ValueError):
            losses = 0

    hard_block = False

    if spot is None and setup_score is None:
        triggered.append("no_signal_data")
        warnings.append("No signal cycle data yet.")
        notes.append("Run Pulse Cycle or start the bot with trading armed.")

    if not trading_enabled:
        triggered.append("trading_disabled")
        warnings.append("Trading is disarmed — execution path blocked.")
        hard_block = True

    if not bot_running:
        triggered.append("bot_not_running")
        warnings.append("Swarm idle — automated cycles are not running.")

    if action == "no_trade" or not struct:
        triggered.append("no_qualified_trade")
        warnings.append("Recommended action is no_trade or structure is missing.")

    if age is None and spot is not None:
        triggered.append("unknown_freshness")
        warnings.append("Cannot assess signal age (no last_cycle_at).")
    elif age is not None:
        if age > 3600:
            triggered.append("stale_signal_severe")
            warnings.append("Signal older than 60 minutes — treat as expired.")
            if action == "trade":
                hard_block = True
        elif age > 1800:
            triggered.append("stale_signal_moderate")
            warnings.append("Signal older than 30 minutes — freshness degraded.")

    if open_position is not None:
        triggered.append("open_position_active")
        warnings.append("An open position exists — avoid stacking exposure.")

    if losses >= 5:
        triggered.append("loss_streak_severe")
        warnings.append("Loss streak elevated (≥5) — stand down.")
        hard_block = True
    elif losses >= 2:
        triggered.append("loss_streak_caution")
        warnings.append("Recent losses — reduce size or pause.")

    if setup_score is not None and setup_score < 45:
        triggered.append("weak_setup_score")
        warnings.append("Setup score below conservative threshold.")

    if rank_score is not None:
        if rank_score < 20 and action == "trade":
            triggered.append("weak_rank_severe")
            warnings.append("Rank score very low for a trade recommendation.")
            hard_block = True
        elif rank_score < 40:
            triggered.append("weak_rank")
            warnings.append("Rank score is weak — review before acting.")

    if vr is not None and vr < 0.95:
        triggered.append("weak_volume_confirmation")
        warnings.append("Volume ratio below prior-bar average.")

    if bias_s == "neutral" and action == "trade":
        triggered.append("neutral_bias_trade")
        warnings.append("Bias is neutral while a trade is suggested — mixed clarity.")

    if direction is None and action == "trade":
        triggered.append("unclear_direction")
        warnings.append("Direction metadata is unclear for this trade.")

    # Status rollup
    if hard_block or "trading_disabled" in triggered or "loss_streak_severe" in triggered:
        status = "avoid"
    elif len(triggered) == 0:
        status = "viable"
    elif len(triggered) == 1 and "no_signal_data" in triggered:
        status = "caution"
    else:
        status = "caution"

    stale_exec_block = age is not None and age > 1800 and action == "trade"
    actionable = (
        status != "avoid"
        and action == "trade"
        and trading_enabled
        and bot_running
        and open_position is None
        and losses < 5
        and not stale_exec_block
        and (rank_score is None or rank_score >= 20)
        and spot is not None
    )

    if hard_block:
        actionable = False

    out: dict[str, Any] = {
        "status": status,
        "actionable": actionable,
        "warnings": warnings,
        "triggered_rules": triggered,
    }
    if notes:
        out["notes"] = notes
    return out
