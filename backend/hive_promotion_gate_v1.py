"""
HIVE Wave 2 — promotion gate: thin combinator over existing rank, guardrails,
contract quality, and execution_edge. No new scoring brain, no external data.
"""

from __future__ import annotations

from typing import Any


def compute_hive_promotion_gate_v1(
    *,
    setup: dict[str, Any],
    trade: dict[str, Any],
    rank_score: int | None,
    guardrails: dict[str, Any],
    contract_quality: dict[str, Any],
    execution_edge: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Returns promotion_gate dict, or None when there is no setup context yet
    (same threshold as rank/execution unknown paths).
    """
    spot = setup.get("spot")
    setup_score = setup.get("setup_score")
    if spot is None and setup_score is None:
        return None

    action = trade.get("action")
    gs = guardrails.get("status")
    actionable = bool(guardrails.get("actionable"))
    cq_status = contract_quality.get("status")
    es = execution_edge.get("status")

    if action != "trade":
        return {
            "status": "suppressed",
            "reason": "Recommendation is no_trade — nothing to promote.",
            "factors": ["no_trade"],
            "passes_minimum": False,
        }

    if gs == "avoid":
        return {
            "status": "suppressed",
            "reason": "Guardrails are avoid — signal withheld from promotion.",
            "factors": ["guardrails_avoid"],
            "passes_minimum": False,
        }

    if cq_status == "weak" and (rank_score is None or rank_score < 50):
        return {
            "status": "suppressed",
            "reason": "Contract quality weak and rank does not compensate.",
            "factors": ["contract_quality_weak"],
            "passes_minimum": False,
        }

    if rank_score is not None and rank_score < 28:
        return {
            "status": "suppressed",
            "reason": "Hive rank below minimum floor for promotion.",
            "factors": ["rank_below_floor"],
            "passes_minimum": False,
        }

    if es == "pass":
        blockers = execution_edge.get("blockers") or []
        first = blockers[0] if isinstance(blockers, list) and blockers else "Execution path not cleared."
        reason = first if isinstance(first, str) else "Execution path not cleared."
        return {
            "status": "suppressed",
            "reason": reason,
            "factors": ["execution_pass"],
            "passes_minimum": False,
        }

    if es == "unknown":
        return {
            "status": "hold",
            "reason": "Execution readiness unknown — wait for signal context.",
            "factors": ["execution_unknown"],
            "passes_minimum": False,
        }

    rank_ok = rank_score is None or rank_score >= 42
    cq_ok = cq_status in ("strong", "acceptable")

    if es == "go" and actionable and cq_ok and rank_ok:
        factors = ["exec_go", "guard_ok", f"cq_{cq_status or 'unknown'}"]
        factors.append(f"rank_{rank_score}" if rank_score is not None else "rank_pending")
        return {
            "status": "promoted",
            "reason": "Combined rank, guardrails, contract quality, and execution edge clear the gate.",
            "factors": factors[:8],
            "passes_minimum": True,
        }

    if es == "caution" and actionable:
        return {
            "status": "hold",
            "reason": "Execution edge is caution — borderline; review before sizing.",
            "factors": ["execution_caution", f"guard_{gs}", f"cq_{cq_status}"],
            "passes_minimum": False,
        }

    if es == "go" and not actionable:
        return {
            "status": "hold",
            "reason": "Execution reads go but guardrails mark not actionable — on hold.",
            "factors": ["exec_go_not_actionable"],
            "passes_minimum": False,
        }

    if es == "go" and actionable and not rank_ok:
        return {
            "status": "hold",
            "reason": "Rank is borderline — hold until evidence strengthens.",
            "factors": ["rank_borderline"],
            "passes_minimum": False,
        }

    if es == "go" and actionable and not cq_ok:
        return {
            "status": "hold",
            "reason": "Contract quality not yet acceptable for full promotion.",
            "factors": ["cq_not_acceptable"],
            "passes_minimum": False,
        }

    return {
        "status": "hold",
        "reason": "Mixed evidence — use full Hive rows before sizing.",
        "factors": [f"exec_{es}", f"guard_{gs}"],
        "passes_minimum": False,
    }
