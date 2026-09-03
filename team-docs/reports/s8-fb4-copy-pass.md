# S8-FB4 — Copy Pass (Q17) Audit Report

- **Date:** 2026-09-02 21:48
- **Role:** advisor / fb-review (read-only)
- **Scope (sprint-8 brief):** "Copy pass: review card copy, adaptive difficulty hints, locale file validation."
- **Verification method:** local source audit (GamePlay/ReviewZone/i18n), `vitest run i18n.test.ts`, en.ts vs en.json diff.

---

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| C1 | Review card: `reviewZone.difficulty` + `reviewZone.accuracyPct` keys defined but UNUSED; UI hardcodes `Lvl x/5` + `yy% ✓` | Medium | Open (read-only) |
| C2 | Review card: `"Spaced repetition power-up"` label hardcoded (not localized) | Low | Open (read-only) |
| C3 | Adaptive difficulty: badge tooltip + `Lx` label hardcoded English in GamePlay | Low | Open (read-only) |
| C4 | `DIFFICULTY_META` labels (Easy/Medium/Hard/Expert) hardcoded English | Low | Open (read-only) |
| C5 | `locales/en.json` stale mirror: 140 keys behind `en.ts`; 1 orphan key | Medium | Open (read-only) |
| C6 | i18n integrity gate (`i18n.test.ts`) PASSES 10/10 — no KeyError regressions | Pass | Verified |

---

## C1 — Review card difficulty/accuracy copy (ReviewZone.tsx)

- `frontend/src/lib/i18n/en.ts:880-881` defines two keys that are currently DEAD:
  - `'reviewZone.difficulty': 'Difficulty {difficulty}/5'`
  - `'reviewZone.accuracyPct': '{accuracy}% accuracy'`
- `frontend/src/components/ReviewZone.tsx` uses exactly **8** keys: `reviewZone.title/dueToday/reviewed/empty/emptyHint/dueNow/accuracy` + `student.home.dayStreak`. It does **not** call `t('reviewZone.difficulty')` or `t('reviewZone.accuracyPct')`.
- Instead the review card renders **hardcoded** badges:
  - `ReviewZone.tsx:183` — `` Lvl {review.difficulty}/5 `` (hardcoded, not the `reviewZone.difficulty` key)
  - `ReviewZone.tsx:186` — `` {Math.round(...)}% ✓ `` (hardcoded checkmark, not `reviewZone.accuracyPct`)
- **Recommendation (fix, if authorized):**
  - Replace `Lvl {review.difficulty}/5` → `t('reviewZone.difficulty', { difficulty: review.difficulty })`.
  - Replace `{pct}% ✓` → `t('reviewZone.accuracyPct', { accuracy: pct })`.
  - Note: `reviewZone.accuracyPct` currently reads `"{accuracy}% accuracy"` (verbose for a badge). Consider tightening to `'{accuracy}%'` if used on a card chip.
  - Minor namespace drift: the streak tile uses `student.home.dayStreak` instead of a `reviewZone.*` key — acceptable, but flag for tidiness.

## C2 — "Spaced repetition power-up" hardcoded (ReviewZone.tsx:96)

- `frontend/src/components/ReviewZone.tsx:96` render: `<p ...>Spaced repetition power-up</p>` — English literal, no `t()`.
- **Recommendation:** hoist to `reviewZone.powerUp` key in en.ts and call `t('reviewZone.powerUp')`. Low impact (label is a decorative gradient chip) but breaks localization if ha/yo added.

## C3 — Adaptive difficulty badge hardcoded (GamePlay.tsx:4282-4286)

- `frontend/src/pages/Student/GamePlay.tsx:4283`:
  ```
  title={`Difficulty: ${adaptiveProfile.difficulty}/5 | Accuracy: ${Math.round(adaptiveProfile.accuracy_7d || 0)}%`}
  ```
  and `:4284` renders `` L{adaptiveProfile.difficulty} ``.
- The active dict has **no** `adaptive.*` chip keys (only `upsell.feature_adaptiveLearning` at en.ts:1061).
- **Recommendation (if authorized):** add `adaptive.levelChip` (`'L{level}'`), `adaptive.tooltip` (`'Level {level}/5 · Accuracy {accuracy}%'`) keys and use `t()` in the badge. Consider `aria-label` for the tooltip text (currently a title-only).
- Low severity: content is numeric; only the tooltip liner is English, and it's not surfaced on mobile.

## C4 — Difficulty meta labels hardcoded (GamePlay.tsx:2790-2795)

- `frontend/src/pages/Student/GamePlay.tsx:2790-2795`:
  ```
  easy:   { label: 'Easy',   ... }
  medium: { label: 'Medium', ... }
  hard:   { label: 'Hard',   ... }
  expert: { label: 'Expert', ... }
  ```
- These labels render in the difficulty picker (`Easy/Medium/Hard/Expert` + `Pass previous level to unlock`, line 3130) as English literals; the `DIFFICULTY_META` labels are not passed through `t()`.
- **Recommendation (if authorized):** add `game.difficultyEasy/Medium/Hard/Expert` keys and map in `DIFFICULTY_META` via `t(...)`. Wide surface but low user risk for KG (emoji-dominant).

## C5 — Locale file validation: `locales/en.json` stale (Medium)

- `frontend/src/lib/i18n/index.ts:105-119` — `loadLocale()` lazy-loads `./locales/${locale}.json`. The **active English dict is `dictionaries.en` = `en.ts`** (imported at top of index.ts), and `t()` (index.ts:126-139) always falls back to `dictionaries.en`. `locales/en.json` is therefore **never used for the `en` locale** in production; events historic QA artifact / documented "mirror" (see comment en.ts:258,1167).
- Drift (verified by flatten+diff):
  - `en.ts` flattened leaf keys: **1088**
  - `locales/en.json` leaf keys: **948**
  - Missing from en.json (in `en.ts` only): **141 keys**, e.g. `common.remove`, `parent.live.title`, `parent.live.onAir`, `parent.live.micDenied`, plus the new `gameSceneEditor.*` group added in commit c5b8bb5.
  - Orphan in en.json (not in `en.ts`): **1** — `game.dragOrTapBelow`.
- **Recommendation (fix):**
  - Either regenerate `locales/en.json` from `en.ts` (`{...flatten(en)}` + `_meta` header) to restore the documented mirror, **or** delete it to avoid future drift, **or** add a CI/sync guard so the mirror cannot silently desync.
  - A `game.dragOrTapBelow` key is referenced by en.json but the runtime dict no longer has it — safe to leave (unused) but should be pruned in a regeneration.

## C6 — i18n integrity gate PASSES (Verified)

- Ran `npx vitest run src/lib/i18n/i18n.test.ts` (frontend):
  ```
  10 tests passed (10) — 1.12s
  ```
- Confirms: every static `t()` key resolves, every `tN()` plural resolves, interpolations/filters behave.
- This is the operative "locale validation" for runtime correctness: **no KeyError regressions in the active `en.ts` dictionary.** The only locale-file risk is the unused `en.json` mirror (C5).

---

## Conclusion

- **Runtime locale health: PASS** (C6). The active `en.ts` resolves every key; the i18n gate is green.
- **Copy hygiene:** 4 minor localization gaps (C1-C4) in the review card + adaptive difficulty surfaces — all small, low-risk (numeric/emoji-dominant audience), none blocking.
- **Single material issue:** `locales/en.json` is 140 keys stale and contradicted by one orphan key (C5) — but it is **not** part of the runtime path, so no user-visible breakage.
- **Rec:** if a follow-up worker is authorized to edit code, apply C1 (2-line swap to existing dead keys) first — highest copy-value with zero new keys; then optionally C3/C4/C2. C5 is best resolved by regeneration or deletion + a sync guard.

## Progress

- `team-docs/reports/s8-fb4-progress.md` — appended Q17-checkpoint line.
- QUEUE.md — Q17 marked DONE (2026-09-02), reviewed read-only per fb-review role.
