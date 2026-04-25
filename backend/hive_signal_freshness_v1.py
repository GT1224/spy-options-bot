"""
HIVE-D1-P1 — signal freshness / decay observability (read-only).

Uses the same wall-clock age and stale threshold already computed for the contract.
Does not affect ranking, guardrails, execution, or gating.
"""

from __future__ import annotations

from typing import Any


def compute_hive_signal_freshness_v1(
    *,
    last_loop_at: str | None,
    age_seconds: float | None,
    signal_stale: bool,
    stale_after_ms: int,
    spot: Any,
    setup_score: Any,
    regime_code: str | None = None,
) -> dict[str, Any]:
    """
    Classify operator-visible freshness: fresh | aging | stale | unknown.

    `age_seconds` must match the contract's signal_age_seconds basis (UTC age of last_loop_at).
    """
    rationale: list[str] = []
    stale_sec = max(1.0, float(stale_after_ms) / 1000.0)
    # Early window: 40% of path to contract stale (ties v1 "fresh" to existing threshold, no new constants).
    fresh_max_sec = stale_sec * 0.4

    src = (
        "Derived from last_cycle_at / signal_age_seconds and hive_contract_v1.signal_stale "
        f"(threshold {int(stale_after_ms)} ms); informational only — not used for entry gating."
    )

    if regime_code and isinstance(regime_code, str) and regime_code.strip():
        rationale.append(
            f"Session regime context (read-only): {regime_code} — not used to set freshness thresholds."
        )

    if not last_loop_at or not isinstance(last_loop_at, str) or not last_loop_at.strip():
        rationale.append("Missing last_cycle_at / last_loop_at — cannot measure signal age.")
        return {
            "code": "unknown",
            "label": "Unknown — no pulse timestamp",
            "status": "unknown",
            "age_seconds": None,
            "confidence": None,
            "rationale": rationale,
            "observed_at": None,
            "source": src,
        }

    if age_seconds is None:
        rationale.append("Pulse timestamp present but age could not be resolved — treat as unknown.")
        return {
            "code": "unknown",
            "label": "Unknown — age unavailable",
            "status": "unknown",
            "age_seconds": None,
            "confidence": None,
            "rationale": rationale,
            "observed_at": last_loop_at,
            "source": src,
        }

    if spot is None and setup_score is None:
        rationale.append("No spot or setup_score on latest snapshot — signal body not present for this freshness read.")
        return {
            "code": "unknown",
            "label": "Unknown — no signal snapshot body",
            "status": "unknown",
            "age_seconds": int(round(age_seconds)),
            "confidence": None,
            "rationale": rationale,
            "observed_at": last_loop_at,
            "source": src,
        }

    age_i = int(round(max(0.0, float(age_seconds))))

    if signal_stale:
        rationale.append(
            f"Contract signal_stale is true or age {age_i}s exceeds threshold ({stale_sec:.0f}s)."
        )
        return {
            "code": "stale",
            "label": "Stale",
            "status": "observed",
            "age_seconds": age_i,
            "confidence": 0.9,
            "rationale": rationale,
            "observed_at": last_loop_at,
            "source": src,
        }

    if age_i <= int(round(fresh_max_sec)):
        rationale.append(
            f"Age {age_i}s within early window (≤ {int(round(fresh_max_sec))}s ≈ 40% of stale horizon)."
        )
        return {
            "code": "fresh",
            "label": "Fresh",
            "status": "observed",
            "age_seconds": age_i,
            "confidence": 0.85,
            "rationale": rationale,
            "observed_at": last_loop_at,
            "source": src,
        }

    rationale.append(
        f"Age {age_i}s past early window but below contract stale horizon ({stale_sec:.0f}s)."
    )
    return {
        "code": "aging",
        "label": "Aging",
        "status": "observed",
        "age_seconds": age_i,
        "confidence": 0.82,
        "rationale": rationale,
        "observed_at": last_loop_at,
        "source": src,
    }
