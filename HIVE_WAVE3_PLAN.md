# HIVE Wave 3 Plan (W3-P1)

**Planning lane:** W3-P1 — one approved implementation lane at a time (no code in this commit).

## Locked baseline

| Ref | SHA |
|-----|-----|
| Published `main` / tag `hive-wave2-locked` | `44edf723e2f154b5341a4f303ae09a6cde99b948` |
| Wave 2 implementation freeze (checkpoint body) | `b3bde3a8fbdcec11b0f67c75f505baff9de92937` |

**Repo:** `GT1224/spy-options-bot` · **Branch:** `main` · **Core roadmap:** SPY-only.

## Approved next lane (Wave 3 — first)

**Operator Surface Consolidation / Visibility Polish** — tighten hierarchy, reduce redundancy, and clarify core vs advanced presentation so rank, guardrails, contract quality, execution edge, promotion gate, session regime, signal memory, and flow context stay readable. No major redesign.

## Safe in-scope (first lane)

- Re-group or re-order existing panels / pills / **HiveRow**s for clearer scanning.
- Trim duplicate labels or repeated concepts (where two surfaces say the same thing).
- Wording tweaks for honesty (e.g. “local / in-process” where already implied).
- Optional use of existing **`ui_visibility`** hints in the UI (read-only grouping), without new contract fields unless a tiny rename is unavoidable.
- SPY-only; no new data sources.

## Explicit out-of-scope (first lane)

- New intelligence modules, new contract slices, or new scoring.
- Backend logic changes beyond copy-driven or display-only needs (default: **frontend-only** for this lane).
- EXCALIBUR / Supabase / deployment.
- Full visual rebrand or new component library.

## Proposed following 3-lane order (after polish)

1. **No-Trade Discipline / Suppression Refinement** — narrow promotion-gate / suppress semantics and messaging once the surface is legible.  
2. **Observability / “What Changed Since Last Cycle” Lite** — compact top-signal delta vs prior in-process snapshot only; no analytics engine.  
3. **Wave 3 New Intelligence Lane (only if justified)** — reserved; prefer exhausting polish + discipline + observability first.

## Rule

Implementation proceeds **one lane at a time**; batch work **only inside** the active lane. Waves 1–2 are closed — no retroactive scope creep.
