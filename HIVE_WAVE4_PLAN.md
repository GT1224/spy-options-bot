# HIVE Wave 4 Plan (W4-PLAN)

**Planning date:** 2026-04-07  
**Planning lane:** W4-PLAN — documentation only; no implementation in this artifact.

## Locked baseline (current)

| Ref | SHA / note |
|-----|------------|
| **Repo** | `GT1224/spy-options-bot` · **Branch** `main` · **SPY-only** |
| Tag `hive-wave3-locked` | `7c2e2bd31e9925759cfade0b0b0da4b91a2795b0` |
| Wave 3 implementation freeze | `84e4e857c7a1f2ce4661c4d6185f3d5b32c2099e` |
| Waves 1–2 | Remain published baselines under Wave 3 |

## Current state summary

Wave 3 delivered operator-visible polish (L1), suppression / no-trade discipline (L2), and in-process **cycle_delta** observability (L3) on `hive_contract_v1`. The dashboard and contract are aligned for **execution-aware** reading without a history product. Strategic rules unchanged: **one approved implementation lane at a time**, no scope creep into multi-underlying or external research stacks.

## Candidate Wave 4 lanes (max four, ranked)

### 1) W4-L1 — Bot execution & lifecycle hardening (SPY-only) — **recommended first**

**Intent:** Narrow improvements so **what the bot does** (orders, fills, errors, paper/live edges) matches operator expectations and surfaces honestly in HIVE where it already fits—without new strategies, new feeds, or a redesign.

**Why first:** Highest leverage *after* observability: operators can now *see* drift; the next win is **reducing unexplained execution states** and tightening the loop from signal → action → outcome. Stays SPY-only and respects existing guardrails.

**Dependencies:** W3 contract/dashboard stable; optional use of existing `hive_contract_v1` / performance fields.

**Risks:** Touching execution can regress trading if scope widens; **mitigation:** cap to lifecycle clarity, error surfacing, and known edge cases—no new “brain.”

**Expected payoff:** Fewer trust-breaking surprises; cleaner operator narrative alongside `cycle_delta`.

---

### 2) W4-L2 — HIVE 1.0 polish / dead code & hygiene

**Intent:** Remove dead paths, consolidate duplicates, light dependency/README accuracy, and small maintainability wins—**no feature additions**.

**Why second:** Low risk foundation before larger visual or intelligence work; reduces drag on every future lane.

**Dependencies:** None critical; best after any hot execution fixes if L1 runs first.

**Risks:** Boring scope creep into “rewrite”; **mitigation:** explicit file/scope list per lane charter.

**Expected payoff:** Faster, safer subsequent lanes.

---

### 3) W4-L3 — Premium visual cohesion & subtle motion (strictly capped)

**Intent:** Typography, spacing, and **very subtle** motion where it aids scan (e.g. state transitions)—**not** a full robotic hive overhaul in one lane.

**Why third:** Visual payoff without blocking execution trust; must stay **small** to avoid crowding the panel after W3 layout work.

**Dependencies:** Stable UI structure from W3.

**Risks:** Scope explosion into redesign; **mitigation:** single-digit component touch budget and “no new sections” default.

**Expected payoff:** Stronger “premium tactical” feel without new data.

---

### 4) W4-L4 — SPY signal intelligence lite (existing inputs only)

**Intent:** Sharpen rank/rationale/guardrail **wording or weighting** using **only** data already in the bot—no new APIs, no EXCALIBUR, no multi-underlying.

**Why last among these four:** Highest conceptual slip into “new brain”; belongs **after** execution hardening and hygiene so changes are testable and attributable.

**Dependencies:** Stable execution path; clear golden scenarios for regression.

**Risks:** Over-claiming precision; **mitigation:** under-claim copy, deterministic tests, no new persistence.

**Expected payoff:** Better SPY-only decisions **explainability**, not a new analytics product.

---

## Execution order recommendation

1. **W4-L1** — Bot execution & lifecycle hardening  
2. **W4-L2** — HIVE 1.0 polish / dead code & hygiene  
3. **W4-L3** — Premium visual cohesion & subtle motion (capped)  
4. **W4-L4** — SPY signal intelligence lite (existing inputs only)

## Must-do next · should-do later · not now

| Bucket | Content |
|--------|--------|
| **Must-do next** | **W4-L1** only — execution & lifecycle hardening (narrow, SPY-only). |
| **Should-do later** | W4-L2, then W4-L3, then W4-L4 — each as its own approved lane charter. |
| **Not now** | TradingView / backtest copilot; multi-underlying expansion; underlying governance & unlock sequence; evidence locker; multi-underlying UI control architecture; major HIVE AI upgrade; full visual rebrand; new external feeds; Supabase / EXCALIBUR; deployment automation as a “feature lane.” |

## Scope guards (Wave 4)

- **SPY-only** unless a future wave explicitly opens underlying policy.  
- **One lane at a time**; no batching across lanes.  
- **Observability without crowding** — prefer small deltas to `hive_contract_v1` and compact UI, not new dashboards.  
- **No speculative roadmap expansion** — saved items stay listed under “not now” until a dedicated planning wave.

## Exact recommended next active lane

**Open W4-L1 only next:** *Bot execution & lifecycle hardening (SPY-only, narrow scope)* — charter should name explicit in/out files and forbid new strategies/feeds in that lane.

## Conclusion

Wave 4 should **earn operator trust in execution** first (W4-L1), then **pay down structural debt** (W4-L2), then optional **tactical premium** (W4-L3), and only then **intelligence lite** (W4-L4) under strict input and honesty constraints. Everything else stays parked to protect focus and prevent feature crowding.
