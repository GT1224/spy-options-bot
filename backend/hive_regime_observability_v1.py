"""
HIVE-R1-P1 — read-only session regime observability for operators.

Combines Eastern session clock (honest time buckets) with the latest in-process
pulse fields from state.signal_snapshot. Does NOT consume live market feeds;
spot/bias/score/volume_ratio are whatever HIVE's pulse already computed.

Not used for execution, ranking, or guardrails — contract/UI observability only.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore[misc, assignment]

_ET: Any = None
if ZoneInfo:
    try:
        _ET = ZoneInfo("America/New_York")
    except Exception:  # pragma: no cover
        _ET = None


def _et_now() -> tuple[Any, int] | None:
    """Return (et_datetime, total_minutes_from_midnight) or None."""
    if _ET is None:
        return None
    try:
        et = datetime.now(_ET)
        return et, et.hour * 60 + et.minute
    except Exception:
        return None


def _flow_suggests_chop(flow: Any) -> bool:
    if not isinstance(flow, list) or len(flow) < 3:
        return False
    biases: list[str] = []
    for e in flow[-4:]:
        if isinstance(e, dict):
            b = e.get("bias")
            if b in ("bullish", "bearish"):
                biases.append(str(b))
    if len(biases) < 3:
        return False
    return "bullish" in biases and "bearish" in biases


def _num(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def compute_hive_regime_observability_v1(
    *,
    session_regime: dict[str, Any],
    setup: dict[str, Any],
    last_loop_at: str | None,
    recent_flow: Any,
    market_intel_items: Any,
    provider_mode: str | None,
) -> dict[str, Any]:
    """
    Deterministic regime label for operators. See module docstring for limits.
    """
    rationale: list[str] = []
    sr_code = session_regime.get("code") if isinstance(session_regime.get("code"), str) else None
    market_hours = bool(session_regime.get("market_hours")) if session_regime.get("market_hours") is not None else False

    prov = (provider_mode or "unknown").strip() or "unknown"
    base_source = (
        "Eastern session clock + latest HIVE pulse fields "
        f"(provider_mode={prov}; in-process pulse path, not a standalone live-quote feed)"
    )

    # R1-P2: wire macro/event cues when market_intel or calendar fields exist.
    if isinstance(market_intel_items, list) and len(market_intel_items) > 0:
        rationale.append("market_intel present but event_driven classification is deferred to R1-P2.")
        return {
            "code": "unknown",
            "label": "Unknown — event cues not classified yet",
            "confidence": None,
            "status": "unknown",
            "rationale": rationale,
            "observed_at": last_loop_at if isinstance(last_loop_at, str) else None,
            "source": base_source,
        }

    et_pair = _et_now()
    in_lunch_window = False
    if et_pair is not None:
        et, total = et_pair
        wd = et.weekday()
        # Weekday RTH lunch band (clock only).
        if wd < 5 and (9 * 60 + 30) <= total < (16 * 60):
            in_lunch_window = (11 * 60 + 30) <= total < (14 * 60)

    has_pulse = isinstance(last_loop_at, str) and last_loop_at and (
        setup.get("spot") is not None or setup.get("setup_score") is not None
    )

    # Outside regular-session windows that support the v1 taxonomy — honest unknown.
    if sr_code in ("closed", "premarket", "after_hours", None) or sr_code == "unknown":
        if isinstance(session_regime.get("detail"), str):
            rationale.append(f"Session context: {session_regime['detail']}")
        else:
            rationale.append("Outside regular-session focus for v1 taxonomy (or clock unavailable).")
        return {
            "code": "unknown",
            "label": "Unknown / not applicable",
            "confidence": None,
            "status": "observed",
            "rationale": rationale,
            "observed_at": last_loop_at if isinstance(last_loop_at, str) else None,
            "source": base_source,
        }

    bias = setup.get("bias")
    bias_s = bias if isinstance(bias, str) else None
    score = _num(setup.get("setup_score"))
    vr = _num(setup.get("volume_ratio"))
    chop_flow = _flow_suggests_chop(recent_flow)

    low_vol = (
        vr is not None
        and vr < 0.98
        and bias_s == "neutral"
        and (score is None or score < 68)
    )

    def structure_code() -> tuple[str, str, str, list[str]]:
        """Return (code, label, status, extra_rationale)."""
        rs: list[str] = []
        if not has_pulse:
            rs.append("No completed pulse yet — structure bucket unavailable.")
            return ("unknown", "Unknown — awaiting pulse", "unknown", rs)
        if low_vol:
            rs.append(f"volume_ratio={vr:.2f} with neutral bias — muted participation in pulse inputs.")
            return ("low_vol_drift", "Low-vol drift (pulse)", "estimated", rs)
        if chop_flow:
            rs.append("Recent pulse flow mixes bullish and bearish bias — chop-lean.")
            return ("chop_day", "Chop-lean day (pulse)", "estimated", rs)
        if bias_s == "neutral":
            rs.append("Neutral bias on latest pulse — mean-reversion-lean context.")
            return ("chop_day", "Chop-lean day (pulse)", "estimated", rs)
        if bias_s in ("bullish", "bearish") and score is not None and score >= 52:
            rs.append(f"Directional bias {bias_s} with setup_score={score:.0f} on latest pulse.")
            return ("trend_day", "Trend-lean day (pulse)", "estimated", rs)
        if bias_s in ("bullish", "bearish"):
            rs.append(f"Directional bias {bias_s} but setup_score is weak or missing — weak trend-lean.")
            return ("trend_day", "Trend-lean day (pulse · weak)", "estimated", rs)
        rs.append("Pulse fields insufficient for a structure bucket.")
        return ("unknown", "Unknown", "unknown", rs)

    # Time-primary buckets (clock-observed).
    if sr_code == "open_drive":
        rationale.append("Clock: first regular hour (09:30–10:30 ET) — elevated open-window context.")
        if has_pulse and bias_s:
            rationale.append(f"Latest pulse bias: {bias_s}.")
        conf = 0.52 if has_pulse else 0.45
        return {
            "code": "post_open_impulse",
            "label": "Post-open impulse window (clock)",
            "confidence": conf,
            "status": "observed",
            "rationale": rationale,
            "observed_at": last_loop_at if isinstance(last_loop_at, str) else None,
            "source": base_source,
        }

    if sr_code == "power_hour":
        rationale.append("Clock: final regular hour (15:00–16:00 ET) — late-session participation context.")
        if has_pulse and bias_s:
            rationale.append(f"Latest pulse bias: {bias_s}.")
        conf = 0.52 if has_pulse else 0.45
        return {
            "code": "late_day_squeeze",
            "label": "Late-day squeeze window (clock)",
            "confidence": conf,
            "status": "observed",
            "rationale": rationale,
            "observed_at": last_loop_at if isinstance(last_loop_at, str) else None,
            "source": base_source,
        }

    if sr_code == "midday" and in_lunch_window:
        rationale.append("Clock: 11:30–14:00 ET — typical lunch lull window (clock only).")
        if has_pulse and bias_s:
            rationale.append(f"Latest pulse bias: {bias_s}.")
        conf = 0.5 if has_pulse else 0.42
        return {
            "code": "lunchtime_dead_zone",
            "label": "Lunchtime dead zone (clock)",
            "confidence": conf,
            "status": "observed",
            "rationale": rationale,
            "observed_at": last_loop_at if isinstance(last_loop_at, str) else None,
            "source": base_source,
        }

    # Remaining midday segments and any other market_hours True codes: structure from pulse.
    c, lbl, st, extra = structure_code()
    rationale.extend(extra)
    if sr_code == "midday":
        rationale.append("Clock: core session outside open/late/lunch-primary bands — structure from pulse.")
    elif market_hours:
        rationale.append(f"Session bucket from clock: {sr_code or 'n/a'} — structure from pulse.")
    conf: float | None
    if c == "unknown":
        conf = None
    elif c == "low_vol_drift":
        conf = 0.4
    elif c == "chop_day":
        conf = 0.43 if chop_flow or bias_s == "neutral" else 0.48
    else:
        conf = 0.48 if score is not None and score >= 60 else 0.38

    return {
        "code": c,
        "label": lbl,
        "confidence": conf,
        "status": st,
        "rationale": rationale,
        "observed_at": last_loop_at if isinstance(last_loop_at, str) else None,
        "source": base_source,
    }
