"""
HIVE Wave-1 execution readiness — honest synthesis of rank, guardrails, contract quality,
and local state. No fills, no chain, no broker routing, no remote DB.
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


def compute_hive_execution_edge_v1(
    setup: dict[str, Any],
    trade: dict[str, Any],
    last_cycle_at: str | None,
    rank_bundle: dict[str, Any],
    guardrails: dict[str, Any],
    contract_quality: dict[str, Any],
    bot_running: bool,
    trading_enabled: bool,
    mode: str,
    open_position: Any,
    consecutive_losses: Any,
) -> dict[str, Any]:
    reasons: list[str] = []
    blockers: list[str] = []
    notes: list[str] = []

    spot = setup.get("spot")
    setup_score = _num(setup.get("setup_score"))
    action = trade.get("action")

    rank_score = rank_bundle.get("rank_score")
    rs = rank_score if isinstance(rank_score, int) else None
    factors = rank_bundle.get("rank_factors") or {}

    cq = contract_quality
    cq_status = cq.get("status")
    cq_score = cq.get("score")
    cq_s = cq_score if isinstance(cq_score, int) else None

    gs = guardrails.get("status")
    actionable = bool(guardrails.get("actionable"))

    losses = 0
    if consecutive_losses is not None:
        try:
            losses = int(consecutive_losses)
        except (TypeError, ValueError):
            losses = 0

    age = _age_seconds(last_cycle_at)

    if spot is None and setup_score is None:
        return {
            "status": "unknown",
            "score": None,
            "reasons": [],
            "blockers": ["No signal context — execution readiness undefined."],
            "notes": ["Run Pulse Cycle to refresh snapshot data."],
        }

    if action != "trade":
        return {
            "status": "pass",
            "score": None,
            "reasons": [],
            "blockers": [
                "no_trade — nothing to execute (signal_only; no broker routing in this process).",
            ],
        }

    if gs == "avoid":
        blockers.append("Guardrails are avoid — do not pursue this entry.")
    if not actionable:
        blockers.append("Guardrails mark this signal as not actionable right now.")
    if cq_status == "unknown":
        blockers.append("Contract quality unknown — structure not scored.")
    elif cq_status == "weak":
        blockers.append("Contract quality weak — structure not execution-ready.")

    if open_position is not None:
        blockers.append("Open position on file — avoid stacking without a plan.")

    if age is None:
        blockers.append("Cannot assess signal freshness (missing last_cycle_at).")
    elif age > 3600:
        blockers.append("Signal is older than 60 minutes — too stale to treat as live.")
    elif age > 1800:
        blockers.append("Signal is older than 30 minutes — execution edge degraded.")

    if not trading_enabled:
        blockers.append("Trading is disarmed.")
    if not bot_running:
        blockers.append("Bot swarm is idle (no automated cycling).")

    if losses >= 3:
        blockers.append("Elevated loss streak — pause or size down before acting.")

    notes.append(
        f"In-process SPY signal only — no broker orders; settings mode label is {mode!r} "
        "(preference, not proof of routing)."
    )

    # Supporting reasons (only when not hard-blocked on core gates)
    if rs is not None and rs >= 55:
        reasons.append(f"Hive rank {rs} supports considering execution.")
    if cq_s is not None and cq_s >= 60:
        reasons.append(f"Contract quality score {cq_s} is supportive.")
    if cq_status == "strong":
        reasons.append("Contract structure reads strong for v1 data.")
    if gs == "viable" and actionable:
        reasons.append("Guardrails viable and actionable.")
    elif gs == "caution" and actionable:
        reasons.append("Guardrails caution — proceed only with discipline.")
    if isinstance(factors, dict) and factors.get("freshness", 0) >= 14:
        reasons.append("Rank freshness component still respectable.")

    # Score 0–100: conservative blend
    r_part = (rs or 0) * 0.42
    cq_part = (cq_s if cq_s is not None else (rs or 0)) * 0.38
    score_f = r_part + cq_part
    if gs == "viable":
        score_f += 12.0
    elif gs == "caution":
        score_f += 4.0
    if actionable:
        score_f += 8.0
    if cq_status == "strong":
        score_f += 6.0
    elif cq_status == "acceptable":
        score_f += 3.0
    if age is not None:
        if age > 3600:
            score_f -= 40.0
        elif age > 1800:
            score_f -= 18.0
        elif age > 900:
            score_f -= 8.0
    if losses >= 3:
        score_f -= 12.0
    if not trading_enabled or not bot_running:
        score_f -= 15.0
    if open_position is not None:
        score_f -= 20.0
    if gs == "avoid":
        score_f -= 35.0
    if not actionable:
        score_f -= 25.0
    if cq_status == "weak":
        score_f -= 22.0

    score = int(round(max(0.0, min(100.0, score_f))))

    hard_stop = (
        gs == "avoid"
        or not actionable
        or cq_status in ("unknown", "weak")
        or not trading_enabled
        or (age is not None and age > 3600)
    )

    if hard_stop:
        status = "pass"
    elif score >= 68 and actionable and cq_status in ("strong", "acceptable"):
        if gs == "viable":
            status = "go"
        elif gs == "caution" and score >= 80:
            status = "go"
        else:
            status = "caution"
    elif score >= 38:
        status = "caution"
    else:
        status = "pass"

    out: dict[str, Any] = {
        "status": status,
        "score": score,
        "reasons": reasons[:6],
        "blockers": blockers[:10],
    }
    if notes:
        out["notes"] = notes
    return out
