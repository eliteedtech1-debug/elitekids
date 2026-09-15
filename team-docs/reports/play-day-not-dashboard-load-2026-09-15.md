# A play day is earned by playing, not by opening the app (Q58)

**Date:** 2026-09-15 · **Worker:** Buffy · **Status: FIXED, NOT DEPLOYED**

**Brief:** *"Stop a dashboard load from counting as a play day so opening the app doesn't
advance the streak."*

---

## 1. What was happening

Found by the 2026-09-15 live PLAY walk, which reported `readOnly: false`: opening the student
dashboard issued

```
POST https://elitekids.com.ng/kids/economy/streak/record
```

and it succeeded. `streak.ts#recordPlayDay` was called from `StudentHome.tsx:365` — **its only
call site in the whole app** — inside the mount effect's `finally`. The endpoint writes:

```
UPDATE kids_economy SET streak_current, streak_longest = GREATEST(...),
       streak_freeze_count, last_play_date, current_multiplier WHERE child_admission_no = :adm
```

plus possible `kids_economy_milestones` inserts.

Two consequences:

- a child who never played a single game advanced their streak every day they logged in, and
  `last_play_date` was reset — so the "played today" reminder was **always** quiet;
- the streak recorded **app opens**, which is the opposite of what a streak is for.

The walk also corrected an earlier claim: the 09-15 session recorded that `recordPlayDay` had
"fallen back to localStorage-only after `/kids/streak/record` was removed". It checked the wrong
path — the live one is `/kids/economy/streak/record`, it was never removed, and it persists.
Two **real children's** band walks had already advanced their streaks.

## 2. What the check turned up

The dashboard POST was not the only streak path, and not even the important one:

- **`updateEconomyAfterGame` already advances the streak** (`streak_current`,
  `last_play_date`) — but its only caller is the **ADE v2 per-item** path
  (`kidsAdaptiveV2.js:256`). So a child who answers items already earns the day; its comment
  claims it is "called from ADE + game-complete", and there is **no game-complete caller**.
- Therefore the dashboard POST was **surplus for a playing child and the only mechanism for a
  non-playing one** — i.e. it existed to keep streaks alive for children who do not play.

## 3. The fix — play is recorded where it happens

Server (authoritative):

- `kidsEconomy#applyPlayDay` — the streak rule (advance, persist with its multiplier, award
  crossed milestones) extracted once, so the endpoint and every real play event share it.
- `kidsEconomy#recordPlayDay` — a **fire-and-forget, never-throws** wrapper for a verified play
  event. A streak is a reward, never a precondition for play.
- `kids.js#recordGameComplete` now calls it (`POST /kids/progress/game-complete`). The admission
  comes from the **JWT** — the child actually playing — not the request body. Idempotent per
  calendar day, so a child cannot double-advance it by finishing two games.

Client (display, not persistence):

- `StudentHome` no longer POSTs on mount; it refreshes what it shows from the balance **read**
  via the new `cacheServerStreak(current, longest)` — which deliberately leaves
  `lastPlayDate` / `totalDaysPlayed` / `milestones` alone, so "played today" stays truthful.
- `GamePlay` calls `recordPlayDay(admissionNo)` where a game **completes** (after the preview
  guard, so staff preview can never advance a child's streak). It is fire-and-forget and never
  holds the results screen; it also keeps the local offline mirror correct.
- The `HomeTab` comment that documented "opening the dashboard records a play day (so the streak
  reminder stays quiet)" was corrected — that behaviour no longer exists, and `StreakReminder`
  already handles the never-played state itself.

## 4. Verification

**Browser, same child (EK-Q4-TEST-001), same harness, before/after:**

| | live (old build) | staging (new build) |
|---|---|---|
| write attempts on a dashboard load | `['POST …/kids/economy/streak/record']` | **`[]`** |
| `noWritesOnLoad` | false | **true** |
| cards / sections / offers | 1718 / 52 / 6 | 1718 / 52 / 6 |

The harness gained `noWritesOnLoad` (previously it only asserted that attempted writes were
*blocked*). Live fails it and the new build passes it, so the assertion is falsifiable and the
change is what moved it. The in-browser abort of that request is kept as defence.

**Tests**

- `backend/test/streak-play-day.test.js` (4): the dashboard's reads (balance + catalog + path)
  record no play day; a completed game records exactly one (`last_play_date` = today,
  `streak_current` = 1); a second game the same day does not advance it again; the explicit
  endpoint still works and reports `streak_increased: false`.
- `frontend/src/lib/utils/streak.test.ts` (6): `cacheServerStreak` never claims a play day,
  never lowers the longest, is safe on a fresh device and against a non-numeric server value;
  plus a **call-site contract** that `StudentHome` contains no `recordPlayDay(` call (on
  comment-stripped source, so prose cannot trip it) and `GamePlay` does.

**Mutation-checked both ways** — restoring a `recordPlayDay` call in the dashboard fails the
call-site guard; removing the server-side record from game-complete fails 3 of the 4 backend
tests. Files verified byte-identical after each sweep.

**Gates:** backend **68/68 suites · 782/782 tests**; frontend `tsc` clean, vitest **276/276**,
`build:staging` + compat-css guard green.

## 5. Flagged, not changed

- **`GET /kids/economy/balance` still INSERTs the `kids_economy` row** for a child who has none
  (`getEconomy` creates on read). That is a row creation, **not** a play day — `last_play_date`
  stays NULL and the streak stays 0 — but it does mean a dashboard load is not a pure read.
  Left alone deliberately: several callers rely on the row existing.
- **The endpoint still exists and still writes** if called. Nothing calls it on load any more,
  and the server no longer needs it at all — it is kept as the documented explicit API rather
  than removed mid-flight.
- **Offline play:** a game completed offline advances the local mirror immediately and the
  server records the play day when the queued progress syncs — so the day lands on the **sync**
  date, not the play date. Pre-existing behaviour of the offline queue; worth a decision if it
  ever matters.
- **NOT DEPLOYED.** `git push origin main` is the deploy and needs an explicit order. Live is
  still `20260915T154251Z-8b35aa5`, where every dashboard load still writes.
