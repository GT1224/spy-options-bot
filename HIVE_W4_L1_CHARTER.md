# HIVE W4-L1 Implementation Charter

**Planning date:** 2026-04-07  
**Charter lane:** W4-L1-CHARTER — documentation only; **do not implement** until the implementation lane below is explicitly opened.

## Baseline references

| Ref | Value |
|-----|--------|
| Repo | `GT1224/spy-options-bot` · **Branch** `main` · **SPY-only** |
| Tag `hive-wave3-locked` | `7c2e2bd31e9925759cfade0b0b0da4b91a2795b0` |
| Wave 4 planning doc commit | `e68d8c7da7c2b2b80076b009cfb11e84d288366b` |
| Parent plan | `HIVE_WAVE4_PLAN.md` — W4-L1 recommended first |

## Mission statement

**W4-L1** hardens the **in-process bot execution lifecycle**: how the bot **runs**, **sleeps**, **gates** work on `enabled`, updates **signal state**, and surfaces a **truthful operator picture** of “what phase is the system in” — without new market data, new strategies, broker SDK work, or UI redesign. Scope stays **narrow** and **execution-focused** (process + state + contract honesty), not intelligence or visuals.

## In-scope (exact)

1. **`bot_loop` discipline** — Clear, testable behavior for start/stop, `enabled` gating, and `poll_seconds`; avoid ambiguous overlap (e.g. concurrent cycle hazards if any).
2. **`run_signal_cycle` lifecycle** — Consistent ordering of side effects (`last_loop_at`, `signal_cycle_count`, `signal_snapshot`, logs, `recent_signal_flow` append); no change to **strategy math** beyond bugs that corrupt lifecycle state.
3. **`recent_signal_flow` / flow buffer** — Safer semantics where justified: bounded buffer (already capped), optional **narrow** dedupe or cooldown **only** if duplicate entries confuse promotion/flow_context (must remain deterministic and documented).
4. **State truthfulness** — Fields that imply execution posture (`running`, `config.enabled`, `open_position`, `pending_signals_count` or equivalents) must **not lie** to the operator; fix placeholders that contradict actual behavior (e.g. hard-coded zeros if the system can represent pending intent).
5. **Paper vs live labeling** — Keep `use_live_alpaca` / `mode` semantics **honest** with what the process actually does (display/config only today — no fake “live execution” claims).
6. **Narrow guardrail / gate alignment** — Bugfixes only where promotion_gate, execution_edge, or guardrails **contradict** documented lifecycle rules (no new scoring dimensions).
7. **Minimal operator visibility** — At most **small** additions to `hive_contract_v1` **system_state** or an existing top-level slice **if** required to expose a discrete execution phase (read-path only on dashboard; **no** new panels or motion).

## Out-of-scope (exact)

- New **data feeds**, providers, or external APIs (including **Alpaca/order placement** integration — not in this lane unless a pre-existing in-repo stub exists; **currently none**).
- New **strategy classes**, rule sets, scoring brains, or rank/rationale **logic expansion**.
- **Multi-underlying** or symbol governance.
- **Broad intelligence** (W4-L4 territory), **premium motion** (W4-L3), **major UI redesign**, new component libraries.
- **Supabase / EXCALIBUR**, deployment pipelines, backtest/TradingView copilot.
- **Persistence** (DB/files) for execution history beyond what already exists in process.
- **Architecture rewrites** or large file splits.

## Constraints

- **SPY-only** end-to-end.  
- **One lane at a time** — no bundling W4-L2+ work.  
- **Small diffs** — prefer a few focused commits inside the implementation lane; charter does not mandate commit count.  
- **Under-claim** — UI and contract copy must match actual behavior after changes.

## Likely files / surfaces (non-binding)

| Area | Likely touchpoints |
|------|---------------------|
| Process / HTTP | `backend/spy_options_bot_backend.py` (`bot_loop`, `run_signal_cycle`, `/bot/start`, `/bot/stop`, `/cycle`, `/config`, `state` init) |
| HIVE contract | `build_hive_contract_v1()` in same file; possibly `ui_visibility` keys only |
| Gates / readiness | `backend/hive_promotion_gate_v1.py`, `backend/hive_execution_edge_v1.py`, `backend/hive_guardrails_v1.py` — **surgical** edits only |
| Flow / memory | `backend/hive_flow_context_v1.py`, `backend/hive_signal_memory_v1.py` |
| Dashboard | `dashboard/app/page.tsx` — **minimal** read-path for any new `system_state` field (existing patterns only) |

## Implementation sequence (smallest safe order)

1. **Inventory** — Document current states and transitions (running × enabled × cycle triggers) in code comments or existing doc **only if** the implementation lane needs it (avoid doc spam).
2. **Core loop** — Harden `bot_loop` + `run_signal_cycle` interaction; ensure stop is respected and cycles are not logically double-fired.
3. **Buffer / flow** — Only if needed: tighten `recent_signal_flow` append rules (dedupe/cooldown) with a **fixed cap** and tests.
4. **Contract honesty** — Align `system_state` (and related fields) with actual process behavior; add **at most one** compact execution-phase field if indispensable.
5. **Gate bugs** — Fix only **demonstrable** inconsistencies between modules (no feature creep).
6. **UI** — Smallest pill/row updates to reflect new truth (optional, only if step 4 adds operator-facing fields).

## Acceptance criteria

- Start/stop + enabled + manual `/cycle` behavior is **predictable** and described consistently in logs/contract where relevant.
- No **false** execution claims (live fills, pending orders) unless backed by real state.
- `hive_contract_v1` remains **valid** for the dashboard; **legacy** read paths unchanged unless intentionally extended in-scope.
- **No new** dependencies unless unavoidable (default: **none**).
- **Python import** and **Next.js build** succeed after changes.

## Validation checklist (post-implementation)

- [ ] `python -c "import spy_options_bot_backend"` succeeds.
- [ ] Manual or scripted sequence: start bot → enabled false → no cycles; enabled true → cycles; stop → no further cycles.
- [ ] `POST /cycle` updates snapshot and flow as today or **more** consistently.
- [ ] `GET /state` shows `hive_contract_v1` with **consistent** `system_state` vs raw `state` flags.
- [ ] `npm run build` (dashboard) succeeds.
- [ ] Spot-check **promotion_gate** / **execution_edge** for unchanged **happy paths** unless a chartered bugfix required a change.

## Lane drift risks

| Risk | Mitigation |
|------|------------|
| “While we’re here” broker integration | **Explicit out-of-scope**; defer to a future lane with its own charter. |
| Rewriting rank/guardrails | **Bugfixes only**; any scoring change is **out of charter**. |
| Large dashboard redesign | **Cap** UI to tiny read-path deltas. |
| New persistence “for debugging” | **Forbidden** in W4-L1. |
| Dedupe/cooldown logic explosion | **Time-box**; ship smallest rule or skip if unclear. |

## Exact recommended implementation lane name

**`HIVE W4-L1 — Bot execution & lifecycle hardening (implementation)`**

Open **only** this lane next; close it before starting W4-L2.
