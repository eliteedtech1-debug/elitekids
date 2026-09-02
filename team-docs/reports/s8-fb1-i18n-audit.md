# S8-FB1 — i18n P3 Key Audit (Q14)

**Role:** fb-review (read-only) — findings only, no app-code edits applied.
**Date:** 2026-09-02
**Scope:** verify every `t()`/`tN()` key resolves in the active English dictionary.

---

## Method

- Parsed the **active** base dictionary `src/lib/i18n/en.ts` (1024 keys) — this is the
  dict `t()` actually reads (`index.ts: import { en } from './en'`).
- Parsed `src/lib/i18n/locales/en.json` (948 keys) separately — **NOT the active dict**
  (see Finding 2).
- Scanned 97 `.ts/.tsx` source files (excluding `lib/i18n/*`) for literal
  `t('key')` / `tN('key', …)` calls. 859 unique literal keys used.
- Resolution rule checked:
  - `t(key)` → needs `key` in dict (else renders raw key — `index.ts:131`).
  - `tN(key,count)` → resolves via `key.one`/`key.other` **or** base `key`. Plurals exist
    for nearly all tN keys, so those are fine.

---

## Finding 1 — 27 genuine missing keys (render raw key text in UI)

`t()` falls back to the key string when absent (`index.ts:131`), so each of these shows
the literal dotted key (e.g. `parent.childAdmission`) instead of readable text.

Confirmed user-visible misses:

| Key | Used at |
|-----|---------|
| `parent.childAdmission` | `components/ParentDashboard.tsx:164` |
| `parent.childNamePlaceholder` | `pages/Parent/ParentChildren.tsx:584` |
| `parent.linkChildHint` | `pages/Parent/ParentChildren.tsx:542` |
| `parent.haveAccount` | `components/ParentDashboard.tsx:132` |
| `parent.activitiesNotice` | (tN — no base/.one/.other at all) |
| `parent.trackJourney` | `components/ParentDashboard.tsx` |
| `login.noAccount` | `pages/Login/Login.tsx:440` |
| `login.noSubscription` | `pages/Login/Login.tsx:153` |
| `game.letsPlay` | `pages/Student/GamePlay.tsx:4144` |
| `game.letsPractice` | `pages/Student/GamePlay.tsx` |
| `game.practiceEncouragement` | `pages/Student/GamePlay.tsx` |
| `game.breakHint` | `pages/Student/GamePlay.tsx` |
| `game.practice_mode` | `pages/Student/GamePlay.tsx` |
| `game.teacher_help` | `pages/Student/GamePlay.tsx` |
| `game.feedback.matchCorrect` |  |
| `game.result.timesUp` | `pages/Student/GamePlay.tsx:2651` |
| `teacher.live.noStudents` | `pages/Teacher/TeacherLive.tsx:149` |
| `teacher.voice.titleField` | `pages/Teacher/TeacherVoiceNotes.tsx:158` |
| `teacher.voice.titlePlaceholder` | `pages/Teacher/TeacherVoiceNotes.tsx:163` |
| `onboarding.play` | `components/OnboardingTour.tsx:392` |
| `dashboard.parentBlurb` |  |
| `errorBoundary.body` |  |
| `freemium.dailyDoneTitle` |  |
| `freemium.schoolEndedTitle` |  |
| `gameCreator.successBody` |  |
| `studentFestival.noneHint` |  |
| `offline.banner.offlineTitle` |  |

**`parent.activitiesNotice`** is the single tN key with no base AND no `.one`/`.other`
form — double broken for plural use.

> NOTE: `parent.childNamePlaceholder` (`ParentChildren.tsx:584`) was already broken
> before this session's edits; it is not a regression from the presence work.

### Dynamic namespaced keys (resolve at runtime — review each)

- `companion.name.${companion.type}` / `companion.greeting.${companion.type}` / `companion.context.${context}.${index}` (`CompanionSelect.tsx:26,27,43`)
- `onboarding.step.${step.id}.title` / `.description` (`OnboardingTour.tsx:68,69`)
- `upsell.feature_${key}` (`SubscriptionUpsell.tsx:115`)

Verify a concrete key exists for each runtime value (e.g. `companion.name.fox`,
`onboarding.step.1.title`, `upsell.feature_…`) or that a local fallback guards them,
else they render the raw template.

---

## Finding 2 — `locales/en.json` is stale and NOT the active dict

- Active = `en.ts`. `locales/en.json` has 948 vs 1024 keys; **128 keys in en.ts absent
  from en.json**, 52 present in json but not ts.

If the lazy-load path (`loadLocale('en')`) or a future locale switcher reads `en.json`,
keys drift / render raw. **Recommend**: delete `en.json` or regenerate it from `en.ts`
(single English source of truth).

---

## Finding 3 — `ha.json` partial coverage (starter scope)

`ha` is the only real alternate locale, top-50 starter subset. 849+ English keys render
English (or raw if also missing in en) when `ha` is active. Expected per S8-1, document
as known-incomplete.

---

## Verdict

| Area | Verdict |
|------|---------|
| Every `t()` literal resolves in active `en.ts` | **GAP** — 27 static misses (+ dynamic review) |
| tN plurals resolve | **PASS** — `.one`/`.other` exist for all except `parent.activitiesNotice` |
| Dynamic namespaced keys resolve | **REVIEW** — companion/onboarding/upsell concrete keys |
| `en.json` parity with active dict | **GAP** — 128/52 drift |
| `ha.json` full coverage | **KNOWN-PARTIAL** |

---

## Recommended fixes (NOT applied — read-only)

1. Add the 27 missing static keys to `en.ts` with correct English (highest visibility:
   `parent.*`, `login.*`, `game.*`, `teacher.live.noStudents`, `teacher.voice.*`,
   `onboarding.play`). For `parent.activitiesNotice`, add `.one`/`.other`.
2. Single-source `en` — delete or regenerate `locales/en.json` from `en.ts`.
3. Add concrete dynamic-key entries or local guards for companion/onboarding/upsell.
# S8-FB1 i18n audit (Q14) — progress
2026-09-02T19:12:50Z [COMPLETE] Report: team-docs/reports/s8-fb1-i18n-audit.md
- 27 genuine missing static t() keys in active en.ts (incl parent.childNamePlaceholder, teacher.live.noStudents, game.letsPlay).
- tN plurals PASS (all .one/.other present except parent.activitiesNotice).
- - 6 dynamic template keys (companion/onboarding/upsell) need runtime concrete-key check.
- en.json (948) stale vs en.ts (1024) — 128/52 drift; not active dict.
- ha.json starter subset only. No code edits (read-only). QUEUE Q14 → DONE.

