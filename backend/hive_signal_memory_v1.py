"""
HIVE Wave 2 — signal memory lite: honest summary of in-process local evidence only.
No archive, no win rates, no external history — counts and risk fields already on state.
"""

from __future__ import annotations

from typing import Any


def compute_hive_signal_memory_v1(
    *,
    signal_cycle_count: int,
    last_loop_at: str | None,
    spot: Any,
    setup_score: Any,
    consecutive_losses: Any,
    open_position: Any,
) -> dict[str, Any]:
    """
    Classify how much truthful local evidence exists in this running process.

    `signal_cycle_count` must reflect completed `run_signal_cycle` executions only.
    """
    try:
        cycles = max(0, int(signal_cycle_count))
    except (TypeError, ValueError):
        cycles = 0

    try:
        losses = int(consecutive_losses) if consecutive_losses is not None else 0
    except (TypeError, ValueError):
        losses = 0
    losses = max(0, losses)

    has_setup = spot is not None or setup_score is not None
    has_position = open_position is not None

    if cycles <= 0 or not last_loop_at or not has_setup:
        return {
            "status": "none",
            "label": "No memory yet",
            "detail": "No local signal memory yet — run Pulse Cycle to accumulate in-process evidence (not a historical archive).",
            "evidence_count": None,
        }

    if losses >= 2:
        return {
            "status": "caution",
            "label": "Loss streak",
            "detail": "Consecutive losses in local state are elevated — interpret signals with extra discipline until risk resets.",
            "evidence_count": cycles,
        }

    if losses >= 1 and cycles >= 4:
        return {
            "status": "caution",
            "label": "Mixed risk",
            "detail": "Recent loss recorded with several local cycles — evidence exists but risk context is not clean.",
            "evidence_count": cycles,
        }

    if has_position:
        return {
            "status": "caution",
            "label": "Open exposure",
            "detail": "An open position is on file — fresh signals mix with live book risk; keep sizing conservative.",
            "evidence_count": cycles,
        }

    if cycles >= 15 and losses == 0 and not has_position:
        return {
            "status": "supported",
            "label": "Deep local sample",
            "detail": "Many pulse cycles this session with clean risk counters — still not a performance engine; only repetition in this process.",
            "evidence_count": cycles,
        }

    return {
        "status": "limited",
        "label": "Limited sample",
        "detail": "Very small in-process sample — early evidence only; do not infer long-run edge from this count.",
        "evidence_count": cycles,
    }
