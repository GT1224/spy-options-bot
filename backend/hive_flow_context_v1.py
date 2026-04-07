"""
HIVE Wave 2 — flow context lite: tiny in-process rhythm from recent local pulses only.
Not order flow, not tape — local HIVE signal clustering / mixedness in this process.
"""

from __future__ import annotations

from typing import Any

FLOW_BUFFER_CAP = 8


def compute_hive_flow_context_v1(
    *,
    recent_entries: list[dict[str, Any]],
    consecutive_losses: Any,
    open_position: Any,
    promotion_gate: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Summarize last up to FLOW_BUFFER_CAP entries appended after each run_signal_cycle.
    """
    entries = [e for e in recent_entries if isinstance(e, dict)]
    n = len(entries)

    try:
        losses = int(consecutive_losses) if consecutive_losses is not None else 0
    except (TypeError, ValueError):
        losses = 0
    losses = max(0, losses)
    has_pos = open_position is not None

    if n == 0:
        return {
            "status": "none",
            "label": "No local rhythm",
            "detail": "No recent local pulse history yet — run Pulse Cycle to build an in-process-only window (not market flow).",
            "evidence_count": None,
        }

    if losses >= 2 or has_pos:
        return {
            "status": "caution",
            "label": "Book noise",
            "detail": "Open position or loss streak in local state — interpret pulse rhythm together with risk context (still not order flow).",
            "evidence_count": n,
        }

    if n <= 2:
        return {
            "status": "thin",
            "label": "Thin window",
            "detail": "Only one or two recent local pulses — too small to infer streak vs chop (HIVE process memory only).",
            "evidence_count": n,
        }

    tail = entries[-min(6, n) :]
    biases = [e.get("bias") for e in tail if isinstance(e.get("bias"), str)]
    has_bull = "bullish" in biases
    has_bear = "bearish" in biases
    if len(tail) >= 3 and has_bull and has_bear:
        return {
            "status": "mixed",
            "label": "Mixed bias",
            "detail": "Recent local pulses show both bullish and bearish bias in the tiny window — directional churn in-process only, not tape.",
            "evidence_count": n,
        }

    actions = [e.get("action") for e in tail]
    if len(tail) >= 4:
        changes = sum(1 for i in range(1, len(actions)) if actions[i] != actions[i - 1])
        if changes >= 3:
            return {
                "status": "mixed",
                "label": "Choppy actions",
                "detail": "Trade vs no_trade flipped often across recent pulses — local rhythm looks choppy (not broker flow).",
                "evidence_count": n,
            }

    pg_status = promotion_gate.get("status") if isinstance(promotion_gate, dict) else None
    if pg_status == "suppressed":
        return {
            "status": "caution",
            "label": "Rhythm vs gate",
            "detail": "Several local pulses exist but the current promotion gate is suppressed — rhythm is noisy versus actionable read (clock-local only).",
            "evidence_count": n,
        }

    if losses >= 1 and n >= 5:
        return {
            "status": "caution",
            "label": "Loss + rhythm",
            "detail": "Several pulses with a recent loss on file — treat local rhythm as higher uncertainty.",
            "evidence_count": n,
        }

    last3 = entries[-3:]
    if len(last3) == 3:
        b0, b1, b2 = (last3[0].get("bias"), last3[1].get("bias"), last3[2].get("bias"))
        if b0 == b1 == b2 and b0 in ("bullish", "bearish"):
            return {
                "status": "aligned",
                "label": "Bias streak",
                "detail": "Last three local pulses share the same directional bias — short in-process streak only; not market-wide conviction.",
                "evidence_count": n,
            }
        if all(last3[i].get("action") == "no_trade" for i in range(3)):
            return {
                "status": "aligned",
                "label": "No-trade streak",
                "detail": "Last three pulses were no_trade locally — repeated stand-down rhythm in this process window.",
                "evidence_count": n,
            }
        st0, st1, st2 = (
            last3[0].get("structure"),
            last3[1].get("structure"),
            last3[2].get("structure"),
        )
        if st0 == st1 == st2 and st0 in ("long_call", "long_put"):
            return {
                "status": "aligned",
                "label": "Structure streak",
                "detail": "Last three pulses agreed on the same option structure locally — narrow agreement, not options tape.",
                "evidence_count": n,
            }

    return {
        "status": "caution",
        "label": "Ambiguous rhythm",
        "detail": "Enough local pulses to compare, but no clear same-direction streak — ambiguous in-process pattern only.",
        "evidence_count": n,
    }
