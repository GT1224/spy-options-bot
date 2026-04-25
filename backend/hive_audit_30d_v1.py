"""
HIVE-30D-AUDIT1 — official 30-day paper validation framework (read-only spec).

Defines measurement posture and review targets without changing trading behavior.
No durable historical engine is implied in v1.
"""

from __future__ import annotations

from typing import Any


def build_hive_30d_audit_v1(*, last_loop_at: str | None) -> dict[str, Any]:
    """
    Return a static-but-contract-backed audit definition block.

    `started_at` is intentionally None in v1 because no immutable server-side audit
    start marker exists yet; operators activate and track the window externally.
    """
    metrics = [
        {
            "key": "net_realized_pnl_30d",
            "label": "Net realized P&L (rolling 30 days)",
            "status": "manual_review",
            "note": "No durable 30-day realized ledger in v1; review from broker export + HIVE run notes.",
        },
        {
            "key": "expectancy_per_trade",
            "label": "Expectancy per trade",
            "status": "manual_review",
            "note": "Requires durable closed-trade history; not auto-computed in current runtime.",
        },
        {
            "key": "win_rate",
            "label": "Win rate",
            "status": "manual_review",
            "note": "Review from closed-trade records; not reliably auto-tracked across restarts in v1.",
        },
        {
            "key": "avg_win_vs_avg_loss",
            "label": "Average win vs average loss",
            "status": "manual_review",
            "note": "Needs durable realized trade breakdown; mark manually during audit.",
        },
        {
            "key": "drawdown_loss_cluster",
            "label": "Max drawdown / longest losing streak / worst day / worst 3-day cluster",
            "status": "manual_review",
            "note": "Runtime has partial counters only; full 30-day risk profile is manual in v1.",
        },
        {
            "key": "profit_concentration",
            "label": "Profit concentration (top 3 / top 5 trades as % of total)",
            "status": "manual_review",
            "note": "Requires per-trade realized archive; not stored durably in current contract path.",
        },
        {
            "key": "median_vs_average_trade",
            "label": "Median trade vs average trade",
            "status": "manual_review",
            "note": "Requires complete trade distribution; not auto-computed in v1.",
        },
        {
            "key": "capacity_execution_realism",
            "label": "Capacity / execution realism",
            "status": "manual_review",
            "note": "Paper fills differ from live microstructure; treat as caveated manual review.",
        },
        {
            "key": "regime_usefulness",
            "label": "Regime usefulness",
            "status": "tracked",
            "note": "regime is contract-tracked each pulse; usefulness vs outcomes remains manual.",
        },
        {
            "key": "freshness_usefulness",
            "label": "Freshness usefulness",
            "status": "tracked",
            "note": "signal_freshness is tracked; map stale/aging tags to outcomes via manual review in v1.",
        },
        {
            "key": "shadow_context_usefulness",
            "label": "Shadow context usefulness",
            "status": "tracked",
            "note": "shadow_book contested/uncontested is tracked; edge impact review is manual.",
        },
        {
            "key": "capital_posture_usefulness",
            "label": "Capital posture usefulness",
            "status": "tracked",
            "note": "capital_posture is tracked read-only; no sizing enforcement in v1.",
        },
        {
            "key": "ai_governance_integrity",
            "label": "AI governance integrity",
            "status": "tracked",
            "note": "ai_governance posture/capital_privilege tracked; expected absent/none unless intentionally changed.",
        },
    ]

    return {
        "status": "defined",
        "window_label": "30-day paper validation window (defined now; active by operator runbook)",
        "freeze_posture": (
            "Core intelligence stack frozen for clean measurement; only true bug/safety fixes allowed during window."
        ),
        "started_at": None,
        "metrics": metrics,
        "thresholds": {
            "good": [
                "Net realized P&L positive over 30-day window.",
                "Risk contained: no catastrophic drawdown cluster and no unresolved operational drift.",
                "Intelligence tags remain coherent and non-contradictory through the window.",
            ],
            "great": [
                "Positive realized P&L with stable risk profile and no major rule-break interventions.",
                "Expectancy, win-rate, and avg-win/avg-loss review all support edge persistence.",
                "Regime/freshness/shadow/capital-posture tags appear directionally useful in manual review.",
            ],
            "elite": [
                "Strong realized outcome quality with controlled drawdowns and low concentration risk.",
                "Manual review confirms intelligence stack improves decision discipline without semantic drift.",
                "Window completes without freeze-rule breaks or scope creep in core decision logic.",
            ],
        },
        "guardrails": [
            "Changing signal logic during the 30-day window breaks clean audit continuity.",
            "Changing ranking logic during the 30-day window breaks clean audit continuity.",
            "Changing guardrail thresholds/behavior during the 30-day window breaks clean audit continuity.",
            "Changing execution behavior or routing semantics during the 30-day window breaks clean audit continuity.",
            "Changing sizing behavior or trust-tier enforcement during the 30-day window breaks clean audit continuity.",
            "Changing AI trust/capital behavior or attribution semantics during the 30-day window breaks clean audit continuity.",
        ],
        "notes": [
            "This framework is measurement only — it does not optimize or alter runtime behavior.",
            "Manual-review metrics are intentional in v1 until a durable history layer is explicitly added.",
            "Use operator runbook timestamping for audit start/stop to avoid faking immutable start markers.",
        ],
        "source": (
            "HIVE-30D-AUDIT1 static read-only framework in contract; no ranking/guardrail/execution/sizing mutation."
        ),
        "observed_at": last_loop_at if isinstance(last_loop_at, str) and last_loop_at.strip() else None,
    }
