# HIVE Wave 2 Plan (W2-P1)

**Planning lane:** W2-P1 — next approved implementation lane only (no code in this commit).

## Locked baseline

| Ref | SHA |
|-----|-----|
| Published `main` / tag `hive-wave1-locked` | `3b13907c2d1623018e5361035e2f88ced7a44065` |
| Implementation freeze (checkpoint body) | `4a523d7576c5b31e96918b3f17e06afaf0ebc7af` |

**Repo:** `GT1224/spy-options-bot` · **Branch:** `main` · **Core roadmap:** SPY-only, one approved lane at a time.

## Approved next lane (Wave 2 — first)

**Signal Quality Gate / Promotion Guard** — a thin governance layer that combines **existing** Wave 1 signals (rank, guardrails, contract quality, execution edge) before a setup is treated as promoted “top.” No new brains; no new external data.

## Safe in-scope (first lane)

- Derive a small set of **promotion / hold / suppress** outcomes from **already-computed** H7–H10 fields (and existing top-signal metadata).
- Explicit **minimum-evidence** rules (e.g. combined thresholds, veto if guardrails block, hold if contract quality or exec edge is borderline — exact rules in implementation lane).
- Surface status in **`hive_contract_v1`** in a **compact** way (e.g. `top_signal.promotion` or `ui_visibility` flags — choice deferred to implementation lane).
- SPY-only; local state only; no EXCALIBUR, no Supabase, no new feeds.

## Explicit out-of-scope (first lane)

- New scoring “brains,” new ML, or re-ranking engines.
- Historical analytics DB, large backtest subsystems, or “memory” of outcomes.
- Multi-symbol or non-SPY scope.
- UI redesign or dense new panels; avoid crowding — prefer pills / one row / existing HiveRow patterns.
- Broad refactors of `get_state` or contract shape beyond what the gate requires.

## Proposed following 3-lane order (after Promotion Guard)

1. **Session Regime Lite (clock-only)** — time buckets; honest labels/modifiers; no market overreach.  
2. **Signal Memory Lite** — narrow recent context (e.g. last N cycles / archetype notes) **only** if local persistence path is clear and honest.  
3. **Flow Context Lite** — deferred until multiple recent candidates exist in local state without inventing order-flow narrative.

**Rationale:** Governance first compounds H7–H10 truthfully; clock context is low-risk; memory needs honest data; flow needs a real multi-signal substrate.

## Rule

Implementation proceeds **one lane at a time**; safe batching **only inside** the active lane. Wave 1 scope is closed — no retroactive creep.
