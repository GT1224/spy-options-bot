# HIVE W4-L2 Implementation Charter

**Planning date:** 2026-04-07  
**Charter lane:** W4-L2-CHARTER — documentation only; **do not implement** until the implementation lane below is explicitly opened.

## Baseline references

| Ref | SHA |
|-----|-----|
| Repo | `GT1224/spy-options-bot` · **Branch** `main` · **SPY-only** |
| Wave 4 planning | `e68d8c7da7c2b2b80076b009cfb11e84d288366b` (`HIVE_WAVE4_PLAN.md`) |
| W4-L1 charter | `1a44cca0f6ecaa09705c82b8192aaf76b0bd9ada` |
| W4-L1 implementation | `060b03067b933b96d9b5f32308efa7203542b860` |
| W4-L1 validation | `4f13fbfa557c872d8dca8047de4d38cb258c9635` |
| Wave 3 lock tag | `hive-wave3-locked` |

## 1. Exact purpose of W4-L2

**W4-L2** improves **codebase sharpness and maintainability** for HIVE 1.0: remove or consolidate **dead or redundant** code, fix **stale comments / misleading labels**, and apply **small, safe** hygiene in files that are already touched—**without** changing strategic product scope (still SPY-only signal + contract + dashboard, no new capabilities).

## 2. Exact in-scope cleanup / hygiene items

Allowed work **only** if it fits one of these buckets:

- **Dead code removal** — unused functions, unreachable branches, unused imports, duplicate definitions (verify with grep / IDE before delete).
- **Redundant middleware / config** — e.g. duplicate `CORSMiddleware` registration if both stacks can be merged **without** dropping required origins (prove equivalence).
- **Comment / doc truth** — align module docstrings or inline comments with current behavior (especially post–W4-L1 execution lifecycle).
- **Naming / label clarity** — rename **local** variables or **private** helpers for clarity **only** when zero external API impact; avoid renaming public JSON contract keys unless paired with a single coordinated dashboard read-path update in the **same** lane (default: **avoid** contract renames).
- **Duplicate state fields** — if `state["enabled"]` vs `config.enabled` or similar redundancy can be **documented** or **safely** simplified without behavior change, do the smallest fix.
- **Narrow UX copy** — typo fixes, clearer **existing** pill/row strings (no new sections, no layout restructure).
- **Build / tooling hygiene** — e.g. `tsconfig` / `next` warnings only if fixes are trivial and behavior-neutral; **no** dependency major bumps unless security-critical and explicitly justified in implementation notes.

## 3. Exact out-of-scope items

- New **features**, **strategies**, **scoring**, **feeds**, **broker/API** wiring, **persistence**, **multi-underlying**.
- **Architecture rewrite**, new packages/modules for “cleanliness,” large file splits.
- **Visual overhaul**, **motion**, **new components** or **new dashboard sections**.
- **AI / EXCALIBUR / Supabase** or deployment pipelines as part of this lane.
- **Behavioral changes** to signal math, promotion thresholds, or guardrail logic (those are intelligence / discipline lanes, not hygiene).

## 4. How to distinguish real hygiene from disguised feature work

| Real hygiene | Disguised feature work |
|--------------|-------------------------|
| Deleting or merging code **with no user-visible behavior change** | Adding fields, APIs, or UI that **new operators** would notice as capability |
| Fixing a comment to match code | Changing code to match a **new** desired product story |
| Renaming internal helper; same outputs | Tuning rank/gate thresholds “while we’re here” |
| Consolidating duplicate CORS block | Adding a new options chain or data source “for clarity” |

**Rule:** If the change requires **new acceptance tests for product behavior**, it is **probably out of scope**. Hygiene should preserve **existing** golden paths (import, `/state` shape keys used by dashboard, `npm run build`).

## 5. Likely touched surfaces (non-binding)

| Area | Candidates |
|------|------------|
| Backend shell | `backend/spy_options_bot_backend.py` — duplicate CORS, unused imports, `state` duplication docs |
| HIVE modules | `backend/hive_*.py` — unused imports, stale docstrings, validation doc follow-up (e.g. `execution_edge` `no_trade` path copy) **only** if framed as copy hygiene |
| Dashboard | `dashboard/app/page.tsx`, `layout.tsx` — copy typos, dead `useMemo` deps, unreachable branches |
| Root docs | `README.md` **only** if inaccurate paths/commands (optional; keep minimal) |

**Do not** treat this table as a mandate to touch every file—**smallest set** that proves value.

## 6. Acceptance criteria

- **No intentional behavior change** to signal generation, contract **schema keys** consumed by the dashboard, or HTTP routes (paths/status codes) except **bugfixes** where current behavior is provably wrong **and** chartered as hygiene (rare).
- **Python:** `import spy_options_bot_backend` succeeds; `GET /state` still returns `hive_contract_v1` with fields the dashboard expects.
- **Dashboard:** `npm run build` succeeds.
- **Diff discipline:** Each hunk should be justifiable as dead code, duplicate removal, comment/copy, or equivalent hygiene in the charter sense.

## 7. Validation checks (post-implementation)

- [ ] `python -c "import spy_options_bot_backend"`
- [ ] Smoke: `build_hive_contract_v1()` or `get_state()` shape sanity (keys used by `dashboard/app/page.tsx`)
- [ ] `npm run build` (dashboard)
- [ ] Manual skim: no new dependencies in `package.json` / `requirements` unless explicitly recorded as required hygiene
- [ ] Grep: removed symbols are not referenced elsewhere

## 8. Lane drift risks

| Risk | Mitigation |
|------|------------|
| “Cleanup” becomes refactor | Cap **lines changed per file**; stop after N files if scope swells |
| CORS merge drops an origin | Diff origin lists **before/after**; test dashboard loads from each host if possible |
| Contract rename breaks Vercel | **Avoid** public key renames; if unavoidable, single PR with dashboard + backend |
| Deleting “unused” code breaks dynamic import | Grep whole repo + run build |

## 9. Smallest-safe implementation order

1. **Inventory (read-only)** — list 3–7 concrete hygiene targets with **one-line** justification each.
2. **Zero-risk wins** — unused imports, dead private helpers, comment fixes.
3. **Duplicate consolidation** — e.g. CORS **only** after proving merged origin list superset.
4. **Copy / UX micro-fixes** — strings only, no layout.
5. **Re-validate** — import, build, quick `/state` check.

## 10. Exact next implementation lane name

**`HIVE W4-L2 — HIVE 1.0 polish / dead code & hygiene (implementation)`**

Open **only** this lane next; do not start W4-L3 until W4-L2 is closed.
