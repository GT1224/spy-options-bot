"""
HIVE Wave-1 contract structure quality — completeness and bias/structure coherence only.
No execution edge, no chain data, no remote DB.
"""

from __future__ import annotations

from typing import Any


def _num(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def compute_hive_contract_quality_v1(
    setup: dict[str, Any],
    trade: dict[str, Any],
    _direction: str | None,
    rank_score: int | None,
    guardrails: dict[str, Any],
) -> dict[str, Any]:
    """
    Judging recommended_trade shape + setup context. Returns contract_quality object (never null).
    """
    signals: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []

    spot = setup.get("spot")
    setup_score = _num(setup.get("setup_score"))
    bias = setup.get("bias")
    bias_s = bias if isinstance(bias, str) else None

    action = trade.get("action")
    struct = trade.get("structure")
    dte = trade.get("dte")
    delta = trade.get("delta")

    if spot is None and setup_score is None:
        return {
            "status": "unknown",
            "score": None,
            "signals": [],
            "warnings": ["No setup context — cannot judge contract quality."],
            "notes": ["Run Pulse Cycle after data is available."],
        }

    if action != "trade":
        return {
            # N/A for scoring, not an error — guardrails already describe posture.
            "status": "unknown",
            "score": None,
            "signals": [],
            "warnings": ["no_trade — contract quality not scored (no structure leg)."],
        }

    if not struct:
        return {
            "status": "weak",
            "score": 22,
            "signals": [],
            "warnings": ["Trade action without option structure (long_call / long_put)."],
        }

    coherence_bad = False
    if bias_s == "bullish" and struct == "long_put":
        coherence_bad = True
        warnings.append("Bullish bias conflicts with long_put structure.")
    elif bias_s == "bearish" and struct == "long_call":
        coherence_bad = True
        warnings.append("Bearish bias conflicts with long_call structure.")
    elif (bias_s == "bullish" and struct == "long_call") or (bias_s == "bearish" and struct == "long_put"):
        signals.append("bias_structure_aligned")
    elif bias_s == "neutral":
        notes.append("Neutral bias — directional fit of structure is ambiguous.")

    has_dte = dte is not None
    has_delta = delta is not None
    if has_dte:
        signals.append("dte_specified")
    else:
        warnings.append("Expiry / DTE not present on recommendation.")
    if has_delta:
        signals.append("delta_target_specified")
    else:
        warnings.append("Delta target not present on recommendation.")

    notes.append("Strike not modeled in v1 API — quality is structure-level only.")

    score_f = 52.0
    if struct in ("long_call", "long_put"):
        score_f += 14.0
    if has_dte:
        score_f += 12.0
    if has_delta:
        score_f += 12.0
    if "bias_structure_aligned" in signals:
        score_f += 14.0
    if coherence_bad:
        score_f -= 38.0

    if setup_score is not None:
        if setup_score >= 72:
            score_f += 6.0
            signals.append("setup_supports_structure")
        elif setup_score < 42:
            score_f -= 12.0
            warnings.append("Underlying setup_score is soft for this structure.")

    if rank_score is not None:
        if rank_score < 38:
            score_f -= 14.0
            warnings.append("Low hive rank — downgrade structural confidence.")
        elif rank_score >= 62:
            score_f += 5.0
            signals.append("rank_supports_structure")

    gs = guardrails.get("status")
    if gs == "avoid":
        score_f -= 22.0
        warnings.append("Guardrails status avoid — structure treated as low quality.")
    elif gs == "caution":
        score_f -= 7.0
        warnings.append("Guardrails caution — structure acceptable only with review.")

    vr = _num(setup.get("volume_ratio"))
    if vr is not None and vr < 1.0:
        score_f -= 5.0
        warnings.append("Volume_ratio below 1.0 — thinner confirmation for the idea.")

    score = int(round(max(0.0, min(100.0, score_f))))

    if coherence_bad:
        status = "weak"
    elif not has_dte or not has_delta:
        status = "acceptable" if score >= 40 else "weak"
    elif score >= 82 and "bias_structure_aligned" in signals:
        status = "strong"
    elif score >= 58:
        status = "acceptable"
    elif score >= 28:
        status = "weak"
    else:
        status = "weak"

    out: dict[str, Any] = {
        "status": status,
        "score": score,
        "signals": signals,
        "warnings": warnings,
    }
    if notes:
        out["notes"] = notes
    return out
