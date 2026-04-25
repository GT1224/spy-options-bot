"""
HIVE-C1-P1 — provisional trust tier / capital posture observability (read-only).

Does not size positions, change guardrails, ranking, or execution. Not an earned
historical trust ladder; uses current runtime contract slices only.
"""

from __future__ import annotations

from typing import Any


def compute_hive_capital_posture_v1(
    *,
    last_loop_at: str | None,
    signal_stale: bool,
    signal_freshness: dict[str, Any],
    shadow_book: dict[str, Any],
    guardrails: dict[str, Any],
    contract_quality: dict[str, Any],
    execution_edge: dict[str, Any],
    promotion_gate: dict[str, Any],
    execution_surface: str,
    broker_sync: dict[str, Any] | None,
    trading_enabled: bool,
    bot_running: bool,
    trade_action: str | None,
) -> dict[str, Any]:
    sf = signal_freshness if isinstance(signal_freshness, dict) else {}
    sb = shadow_book if isinstance(shadow_book, dict) else {}
    gr = guardrails if isinstance(guardrails, dict) else {}
    cq = contract_quality if isinstance(contract_quality, dict) else {}
    ee = execution_edge if isinstance(execution_edge, dict) else {}
    pg = promotion_gate if isinstance(promotion_gate, dict) else {}
    bs = broker_sync if isinstance(broker_sync, dict) else {}

    fresh_code = sf.get("code") if isinstance(sf.get("code"), str) else "unknown"
    gs = gr.get("status")
    contested = sb.get("contested")
    cq_st = cq.get("status")
    ee_st = ee.get("status")
    pg_st = pg.get("status")

    blockers: list[str] = []
    rationale: list[str] = [
        "C1-P1 is provisional — not an allocator, not historical performance trust, no sizing enforcement.",
        "high_conviction tier is intentionally not emitted in v1 (honesty overreach).",
    ]

    has_ts = isinstance(last_loop_at, str) and bool(last_loop_at.strip())
    demo_paper = (
        execution_surface == "alpaca_paper"
        and bs.get("performance_source") == "demo_seed"
    )
    if demo_paper:
        rationale.append("Paper surface synced but performance_source is demo_seed — treat trust as synthetic until Alpaca read backs treasury.")

    # --- tier ---
    tier: str
    if not has_ts and fresh_code == "unknown":
        tier = "unknown"
        blockers.append("No pulse timestamp and freshness unknown — insufficient context.")
    elif gs == "avoid":
        tier = "blocked"
        blockers.append("Guardrails status is avoid.")
    elif signal_stale or fresh_code == "stale":
        tier = "blocked"
        blockers.append("Signal is stale for capital posture.")
    elif trade_action == "trade" and cq_st in ("weak", "unknown"):
        tier = "blocked"
        blockers.append("Trade-shaped leg with weak or unscored contract quality.")
    elif trade_action != "trade":
        tier = "observe_only"
        rationale.append("no_trade pulse — no deployable option leg; posture is watch-only.")
    elif (
        execution_surface in ("signal_only", "alpaca_paper_degraded")
        or pg_st == "suppressed"
        or contested is True
        or fresh_code == "unknown"
        or not bot_running
        or not trading_enabled
    ):
        tier = "observe_only"
        if execution_surface == "signal_only":
            rationale.append("Execution surface is signal-only — no fresh paper sync for sizing context.")
        elif execution_surface == "alpaca_paper_degraded":
            rationale.append("Paper broker degraded — account telemetry unreliable for posture.")
        if pg_st == "suppressed":
            rationale.append("Promotion gate suppressed — do not treat leg as promotion-ready.")
        if contested is True:
            rationale.append("Shadow context: recent flow contested (directional disagreement).")
        if fresh_code == "unknown":
            rationale.append("Signal freshness unknown — stand down from confident posture.")
        if not bot_running:
            rationale.append("Swarm idle — no active cycling context.")
        if not trading_enabled:
            rationale.append("Trading disarmed — execution path blocked in config.")
    elif fresh_code == "aging" or gs == "caution" or ee_st == "caution":
        tier = "probationary"
        if fresh_code == "aging":
            rationale.append("Signal aging — time risk elevated for new capital.")
        if gs == "caution":
            rationale.append("Guardrails caution — provisional trust only.")
        if ee_st == "caution":
            rationale.append("Execution edge caution — reduce hypothetical size discipline.")
    elif fresh_code == "fresh" and gs == "viable" and contested is not True and execution_surface == "alpaca_paper":
        tier = "normal"
        rationale.append("Fresh signal, viable guardrails, synced paper surface — baseline provisional tier only.")
    else:
        tier = "observe_only"
        rationale.append("Defaulting to observe_only — mixed signals or edge pass-through (v1 conservative).")

    # --- posture (recommendation only) ---
    posture: str
    if tier == "blocked":
        posture = "none"
    elif tier == "unknown":
        posture = "unknown"
    elif tier == "observe_only":
        if not trading_enabled or trade_action != "trade":
            posture = "none"
        else:
            posture = "micro"
    elif tier == "probationary":
        posture = "reduced"
    elif tier == "normal":
        posture = "reduced" if ee_st == "caution" else "normal"
    else:
        posture = "unknown"

    tier_labels = {
        "blocked": "Blocked — do not deploy new risk",
        "observe_only": "Observe only — minimal or no hypothetical size",
        "probationary": "Probationary — reduced trust",
        "normal": "Normal provisional trust (not high conviction)",
        "unknown": "Unknown — insufficient runtime evidence",
    }
    tier_label = tier_labels.get(tier, tier_labels["unknown"])

    if tier == "normal" and posture == "normal" and demo_paper:
        posture = "reduced"
        rationale.append("Posture trimmed to reduced while treasury remains demo_seed-backed.")

    if tier == "unknown":
        cap_status = "unknown"
    elif has_ts:
        cap_status = "observed"
    else:
        cap_status = "provisional"

    src = (
        "HIVE-C1-P1 read-only: derived from guardrails, contract_quality, execution_edge, promotion_gate, "
        "signal_freshness, shadow_book, and execution_surface only; no ranking/guardrail/execution mutation."
    )

    return {
        "tier": tier,
        "tier_label": tier_label,
        "posture": posture,
        "status": cap_status,
        "rationale": rationale[:5],
        "blockers": blockers[:8],
        "observed_at": last_loop_at if has_ts else None,
        "source": src,
    }
