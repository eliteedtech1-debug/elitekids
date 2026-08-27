# EliteKids — 100% i18n / l10n Migration Roadmap

**Status:** ACTIVE — phases P0+P1 done, P2 game/support complete, P3 done · **Created:** 2026-08-26 · **Updated:** 2026-08-26 · **Audience:** team, next agents
**Scope:** Frontend SPA (React/Vite), backend API messages, TTS/speech, NERDC-aligned Nigerian locales.

## 0. Execution log (2026-08-26)
| Phase | Status | Notes |
|---|---|---|
| P0 | ✅ DONE | Single registry (strings.ts merged into en.ts, 3 surviving keys), `tN()` plurals, native setLocale/getLocale/addLocale, vitest gate (every static t()/tN() key in src resolves) — commit 1fd2cfd |
| P1 | ✅ DONE | All 11 teacher surfaces extracted (Lessons, NerdcReport, Approvals, Analytics, GameCreator, Live, Arena, VoiceNotes, QuickCreate, BossRaid, Festival) — commits a4b732e, 471ffa1, d924888 |
| P2 | ✅ DONE | Student/support surfaces and GamePlay game-engine chrome are extracted, including GardenScene, BossBattleOverlay, ErrorBoundary, SpeechInput, EmojiPicker, and all active GamePlay templates. `GameEngine/` contains only a README. Tests/build green. |
| P3 | ✅ DONE | ParentChildren, ParentActivities, ParentDashboard extracted; frontend tests/build green |
| P4 | ⬜ | backend error_code + client mapApiError |
| P5 | ⬜ | en-NG content, yo/ha/ig lazy dicts, switcher UI, TTS voice map |

**Progress numbers:** en.ts keys 132 → **~580** (all verified by the key-resolution test). 17 files converted so far; tsc + 48/48 tests green after every batch.

---

## 1. Goal

Move EliteKids from its current **i18n-readiness seam** (a few screens routed through `t()`) to
**100% internationalization**: every user-facing string — frontend UI, game engine copy,
toast/error messages, backend-sent messages, media alt-text — flows through a single
translation pipeline, with **localization (l10n)** for Nigerian locales and full
**TTS parity** (speech follows the same locale switch).

Success criteria (the "100%" bar):
- Zero hardcoded user-facing strings in `frontend/src` (enforced by a lint/CI gate).
- One dictionary per locale; zero duplicate/overlapping keys.
- Locale switch is instant, persisted, and drives: UI text, plurals, number/date formats, TTS voice.
- New features cannot land without extracted strings (extractor runs in CI).

---

## 2. Current state (post-merge `cc983d8`, 2026-08-26)

### 2.1 Infrastructure (what exists)
- `frontend/src/lib/i18n/index.ts` — **Zustand store** + `persist` (localStorage `elitekids-locale`).
  - Exports: `useI18n`, `t(key, params)`, `LOCALES`, `getTtsLocale()`; re-exports `setLocale/getLocale/addLocale` from `strings.ts` (parallel-merge bridge).
  - `t()` fallback chain: locale dict → `en` → `strings.ts` dict → raw key (never crashes).
- `frontend/src/lib/i18n/en.ts` — **101 keys**, namespaced (`common.*`, `login.*`, `offline.indicator.*`, …). Base `en` dictionary; `en-NG` currently aliases it.
- `frontend/src/lib/i18n/strings.ts` — **31 keys** (`offline.*`, `error.*`, `game.*`, `ui.*`), module-level locale (not persisted). Kept alive post-merge; **duplicates/overlaps** with `en.ts` (see §4).
- `frontend/src/lib/utils/sound.ts` — `speak()` already reads `getTtsLocale()` (line ~211: `utterance.lang = lang || getTtsLocale()`).

### 2.2 Coverage audit (merged tree)
| Metric | Value |
|---|---|
| Source files (tsx/ts) | 86 |
| Files importing i18n | **8** (~9%) |
| `t()` call sites | 173 |
| Unique keys used | ~139 |
| Keys available | 132 (101 en.ts + 31 strings.ts) |
| Locales defined | `en`, `en-NG` (identical dicts) |

**Wired surfaces (8/86):** `Login`, `Dashboard`, `GamePlay`, `AdminNav`, `OfflineBanner`, `OfflineIndicator`, `sound.ts` (TTS).

### 2.3 Known problems (why "readiness" is not enough)
1. **Two parallel dictionaries** (`en.ts` + `strings.ts`) with overlapping concepts
   (`common.loading` vs `ui.loading`, `offline.indicator.backOnline` vs `offline.back_online`).
2. **Coverage is ~9%.** Untouched surfaces with heavy hardcoded text:
   - Teacher: `GameCreator`, `NerdcReport`, `TeacherLessons`, `TeacherAnalytics`, `TeacherApprovals`, `TeacherArena`, `TeacherLive`, `TeacherQuickCreate`, `TeacherBossRaid`, `TeacherVoiceNotes`, `TeacherFestival`
   - Parent: `ParentChildren`, `ParentActivities`, `ParentDashboard`
   - Student: `StudentHome`, `StudentArenaPanel`, `StudentCurriculumPanel`, `StudentLeaderboardPanel`, `StudentLiveBar`, `StudentFestival`
   - Components: `MediaPicker`, `RevisionCard`, `ReviewZone`, `SpeechSettings`, `OnboardingTour`, `BossBattleOverlay`, `CompanionSelect`, `A11ySettings`, `StickerButton`, `TeacherBossRaid`, `Timer`, `ErrorBoundary` messages
   - Game engine strings in `GameEngine/`
3. **Backend returns hardcoded English** (`backend/src/controllers/*.js` — `res.status(4xx).json({ message: "..." })`). Errors surface raw to the UI.
4. **No pluralization/ICU** — only `{param}` interpolation (fine for EN, insufficient for many langs).
5. **No number/date formatting** — dates (`created_at`, leaderboards) render with default `toString()`.
6. **No extraction tooling / lint guard** — nothing stops new hardcoded strings.
7. **TTS is en-NG only** — `SpeechSynthesis` voice selection per locale not yet scoped (see §7).
8. **`LOCALES` has no per-locale dictionary files** — `en-NG` aliases `en`; adding `yo`/`ha`/`ig` means new files + lazy loading story.

---

## 3. Target architecture

### 3.1 Recommendation: keep the lightweight seam, harden it (Option A)
The existing Zustand + `t()` seam is already correct for this app (no SSR, small team, no
heavy plural tables needed short-term). **Recommended path: consolidate rather than replace.**

- **One dictionary registry:** merge `strings.ts` into `en.ts` (or a `dictionaries/` folder:
  `en.ts`, `en-NG.ts`, future `yo.ts`, `ha.ts`, `ig.ts`), loaded via `addLocale`/dynamic import.
- **Delete the parallel bridge** once keys are consolidated (§4).
- **Extend `t()` minimally:** add optional ICU-lite plural helper (`tN(key, count, params)`) and
  keep interpolation. Avoid pulling in a framework unless plural/date needs explode.

**Option B (deferred): i18next/react-i18next.** Revisit ONLY if: >3 locales ship, ICU plurals +
contexts become common, or translators need `.po`/`.json` workflows. Migration cost is
contained because everything already routes through `t()` — the seam is the escape hatch.

### 3.2 Data flow
```
Component → t('key', {param}) / tN('key', n)
  → useI18n.getState().locale
  → dictionaries[locale] (en / en-NG / yo / …)   [dynamic-imported per locale]
  → {param} interpolation → string
Speech: sound.ts speak() uses getTtsLocale() → utterance.lang = BCP-47 tag
Backend errors: HTTP status + error_code → client maps code → t('error.<code>')
```

---

## 4. Dictionary consolidation plan (do FIRST)

Merge `strings.ts` → `en.ts`, resolving overlaps. Suggested mapping:

| strings.ts key | Action | en.ts target / note |
|---|---|---|
| `ui.loading` | merge | dup of `common.loading` → keep one |
| `ui.error` / `ui.retry` / `ui.cancel` / `ui.save` / `ui.delete` | merge | dups of `common.*` |
| `ui.offline_badge`, `ui.pending_sync` | merge | align with `offline.indicator.*` |
| `offline.back_online` | merge | dup of `offline.indicator.backOnline` |
| `offline.queued`, `offline.queue_full`, `offline.sync_failed`, `offline.synced_items`, `offline.drop_after_retries`, `offline.not_available`, `error.offline_check`, `error.offline_not_cached`, `error.server` | **keep (new)** | sync.ts / OfflineBanner use these |
| `game.practice_mode`, `game.teacher_help`, `game.progress_queued`, `game.loading`, `game.submitting`, `game.time_up` | **keep (new)** | GamePlay/retry flows |

Acceptance: after merge, `grep -c` per-dict-key shows one source; a unit test asserts
**no key exists in more than one dictionary** and **every `t('...')` key resolves** (see §8).

---

## 5. Migration phases

### P0 — Consolidation (foundation) · ~0.5 day
- [ ] Merge `strings.ts` into `en.ts` per §4; delete the parallel bridge in `index.ts` (keep `setLocale/getLocale/addLocale` exported from a single module).
- [ ] Add `tN()` plural helper + first plural-using strings.
- [ ] Add dictionary-integrity unit tests (no dup keys, all used keys resolve, `t()` never returns raw key for a known key).
- [ ] Keep `getTtsLocale()`; verify `sound.ts` unchanged.

### P1 — Teacher surface (largest visible gap) · 2–3 days
- [ ] Extract strings in: `GameCreator`, `NerdcReport`, `TeacherLessons`, `TeacherAnalytics`, `TeacherApprovals`, `TeacherArena`, `TeacherLive`, `TeacherQuickCreate`, `TeacherFestival`, `TeacherBossRaid`, `TeacherVoiceNotes`.
- [ ] Namespace keys `teacher.*`, `nerdc.*`, `gameCreator.*`.
- [ ] Acceptance: teacher flows fully switchable with `setLocale('en-NG')` visual diff = 0.

### P2 — Student + game engine · 2–3 days
- [ ] `StudentHome`, `StudentArenaPanel`, `StudentCurriculumPanel`, `StudentLeaderboardPanel`, `StudentLiveBar`, `StudentFestival`.
- [ ] Game engine strings (`GameEngine/`): feedback, combo messages, boss battle copy, review/revision copy.
- [ ] `RevisionCard`, `ReviewZone`, `OnboardingTour`, `BossBattleOverlay`, `CompanionSelect`, `StickerButton`, `Timer`, `ErrorBoundary` fallback copy.
- [ ] Acceptance: full student game loop playable under `en-NG`.

### P3 — Parent surface · 1 day
- [ ] `ParentChildren`, `ParentActivities`, `ParentDashboard` (incl. activity strings, festival views).

### P4 — Backend + error code i18n · 1–2 days
- [ ] Introduce `error_code` on API error responses (`backend/src/controllers/kids.js`, `kidsRevision.js`, auth, parents, sessions).
- [ ] Client: shared `mapApiError(err)` → `t('error.<code>')`; keep `error.server`/`error.offline_*` fallbacks.
- [ ] Acceptance: no raw English `message` renders in UI for known error codes; unknown codes fall back safely.

### P5 — Localization: en-NG real content, then Nigerian languages · ongoing
- [ ] Populate `en-NG.ts` with real regional phrasings (NERDC-aligned wording).
- [ ] Add `yo`, `ha`, `ig` dictionaries via `addLocale` + **lazy dynamic import** (code-split per locale; don't ship all locales in main bundle).
- [ ] Language switcher UI (respecting school-level default; kids lock to school default).
- [ ] TTS per locale: map locale → preferred `SpeechSynthesis` voice names; graceful fallback chain; see §7.

---

## 6. Locale roadmap

| Locale | Code | BCP-47 (TTS) | Dictionary | Status |
|---|---|---|---|---|
| English (US) | `en` | `en-US` | `en.ts` | live |
| English (Nigeria) | `en-NG` | `en-NG` | aliases `en` → `en-NG.ts` | live (alias) → real content in P5 |
| Yoruba | `yo` | `yo-NG` | `yo.ts` | planned |
| Hausa | `ha` | `ha-NG` | `ha.ts` | planned |
| Igbo | `ig` | `ig-NG` | `ig.ts` | planned |
| (optional) Nigerian Pidgin | `pcm` | `pcm` | `pcm.ts` | stretch |

- All Nigerian languages are **LTR** — no RTL work required (revisit only if Arabic is ever added).
- Plurals differ by language (Hausa/Yoruba have distinct plural classes) → design `tN()` to accept per-locale plural rules from the start (even if initially only EN is populated).

---

## 7. TTS / speech parity (critical for a kids app)

- **Current:** `speak()` uses `getTtsLocale()` — already locale-aware.
- **Gaps:** no per-locale voice preference, no voice-availability fallback, `en-NG` may not exist on all devices (Android/Chrome vs iOS).
- **Plan (P5):**
  1. `LOCALES[].tts` → candidate voice list per locale.
  2. `sound.ts` resolves: exact voice match → any voice with lang prefix → default en-US/en-GB fallback.
  3. Expose `ttsLocale` override in `SpeechSettings` (teacher/parent settings screen).
  4. Acceptance: switching locale changes spoken language (or falls back gracefully, never silent-with-no-reason).

---

## 8. Tooling, QA, CI gates

- **Extractor (P1+):** script (TS/Node, `ts-morph` or regex-based) scanning JSX text + string literals in props like `title=`, `aria-label=`, `placeholder=`, `alt=`, `toast(`, `console.*` warnings → produces missing-key report. Run in CI.
- **Lint guard:** eslint rule `no-hardcoded-strings` scoped to JSX text + common text props (allowlist: punctuation, numbers, CSS tokens, keys, `data-*`).
- **Unit tests** (`vitest`, extend existing pattern):
  - Every dictionary: no duplicate keys, no empty values.
  - Every `t('...')` key in `src` resolves in at least one dictionary (fails the build otherwise).
  - `t()` interpolation + `tN()` plural correctness.
  - Locale switch persists and `getTtsLocale()` follows.
- **Translation completeness check:** per-locale coverage report (`missing keys per locale`) — gate new locales on 100% of keys.
- **Review process:** teacher-approved glossary for NERDC terms per locale (reuse `team-docs/templates/` + `d-topics-matrix.md` naming where applicable); translations reviewed by native speakers before enabling a locale for real users.

---

## 9. Backend i18n detail

- Add `error_code` alongside `message` in error responses (no behavior change now; client prefers code when present).
- Never localize server-side (keeps one API); localization is a **client concern** via `mapApiError`.
- Known hot spots to annotate: `backend/src/controllers/kids.js`, `kidsRevision.js`, auth/parent/session controllers, `backend/src/routes/kids.js` validation errors.
- Do NOT translate DB content (lesson titles/subjects are content, not UI — teacher-authored).

---

## 10. Risks / open questions

- **Scope creep:** P1–P3 is a lot of mechanical extraction — batch per phase with supervisor review (per ops playbook gates).
- **Two dictionaries debt:** must be resolved (P0) before any new locale, else translations split across files.
- **GamePlay is 4k+ lines** — extraction there is high-churn; do it in slices (per game mode), not one mega-edit.
- **Kids lock to school locale:** product decision — parent/teacher sets school default; child cannot change (mirror existing lock hierarchy).
- **Stale strings after merge:** `.bak-*` files in `pages/` are dead — do not extract from them; optionally delete.

---

## 11. Quick-start for the next agent

1. Read `frontend/src/lib/i18n/index.ts`, `en.ts`, `strings.ts` (post-merge state).
2. Land **P0** (consolidation + tests) — it unblocks everything else.
3. Use `t()` key namespaces: `common.*`, `login.*`, `dashboard.*`, `student.*`, `teacher.*`, `parent.*`, `game.*`, `offline.*`, `error.*`.
4. Verify each phase with `npm test` + `npm run build` in `frontend/` and a locale-switch smoke test (`setLocale('en-NG')` in devtools).
