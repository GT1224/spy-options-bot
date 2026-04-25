"""
HIVE-OAR1-P1 — operator review / after-action style observability (read-only v1).

Summarizes current contract/runtime slices only. Not a durable daily report,
P&L review, or historical OAR database. Does not affect ranking, guardrails, or execution.
"""

from __future__ import annotations

from typing import Any


def _str(x: Any, fallback: str = "") -> str:
    return str(x).strip() if x is not None and str(x).strip() else fallback


def _change_summary_lines(cycle_delta: dict[str, Any] | None) -> list[str] | None:
    if not isinstance(cycle_delta, dict):
        return None
    st = cycle_delta.get("status")
    if st == "none":
        return None
    detail = cycle_delta.get("detail")
    fields = cycle_delta.get("changed_fields")
    out: list[str] = []
    if isinstance(detail, str) and detail.strip():
        out.append(detail.strip()[:220])
    if isinstance(fields, list) and fields:
        joined = ", ".join(str(f) for f in fields[:10])
        if st == "unchanged":
            out.append(f"Cycle delta: unchanged ({joined or 'tracked fields'})")
        elif joined:
            out.append(f"Changed fields: {joined}")
    return out if out else None


def compute_hive_operator_review_v1(
    *,
    regime_obs: dict[str, Any],
    signal_freshness: dict[str, Any],
    shadow_book: dict[str, Any],
    broker_sync: dict[str, Any] | None,
    live_readiness: dict[str, Any] | None,
    cycle_delta: dict[str, Any] | None,
    execution_surface: str,
    signal_stale: bool,
    last_loop_at: str | None,
) -> dict[str, Any]:
    ro = regime_obs if isinstance(regime_obs, dict) else {}
    sf = signal_freshness if isinstance(signal_freshness, dict) else {}
    sb = shadow_book if isinstance(shadow_book, dict) else {}
    bs = broker_sync if isinstance(broker_sync, dict) else {}
    lr = live_readiness if isinstance(live_readiness, dict) else {}
    cd = cycle_delta if isinstance(cycle_delta, dict) else {}

    reg_label = _str(ro.get("label")) or _str(ro.get("code")) or "—"
    reg_code = _str(ro.get("code")) or "unknown"
    fresh_code = _str(sf.get("code")) or "unknown"
    fresh_label = _str(sf.get("label")) or fresh_code

    contested = sb.get("contested")

    if contested is True:
        shadow_line = "Shadow: contested recent flow (opposing bias in window; S1 v1 limited)."
    elif contested is False:
        shadow_line = "Shadow: not contested on flow counts (not a rejected-candidate engine)."
    else:
        shadow_line = "Shadow: contestation unknown or thin flow — see shadow_book."

    if execution_surface == "alpaca_paper":
        demo = bs.get("performance_source") == "demo_seed"
        paper_line = (
            "Paper broker: synced — performance slice is demo_seed (not Alpaca-backed) until paper read populates."
            if demo
            else "Paper broker: synced (read telemetry within TTL if sync healthy)."
        )
    elif execution_surface == "alpaca_paper_degraded":
        paper_line = "Paper broker: DEGRADED / stale sync — treasury may lag broker reality."
    else:
        paper_line = "Paper broker: signal-only or blocked — no fresh Alpaca paper surface."

    lr_code = lr.get("summary_code") if isinstance(lr.get("summary_code"), str) else None

    bullets = [
        "OAR1-P1: current-state snapshot only — not historical day-end review or P&L OAR.",
        f"Regime: {reg_label} ({reg_code}); no strategy adaptation from regime in v1.",
        f"Freshness: {fresh_label} ({fresh_code}).",
        shadow_line,
    ]
    if isinstance(cd.get("status"), str) and cd.get("status") == "none":
        bullets.append(
            "Cycle delta: no prior in-process pulse yet — change_summary after a second contract refresh."
        )
    elif signal_stale:
        bullets.append("Contract-stale top signal — do not treat pulse as fresh for timing.")
    else:
        bullets.append(paper_line)
    bullets = bullets[:5]

    watch_items: list[str] = []
    if fresh_code in ("aging", "stale") or signal_stale:
        watch_items.append("Entry timing / signal age — freshness degraded; confirm before acting.")
    if execution_surface == "alpaca_paper_degraded":
        watch_items.append("Paper broker sync — re-run read sync or check keys until surface is alpaca_paper.")
    if contested is True:
        watch_items.append("Directional conflict in recent pulses — reconcile with gate and guardrails.")
    if lr_code == "live_sync_failed":
        watch_items.append("Live read lane — verify credentials and sync if you rely on live telemetry.")
    if not watch_items:
        watch_items.append("Routine: confirm gate, guardrails, and execution edge match your risk plan.")

    watch_items = watch_items[:3]

    chg = _change_summary_lines(cd)

    headline = f"{reg_label} · {fresh_label} · paper {execution_surface or '—'}"

    has_ts = isinstance(last_loop_at, str) and bool(last_loop_at.strip())
    if not has_ts:
        ostatus = "unavailable"
        olabel = "Operator review unavailable — no pulse timestamp"
    elif reg_code == "unknown" and fresh_code == "unknown":
        ostatus = "limited"
        olabel = "Limited operator review (thin classification)"
    else:
        ostatus = "observed"
        olabel = "Current-state operator review (v1)"

    src = (
        "HIVE-OAR1-P1: assembled from regime, signal_freshness, shadow_book, broker_sync, live_readiness, "
        "and top_signal.cycle_delta only; read-only; no ranking/gating/execution side effects."
    )

    return {
        "status": ostatus,
        "label": olabel,
        "headline": headline,
        "bullets": bullets[:5],
        "watch_items": watch_items,
        "change_summary": chg,
        "observed_at": last_loop_at if isinstance(last_loop_at, str) and last_loop_at.strip() else None,
        "source": src,
    }
