"""
HIVE-AI1-P1 — AI attribution / capital governance observability (read-only v1).

Does not enable AI, change routing, sizing, or trust. Surfaces honest runtime facts
about whether any AI-attributed decision path exists in the contract.
"""

from __future__ import annotations

from typing import Any

# Extend when contract gains real AI provenance; keep conservative.
_AI_ATTRIBUTED_SIGNAL_TYPES = frozenset({"ai", "llm", "model", "model_assisted", "agent"})


def compute_hive_ai_governance_v1(
    *,
    signal_type: Any,
    last_loop_at: str | None,
    capital_posture_tier: str | None,
    alpaca_options_auto_enabled: bool,
) -> dict[str, Any]:
    """
    Truth-first governance skeleton. HIVE v1 stack is rules/mock-tape only unless
    `top_signal.signal_type` explicitly marks an AI-attributed path.
    """
    st = signal_type if isinstance(signal_type, str) else None
    st_l = st.strip().lower() if st and st.strip() else None

    has_ts = isinstance(last_loop_at, str) and bool(last_loop_at.strip())

    ai_signal_present: bool | None
    if st_l is None:
        ai_signal_present = None
    else:
        ai_signal_present = st_l in _AI_ATTRIBUTED_SIGNAL_TYPES

    # Repository has no LLM client wiring; capability flag is false until a real integration exists.
    ai_present = False

    rationale: list[str] = [
        "AI1-P1 is attribution/governance only — not a scorecard, allocator, or enforcement layer.",
        "Backend has no OpenAI/LLM client path in this repo; ai_present is false by construction.",
        f"Contract signal_type is {st_l!r} — HIVE v1 ranks rules/mock-tape signals only.",
    ]
    if alpaca_options_auto_enabled:
        rationale.append(
            "Paper options AUTO is deterministic gate + broker submit — not AI attribution; no AI capital privilege."
        )
    if isinstance(capital_posture_tier, str) and capital_posture_tier.strip():
        rationale.append(
            f"capital_posture.tier={capital_posture_tier.strip()} is context only — does not grant AI privilege."
        )

    blockers: list[str] = []

    if ai_signal_present:
        posture = "active_read_only"
        posture_label = "AI-attributed signal surfaced (read-only governance)"
        capital_privilege = "none"
        rationale.append(
            "Signal is marked AI-attributed in contract — still no AI capital privilege in v1 unless future lanes prove otherwise."
        )
    elif st_l == "rules":
        posture = "absent"
        posture_label = "AI absent — rules-only decision surface"
        capital_privilege = "none"
    elif st_l is None:
        posture = "unknown"
        posture_label = "AI governance unknown — missing signal_type"
        capital_privilege = "unknown"
        blockers.append("top_signal.signal_type missing — cannot attribute AI vs rules.")
    else:
        posture = "observe_only"
        posture_label = "Observe only — signal_type not rules and not AI-attributed"
        capital_privilege = "none"
        rationale.append(
            f"signal_type={st_l!r} is outside known AI tags — no AI capital privilege; clarify provenance in a future lane."
        )

    if posture == "absent":
        gov_status = "observed" if has_ts or st_l is not None else "provisional"
    elif posture == "unknown":
        gov_status = "unknown"
    elif posture == "observe_only":
        gov_status = "observed" if has_ts else "provisional"
    else:
        gov_status = "observed" if has_ts else "provisional"

    src = (
        "HIVE-AI1-P1 read-only: derived from top_signal.signal_type, static repo fact (no LLM wiring), "
        "and config alpaca_options_auto_enabled flag; no ranking/guardrail/execution changes."
    )

    return {
        "posture": posture,
        "posture_label": posture_label,
        "ai_present": ai_present,
        "ai_signal_present": ai_signal_present,
        "capital_privilege": capital_privilege,
        "status": gov_status,
        "rationale": rationale[:5],
        "blockers": blockers[:6],
        "observed_at": last_loop_at if has_ts else None,
        "source": src,
    }
