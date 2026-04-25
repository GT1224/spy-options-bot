"""
HIVE-S1-P1 — shadow context / counterfactual replay observability (read-only, v1).

HIVE does not maintain a ranked rejected-candidate set. v1 summarizes only:
- the current pulse bias (active top-signal setup bias), and
- recent_signal_flow (small in-process deque, not a shadow ledger).

Does not affect ranking, guardrails, execution, or gating.
"""

from __future__ import annotations

from typing import Any


def _flow_entries(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    return [e for e in raw if isinstance(e, dict)]


def _normalize_bias(b: Any) -> str:
    if b == "bullish":
        return "bullish"
    if b == "bearish":
        return "bearish"
    if b == "neutral":
        return "neutral"
    return "unknown"


def compute_hive_shadow_book_v1(
    *,
    recent_flow: Any,
    active_bias: Any,
    last_loop_at: str | None,
    flow_buffer_cap: int,
) -> dict[str, Any]:
    """
    Build an honest shadow_book block for hive_contract_v1.system_state.

    `candidate_count` is always null in v1 — HIVE does not enumerate alternate
    ranked signals; only `recent_signal_flow` length is described in `notes`.
    """
    entries = _flow_entries(recent_flow)
    n = len(entries)
    ab = _normalize_bias(active_bias)

    bull = bear = neut = 0
    for e in entries:
        b = e.get("bias")
        if b == "bullish":
            bull += 1
        elif b == "bearish":
            bear += 1
        elif b == "neutral":
            neut += 1

    mix = {"bullish": bull, "bearish": bear, "neutral": neut} if n > 0 else None

    directional = bull + bear
    opposing_flow_present: bool | None
    if n == 0 or directional == 0:
        opposing_flow_present = None
    else:
        opposing_flow_present = bull > 0 and bear > 0

    contested: bool | None
    if n < 2 and not (bull > 0 and bear > 0):
        # Thin window: cannot claim contest unless both directions already appear.
        contested = True if (bull > 0 and bear > 0) else None
    elif bull > 0 and bear > 0:
        contested = True
    elif ab == "bullish" and bear > 0:
        contested = True
    elif ab == "bearish" and bull > 0:
        contested = True
    elif ab in ("bullish", "bearish") and directional > 0:
        if (ab == "bullish" and bull > 0 and bear == 0) or (ab == "bearish" and bear > 0 and bull == 0):
            contested = False
        else:
            contested = None
    else:
        contested = None

    notes: list[str] = [
        "S1-P1 is limited: no DB shadow ledger, no rejected-rank archive, no counterfactual replay engine.",
        f"Based on recent_signal_flow only (cap {flow_buffer_cap} in-process entries), not broker or full candidate enumeration.",
    ]
    if n > 0:
        notes.append(f"Analyzed {n} recent flow entr{'y' if n == 1 else 'ies'} (not alternate promoted signals).")

    has_shadow_context = n > 0 or ab != "unknown"

    if not has_shadow_context:
        status = "unavailable"
        label = "Shadow context unavailable"
        notes.append("No recent flow and no readable active bias — nothing to summarize.")
    elif n < 2 and not (bull > 0 and bear > 0):
        status = "limited"
        label = "Limited shadow context (thin flow window)"
        notes.append("Too few distinct pulses to judge contestation reliably — treat contested flag as tentative.")
    else:
        status = "observed"
        label = "Shadow context from recent flow (v1)"
        if contested is True:
            notes.append("Recent flow shows directional disagreement or opposition vs active bias.")
        elif contested is False:
            notes.append("Recent flow is single-sided vs directional counts; active bias not opposed in-window.")

    src = (
        "HIVE-S1-P1 read-only: recent_signal_flow deque + current setup bias only; "
        "does not learn from or store rejected trade candidates; no ranking/gating side effects."
    )

    return {
        "status": status,
        "label": label,
        "has_shadow_context": has_shadow_context,
        "candidate_count": None,
        "contested": contested,
        "active_bias": ab,
        "opposing_flow_present": opposing_flow_present,
        "recent_flow_mix": mix,
        "notes": notes,
        "observed_at": last_loop_at if isinstance(last_loop_at, str) and last_loop_at.strip() else None,
        "source": src,
    }
