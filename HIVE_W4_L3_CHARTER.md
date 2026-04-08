# HIVE W4-L3 Implementation Charter

**Planning date:** 2026-04-07  
**Charter lane:** W4-L3-CHARTER — documentation only; **do not implement** until the implementation lane below is explicitly opened.

## Baseline references

| Ref | SHA |
|-----|-----|
| Repo | `GT1224/spy-options-bot` · **Branch** `main` · **SPY-only** |
| Wave 4 plan | `HIVE_WAVE4_PLAN.md` — W4-L3 third in sequence |
| W4-L1 validation | `4f13fbfa557c872d8dca8047de4d38cb258c9635` |
| W4-L2 validation | `eeef7d8f749a940b1a8a1efb8e218937c7ad1cb3` |
| Wave 3 lock tag | `hive-wave3-locked` |

## 1. Exact purpose of W4-L3

**W4-L3** tightens **visual cohesion** and **premium tactical feel** on the existing HIVE dashboard: consistent spacing, typography rhythm, contrast/readability, and **optional** **very subtle** motion that **aids scan** (e.g. state transitions)—**without** new data, new panels, or a broad redesign. Scope is **capped** and **cosmetic**.

## 2. Exact in-scope visual cohesion items

Allowed **only** if each change is small and reversible:

- **Token alignment** — reuse a **small** set of repeated colors, radii, font sizes, and gaps already present in `page.tsx` / `layout.tsx` (extract **local** constants at top of `page.tsx` if needed—**no** new npm packages).
- **Spacing / hierarchy** — nudge padding/margins between **existing** sections and rows for clearer scan; **no** new sections.
- **Readability** — improve contrast or font-size on **existing** labels where WCAG-ish legibility is weak (subjective but minimal deltas).
- **State styling consistency** — align **StatusPill** / **HiveRow** / similar patterns so `active`, `tone`, and borders feel like one family.
- **Subtle motion** — only per **§4 Motion limits** below.
- **Premium cleanup** — remove visual noise (redundant borders, uneven shadows) **within** components already on screen.

## 3. Exact out-of-scope items

- New **features**, **controls**, **routes**, **API** calls, **contract** fields, **intelligence** copy that adds claims.
- **New modules** (no new `.tsx` feature files, no new design system package, no `framer-motion` unless already in repo—**default: no new deps**).
- **Major layout rearchitecture** (no column/grid restructure of the whole page, no new hero/sections).
- **Dashboard crowding** — no extra pills, rows, cards, or data blocks.
- **Heavy animation** — no parallax, long transitions, particle effects, or continuous motion.
- **Motion for decoration** — forbidden.
- **Multi-underlying**, **broker**, **strategy**, **feed**, **AI** work.

## 4. Motion limits (allowed vs forbidden)

| Allowed | Forbidden |
|---------|-----------|
| **≤ ~200ms** transitions on **opacity** or **transform** (e.g. `translateY(1px)`) tied to **existing** state (e.g. pill `active`, refresh toggle) | Loops, bounce, shake, marquee, auto-playing motion |
| **CSS-only** (`transition`, `@media (prefers-reduced-motion: reduce)` **must** disable or no-op motion) | JS `requestAnimationFrame` animation loops |
| **One** motion “theme” (same easing/duration) reused | Different ad-hoc animations per widget |
| Motion that **clarifies** a state change the operator already cares about | Motion that draws attention without informational purpose |

**Default:** If reduced-motion is hard to test, **prefer zero motion** and ship cohesion-only.

## 5. How to preserve premium feel without crowding

- **Cap information density** — polish **existing** strings; do not add labels “for flavor.”
- **Single focal hierarchy** — keep spot/bias/score and governance glance row dominant; secondary rows stay visually quieter.
- **Touch budget** — target **≤ 8** distinct UI edit regions (e.g. section wrappers, pill component, one card style)—count before coding.
- **Stop rule** — if the page feels busier after a change, **revert** that hunk in the implementation lane.

## 6. Likely touched surfaces (non-binding)

| Area | Notes |
|------|--------|
| `dashboard/app/page.tsx` | Primary inline styles, `StatusPill` / `HiveRow` if local |
| `dashboard/app/layout.tsx` | Optional `lang`, `body` background harmonization only—minimal |

**Avoid** new global CSS files unless the implementation lane explicitly records why inline tokens became unmaintainable (default: **stay in TSX**).

## 7. Acceptance criteria

- **No new** user-visible **data** or **controls** (buttons/inputs count unchanged unless moving position without adding).
- **Lighthouse/visual**: subjective “calmer / more consistent” — **no** measurable bundle size regression beyond trivial bytes from constants.
- **`npm run build`** succeeds.
- **Reduced motion**: if any CSS transition ships, **`prefers-reduced-motion: reduce`** disables it or sets duration ~0.
- **SPY-only** narrative unchanged.

## 8. Validation checks (post-implementation)

- [ ] `npm run build` (dashboard)
- [ ] Manual pass: load `/` — scan ops, governance, core cards; confirm **no new sections**
- [ ] Toggle states that drive pills (if any) — motion (if any) is subtle and **off** under OS reduced-motion
- [ ] Diff stat: **no** new files unless charter exception recorded in commit body

## 9. Lane drift risks

| Risk | Mitigation |
|------|------------|
| “While we’re here” new HiveRow for new metric | **Forbidden** — checklist before commit |
| Framer Motion / new dependency | **Do not add** unless already in `package.json` (it is not today) |
| Rewriting entire `page.tsx` in one go | **Incremental** commits discouraged in one lane—use **single** focused commit with **small** diff |
| Dark-on-dark contrast regressions | Compare before/after screenshots or spot-check key text |

## 10. Smallest-safe implementation order

1. **Inventory** — list ≤8 target style clusters (colors, radii, spacing) with before samples.
2. **Tokens** — optional `const` map at top of `page.tsx` (no new file).
3. **Pills / rows** — unify border, padding, font-size on shared components first.
4. **Sections** — section wrappers spacing only.
5. **Motion** — only if step 1–4 complete and motion still justified; ship with `prefers-reduced-motion`.
6. **Build + visual skim** — revert anything that crowds.

## 11. Exact next implementation lane name

**`HIVE W4-L3 — Premium visual cohesion & subtle motion (implementation)`**

Open **only** this lane next; close it before **W4-L4**.
