# FB-TASK-2 — read-only audit: convertTestScores math + staff-gating on new endpoints

**Date:** 2026-08-23 · **Agent:** fb-review (read-only, C7) · **No app code edited.**
**Scope files:** `backend/src/controllers/kidsModeLock.js`, `backend/src/controllers/kidsLeaderboard.js`, `backend/src/routes/kids.js`, `backend/src/controllers/kidsSeries.js`, `backend/src/services/routesHelper.js`, `backend/src/controllers/kids.js` (hook), models index.
**Verification method:** static trace + node-verified module exports (prior run) + standalone math replication (pure compute, no DB touched).

---

## Area 1 — Conversion math (`convertTestScores`, kidsModeLock.js:286-447)

**Verdict: GAP** — core scaling is correct; guards exist; but 3 math/integrity gaps + 1 cross-school gap.

### 1.1 Scaling formula — PASS (verified numerically)
`scaled = round2( got / denomSum × targetMax )` (kidsModeLock.js:410). Replicated:
- N=1: 40/60 → **10**/15 ✅ (brief example)
- N=2: (20/30)+(20/30) → **10**/15 ✅
- N=3: (10/20)+(15/20)+(15/20) → **10**/15 ✅
- Uniform ratio — correct for N>1 and N=1. 2-dp rounding (`Math.round(...*100)/100`) deterministic. Zero-denominator guard present (`denomSum <= 0 → 400`, :400-402) — denom per game is `items*10 ≥ 10` or `MAX(score)` or `100`, so can't be 0. Duplicate `lesson_ids` deduped via `[...new Set(ls.map(String).filter(Boolean))]` (:303-304). ✅

### 1.2 GAP — no clamp to `targetMax` (overshoot possible)
kidsModeLock.js:410 — `Math.round((got / denomSum) * targetMax * 100) / 100` is never clamped.
- `kids_progress.score` is **client-supplied** (`Number(score) || 0`, kids.js:777) and games may award bonus/streak XP beyond `items×10`; if `got > denomSum` the scaled value exceeds the CA/EXAM max.
- Verified: 65/60 → **16.25** for a CA1 max of 15.
- Snippet (do not apply): `const scaled = Math.min(targetMax, Math.round((got / denomSum) * targetMax * 100) / 100);`

### 1.3 GAP — `deriveMax` misses the quiz item key `questions`
kidsModeLock.js:365-369 loops `['items','sentences','pieces','pairs']` only. The repo's own invariant registry maps `quiz → 'questions'` (backend/test/helpers/game-config-invariant.js:21). Quiz-templated test games therefore fall through to the **observed `MAX(score)`** denominator (:395-396) — if no student hit the true max, the denominator understates and every student's converted score inflates.
- Snippet: `for (const k of ['items', 'sentences', 'pieces', 'pairs', 'questions'])`.

### 1.4 GAP — cross-school/subject lessons NOT rejected
- The lock lookup (:311-313) is `WHERE class_code = :c AND locked_mode = 'test' AND lesson_id IN (:ls) GROUP BY lesson_id` — **no `school_id` filter**, and `GROUP BY` without `ORDER BY` picks an arbitrary lock row per lesson (window `lk.created_at` at :386 is non-deterministic if multiple lock rows exist for a lesson).
- Caller's school is never compared against `lock.school_id`; a teacher may convert any `class_code` + `lesson_ids` combination that happens to have matching locks (including another school sharing the same class_code). Lessons from another school/subject are folded in — subject derivation (:326-335) only *prefers* domesticated rows via `COALESCE`, never rejects foreign ones; fallback subject is `'GAMES'`.
- Snippet: scope the locks query with `AND school_id = :s` (caller school) and 400 if `locks[].school_id` ≠ caller school.

### 1.5 GAP (minor) — missing-game penalty + non-atomic writes
- :408-409 `got += perStudent[adm][lid] || 0` — a student with no attempt in one selected game gets 0 in the numerator while the denominator includes that game (absent = penalized). May be intended; confirm.
- Per-student SELECT-then-INSERT/UPDATE (:414-432) is not in a transaction — mid-loop failure → 500 with partial rows written (draft state mitigates). Concurrent converts can double-write if no unique index exists on `(admission_no, ca_setup_id, subject_code, class_code, academic_year, term)` (the existence key, :416-419) — **unverifiable in-repo: `weekly_scores`/`ca_setup`/`academic_calendar` live in elite_db (sibling service); no schema here.** Draft-state write itself matches intent: `is_locked=0, status='Draft'` (:431-432) ✅. Flag for master: confirm `weekly_scores` columns (school_id/branch_id NOT NULL?) and unique key before prod.
- Week numbering: `derivedWeek = max(1, ceil(daysIn/7))` (:340-341) vs leaderboard `currentTerm` `floor(daysIn/7)+1` (kidsLeaderboard.js:66) — **verified off-by-one on exact week boundaries** (day 7 → convert 1 vs leaderboard 2; day 14 → 2 vs 3). Snippet: share one `weekFromDate` helper.

## Area 2 — Staff-gating on new FB routes (routes/kids.js)

| Route | Middleware | Handler re-check | Verdict |
|---|---|---|---|
| `POST /kids/test-scores/convert` (:116) | `auth` only | `callerRole(req) !== 'teacher' → 403` (kidsModeLock.js:289-291) | **PASS-gating / GAP-scoping** — student/parent blocked ✅; but no school/class-ownership check (see 1.4) |
| `POST /kids/series/:id/domesticate` (:117) | `auth, requireStaff` | `callerRole !== 'teacher' → 403` (:484) | **GAP (inconsistent, fails closed)** — `requireStaff` admits developer/exam_officer (routesHelper.js:36-43) but handler rejects them (`callerRole` collapses only admin/branchadmin/superadmin→teacher). Safe direction, but contradictory. Also **schema mutation on request path** (ALTER TABLE kids_lessons, :511-520) — C2 conflict, needs explicit order (prior F4.1) |
| `GET /kids/series-domestications` (:118) | `auth` only | **none** (listDomestications :558-572) | **GAP (low severity)** — any authenticated user (student/parent) can enumerate the school's series→subject mappings; inconsistent with the staff-gated writer. No child PII, but gate it: `app.get('/kids/series-domestications', auth, requireStaff, ...)` or add handler check |
| `GET /kids/lessons/:id/next-up` (:97) | `auth` only | none | **PASS** — child-facing sequencing, no cross-child data. Note: returns **first lesson of the NEXT UNIT**, not the next lesson within the current unit (`siblings[idx+1]`, kidsSeries.js:405-407) — confirm intended semantics; also unbounded `findAll` over all units per call |
| `GET /kids/leaderboard` (:93) | `auth` only | student forced to **own class** (query `class_code` ignored; kidsLeaderboard.js:126-137) | **PASS** — staff may pass `?class_code=` (school-scoped via `p.school_id=:s`); school_id from `x-school-id` header — trusted client header (consistent app-wide pattern, flag once) |
| `GET /kids/leaderboard/me` (:92) | `auth` only | students-only 403 (kidsLeaderboard.js:208-211) | **PASS** — own rank/free-access only |
| `GET /kids/badges` (:94) | `auth` only | students-only 403 (:255-258) | **PASS** — own badge shelf; `admission_no` never echoed (:266) |

## Area 3 — Leaderboard integrity (kidsLeaderboard.js)

### 3.1 `recordAttemptPoints` — PASS (containment + caps)
- Fire-and-forget: called unawaited at kids.js:788 **after** `KidProgress.create`; entire body inside `try/catch` (kidsLeaderboard.js:71-103) → promise never rejects → **cannot crash `recordGameComplete`** ✅.
- Quality cap: `delta = 2 + Math.min(10, round(score/10))` (:78) — score component capped at 10 ✅ (per-attempt max 12 = 2 base + 10 quality; confirm "≤10" meant the quality component only). Negative client score → `2 + negative` (floor 2 not enforced); minor.
- Diminishing returns: `attempts >= 3 → delta = ceil(delta/2)` (:88-90) — **best-effort, not atomic**: SELECT-attempts then upsert is racy; two concurrent attempts can both compute full delta (upsert adds both). Acceptable for a leaderboard; note it.

### 3.2 `awardTop3IfNeeded` — PASS w/ 2 notes
- Double-award guards: `SELECT … LIMIT 1` "already done" check (:177-181) **plus** `INSERT IGNORE` under unique `uq_badge (school, year, term, week, class, position)` (:32, :189-196) → concurrent calls cannot double-award ✅. Points only ever increase (upsert `points = points + VALUES(points)`), so week N-1 rankings are stable once awarded ✅.
- **GAP — `free_access_until` = term end, not week end:** `term.week_end` is populated from `academic_calendar.end_date` (TERM end, kidsLeaderboard.js:68-69) → free access lasts to end of term, and `getMyStatus` honors it via `free_access_until > NOW()` (:236-244). If the brief's "week_end" is literal, this is wrong; if "free for the rest of the term" is intended, rename. Confirm with master.
- **GAP (coverage) — lazy rollover awards only the immediately-previous week:** `prevWk = term.week_number - 1` (:175); a class whose first leaderboard view happens in week 5 only ever gets week-4 badges (weeks 1-3 never backfilled). No cron/backfill. Also a partial prior award (`done` row present, fewer than 3 badges) is never completed (:181 early-return).

### 3.3 Privacy/sanitization — PASS
- Leaderboard entries expose only `rank, display_name (first name + last initial), avatar (md5(admission_no)→emoji), points, attempts, medal` (:160-168); `admission_no` is SELECTed (:147) but never serialized ✅. `getMyStatus`/`getMyBadges` are students-only, own-scope ✅. Class scope enforced for students ✅.

---

## Summary verdicts
| Area | Verdict |
|---|---|
| 1. Conversion math | **GAP** — formula correct; clamp `targetMax` missing; `questions` key missing from `deriveMax`; cross-school not rejected; non-atomic/race + elite_db schema unverifiable in-repo |
| 2. Staff-gating | **GAP (low)** — convert/domesticate block students/parents ✅ but domesticate middleware-vs-handler role mismatch; `series-domestications` ungated read; convert has no school/class-ownership scope |
| 3. Leaderboard integrity | **PASS** with 3 notes — containment ✅, caps ✅, double-award ✅; `free_access_until`=term-end (naming/intent), lazy-only prev-week rollover, racy diminishing-returns |

**Top risks for the lead:** (1) convert overshoot > CA/EXAM max on client-inflated/bonus scores; (2) quiz test-games silently under-denominate → inflated class scores; (3) teacher can convert another school's class (same class_code) — needs `school_id` scoping; (4) `domesticateSeries` schema mutation on request path (C2); (5) weekly_scores column/unique-key assumptions must be validated against elite_db DDL.
