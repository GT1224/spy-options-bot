"""
HIVE Wave 3 — cycle delta lite: current vs immediately prior in-process pulse only.
Not history, not trends — two-snapshot diff of a compact field set.
"""

from __future__ import annotations

from typing import Any

_TRACKED_KEYS = (
    "rank_score",
    "promotion_status",
    "execution_status",
    "cq_status",
    "direction",
    "bias",
    "trade_action",
    "trade_structure",
    "session_code",
)

_MEANINGFUL_KEYS = frozenset(
    {
        "promotion_status",
        "execution_status",
        "cq_status",
        "trade_action",
        "trade_structure",
        "bias",
        "direction",
    }
)


def _rank_jump_meaningful(prior: dict[str, Any], current: dict[str, Any]) -> bool:
    a = prior.get("rank_score")
    b = current.get("rank_score")
    if isinstance(a, int) and isinstance(b, int):
        return abs(a - b) >= 8
    return a != b and (a is not None or b is not None)


def _rank_jump_minor(prior: dict[str, Any], current: dict[str, Any]) -> bool:
    a = prior.get("rank_score")
    b = current.get("rank_score")
    if isinstance(a, int) and isinstance(b, int):
        return 0 < abs(a - b) < 8
    return False


def compute_hive_cycle_delta_v1(*, prior: dict[str, Any] | None, current: dict[str, Any]) -> dict[str, Any]:
    """
    Compare `current` compact pulse snapshot to `prior` (last `/state` contract build).
    `prior` is None until after the first snapshot has been stored.
    """
    if prior is None:
        return {
            "status": "none",
            "label": "No prior pulse",
            "detail": "Run another pulse to diff against the last one (in-process only, not a history product).",
            "changed_fields": [],
        }

    changed_fields: list[str] = []
    for k in _TRACKED_KEYS:
        if prior.get(k) != current.get(k):
            changed_fields.append(k)

    if not changed_fields:
        return {
            "status": "unchanged",
            "label": "Same as last pulse",
            "detail": "Tracked fields match the prior in-process snapshot.",
            "changed_fields": [],
        }

    changed_set = set(changed_fields)
    rank_meaningful = "rank_score" in changed_set and _rank_jump_meaningful(prior, current)
    rank_minor_only = (
        changed_set == {"rank_score"} and _rank_jump_minor(prior, current)
    )

    if changed_set & _MEANINGFUL_KEYS or rank_meaningful:
        detail = f"Changed vs last pulse: {', '.join(changed_fields[:6])}"
        if len(changed_fields) > 6:
            detail += "…"
        return {
            "status": "meaningful_change",
            "label": "Meaningful shift",
            "detail": detail,
            "changed_fields": changed_fields,
        }

    if changed_set == {"session_code"} or rank_minor_only or changed_set <= {"rank_score", "session_code"}:
        return {
            "status": "minor_change",
            "label": "Minor drift",
            "detail": f"Small change vs last pulse: {', '.join(changed_fields)}.",
            "changed_fields": changed_fields,
        }

    return {
        "status": "minor_change",
        "label": "Minor drift",
        "detail": f"Changed vs last pulse: {', '.join(changed_fields[:5])}.",
        "changed_fields": changed_fields,
    }


def compact_pulse_snapshot(
    *,
    rank_score: int | None,
    promotion_gate: dict[str, Any] | None,
    execution_edge: dict[str, Any],
    contract_quality: dict[str, Any],
    direction: str | None,
    bias: Any,
    trade: dict[str, Any],
    session_regime: dict[str, Any],
) -> dict[str, Any]:
    """Tiny dict stored in process state between contract builds."""
    pg = promotion_gate if isinstance(promotion_gate, dict) else None
    return {
        "rank_score": rank_score if isinstance(rank_score, int) else None,
        "promotion_status": pg.get("status") if pg else None,
        "execution_status": execution_edge.get("status"),
        "cq_status": contract_quality.get("status"),
        "direction": direction,
        "bias": bias if isinstance(bias, str) else None,
        "trade_action": trade.get("action"),
        "trade_structure": trade.get("structure"),
        "session_code": session_regime.get("code"),
    }
