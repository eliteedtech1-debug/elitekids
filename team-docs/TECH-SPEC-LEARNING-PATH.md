# Tech Spec — Learning Path Dashboard (replace "All Games" tab)

**Date:** 2026-09-03 · **Owner:** opencode (worker) + freebuff (fb-review, read-only)
**Depends on:** `frontend/src/pages/Student/StudentHome.tsx` (current dashboard),
`backend/src/controllers/kidsSeries.js` (series/units/lock-status/next-up),
`backend/src/controllers/kids.js` (`listLessons`, `KidProgress`),
`team-docs/TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.md` (one-game-one-topic series rule)
**Compliance:** C1/C2 (new kids-owned table additive + defaulted), C4, deploy-on-push,
workers do not self-commit.

Legend: ✅ done · 🟦 in progress · ⬜ todo

---

## TL;DR — verdict (verified)

The **"All Games" tab is a flat, unordered dump** — and it violates the series rule and age
isolation the user expects. Verified in `StudentHome.tsx`:

1. **"All Games" tab exists** (`student.tab.all` = "All Games", filter `() => true`) as the
   **first/default tab** — shows every published lesson with **no series, no order, no
   progress, no locks**.
2. **Age isolation is broken.** `filteredLessons` (`StudentHome.tsx:314-343`) maps the class →
   age band, tries exact → adjacent → **falls back to ALL lessons** when no exact/adjacent
   match (`classFiltered = lessons`). A Year-3 child can see Year-4 games.
3. **The series engine exists but is unused by the student UI.** `kids_game_series` +
   `kids_game_units` (`unit_number`, `prerequisite_unit_id`, `content_items`) + the E3f
   **prerequisite gate** (`GET /kids/units/:id/lock-status`: every game in the prereq unit
   needs Practice done AND Test ≥50) + `GET /kids/lessons/:id/next-up` are all built and
   tested — **StudentHome never calls any of them**. The learning path is 80% built, 0% wired.
4. **No goal/target feature exists** — no weekly-target table, endpoint, or UI.

**This spec:** replace the All Games tab with a **visual learning path** (Duolingo-style)
built on the existing series→units→lessons engine, add **strict age isolation** (Year 3
never sees Year 4; Year 4 sees Year 3 only as "passed/spill-over" levels), and add
**weekly goals** (child- or teacher-set; auto-progress from real play).

---

## 1. Current state vs target (gap matrix)

| Capability | Current (`StudentHome.tsx` + backend) | Target |
|---|---|---|
| Default dashboard view | "All Games" flat grid, tab #1 | **Learning Path** (snake/vertical path) |
| Series/units on student home | NOT fetched (endpoints exist: `GET /kids/series/:id`, lock-status, next-up) | Path = series → units → lessons, ordered |
| Per-lesson state on the grid | none shown | Locked / Current / Completed / Passed / Spill-over icons on nodes |
| Age isolation | exact → adjacent → **fall back to ALL** | **Hard server-side ceiling**: student band = max visible age_level; lower bands visible only as passed/spill-over path segments |
| Spill-over recovery | n/a (flat grid) | Lower-band unfinished units appear **before** current band as "go back & pass" nodes |
| Weekly goal | none | **Goal card + path marker**: e.g. "This week: finish 1 target (🎯 1/1)" — child- or teacher-set, auto-rollover, progress from real play |
| Subject browsing (numbers/letters/…) | regex tabs on flat list | Keep as **secondary filter within the allowed band** (optional phase) |
| Festival / leaderboard tabs | special tabs | Keep unchanged |

---

## 2. Target architecture

### 2.1 Learning path = series + units + lessons (existing data model)

```
Series (path)  ── e.g. "Money & Time"          kids_game_series
 └─ Unit 1  Basic Time & Watch   (topic 1)     kids_game_units.unit_number
     └─ lesson A  (game)                        content_items[] lesson_id
     └─ lesson B  (game)                        ── each unit = ONE topic (series rule)
 └─ Unit 2  Money — Coins        (topic 2)
 └─ Unit 3  Intermediate Time    (topic 3)
 └─ Unit 6  Final story unit     (connects)    ── prerequisite_unit_id chains units
```

- **No schema change needed for the path itself** — series/units/lessons/`prerequisite_unit_id`
  already exist. The E3f gate already defines "unit unlocked" (Practice done + Test ≥50 on
  every lesson of the prereq unit).
- Each **lesson node** state from `KidProgress` (`child_admission_no`, `lesson_id`, `mode`,
  `score`): `none` → `practice_done` → `passed` (test ≥50) → `completed` (whole unit).

### 2.2 New backend endpoint: `GET /kids/learning-path?student_id=`

Returns the child's **entire journey** in one call (replaces N+1 calls; matches lock-status +
next-up semantics):

```json
{
  "success": true,
  "data": {
    "student": { "age_band": "KG1", "class_name": "Year 3" },
    "goal": { "type": "weekly", "target": 1, "done": 1, "period_start": "2026-09-01", "period_end": "2026-09-07" },
    "path": [
      {
        "series_id": "s-1", "name": "Money & Time", "category": "Numeracy",
        "units": [
          {
            "unit_id": "u-1", "unit_number": 1, "title": "Basic Time & Watch",
            "topic": "Read o'clock times", "locked": false,
            "lessons": [
              { "lesson_id": "L-1", "title": "Tap the 3 o'clock clock", "state": "passed" },
              { "lesson_id": "L-2", "title": "Match o'clock times", "state": "practice_done" }
            ]
          }
        ]
      }
    ]
  }
}
```

**Rules enforced server-side (non-negotiable):**
1. **Age ceiling (isolation):** `age_level` of every lesson returned ≤ student's band
   (derived from `students.class_name`/`current_class` — the frontend's
   `classToAgeLevel()` mapping moves to the backend so isolation can't be bypassed by
   editing the client). Year 3 (KG1) never receives KG2/Primary lesson ids — **404/omitted,
   not filtered-then-fallback**.
2. **Spill-over:** lower-band units with incomplete lessons are included in the path **before**
   the current band, labeled `spillover: true` ("go back & pass to unlock your level").
   Fully-passed lower-band units show as a compact "passed" header, not full nodes.
3. **Unit locks:** reuse the E3f gate (`getUnitLockStatus` logic) per unit — `locked: true`
   + reason ("Finish unit 1: play Practice AND pass the Test first").
4. **Goals (new):** compute `done` = count of lessons with `mode='test' AND score>=50` (or
   practice-completes for Creche) in the current period, across all units ≤ band.

### 2.3 New kids-owned table + goal API (C1/C2)

```sql
CREATE TABLE IF NOT EXISTS kids_learning_goals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(50) NOT NULL,
  goal_type ENUM('weekly') NOT NULL DEFAULT 'weekly',
  target_count INT NOT NULL DEFAULT 1,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  set_by ENUM('child','teacher','auto') NOT NULL DEFAULT 'auto',
  status ENUM('active','done','expired') NOT NULL DEFAULT 'active',
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kids_learning_goals_period (child_admission_no, goal_type, period_start)
) ENGINE=InnoDB;
```
- Boot-time reconcile via the approved existence-check pattern (`backend/src/index.js`
  template); **additive + defaulted**, no ALTER on shared DBs (C1/C2).
- Endpoints: `GET /kids/goals/:admissionNo` · `POST /kids/goals/:admissionNo`
  (`{ target_count, set_by }`) · lazy auto-init: if no row for the current week, auto-create
  `target_count=1, set_by='auto'` on read. Rollover = period_start/end math, no cron needed
  (compute on read).

### 2.4 Frontend

| Component | Change |
|---|---|
| `frontend/src/components/LearningPath.tsx` (new) | Snake/vertical **path renderer**: nodes = units (phase markers) with lesson dots; **visual halting points** = unit gate nodes (padlock + "finish unit X"); state colors — ✅ completed, ⭐ passed, pulsing = current/next-up, 🔒 locked, ↪ spill-over segment; "current position" avatar marker |
| `StudentHome.tsx` | Replace `all` tab with `path` as the **default first tab** (`LearningPath`); drop the `filter: () => true` flat grid as primary; keep festival/leaderboard; subject tabs become an optional secondary filter **within the path's allowed band** |
| `frontend/src/components/GoalCard.tsx` (new) | Weekly goal banner: "🎯 This week: finish 1 target — 1/1 done ✅" + child-tap "Set my goal" (target picker) + teacher-set path (from teacher dashboard, later phase) |
| `frontend/src/lib/api/endpoints.ts` | `LEARNING_PATH`, `GOALS.GET/POST` |
| `frontend/src/lib/i18n/en.ts` (+`ha.json`) | `student.path.*` (title, states, spillover, goal strings) |

**Duolingo-style details (the "journey" feel):** path scrolls vertically; each unit is a
"phase" with a checkpoint (halting point) node at its end; completed phases stay lit as the
child passes them; the goal marker sits at the current position; tapping a node opens the
game (respecting lock state); offline: reuse `offlineContent` catalog + progress snapshots so
the path renders from cache.

---

## 3. Actionable plan

### Phase 1 — Backend: learning-path + age isolation + goals 🟦
| # | Task | Files | Effort |
|---|---|---|---|
| 1.1 | Server-side `classToAgeLevel` + band ceiling; `listLessons` gains `max_age_level` filter (or the path controller filters) so **no child request can ever receive a higher-band lesson** | `backend/src/controllers/kids.js`, `kidsSeries.js` | S |
| 1.2 | `GET /kids/learning-path?student_id=` — series→units→lessons with per-lesson state, unit lock (reuse E3f gate), spillover labeling | `kidsSeries.js`, `routes/kids.js` | M |
| 1.3 | `kids_learning_goals` boot reconcile + `GET/POST /kids/goals/:admissionNo` with lazy weekly auto-init + rollover | `backend/src/models/KidLearningGoal.js` (new), `controllers/kidsGoals.js` (new), `index.js` | S |
| 1.4 | Tests: **age isolation** (KG1 request returns zero KG2/Primary ids), spillover inclusion, lock gate, goal CRUD + weekly rollover | `backend/test/b3-learning-path.test.js` (new) | S |

**Exit:** `curl` as a KG1 child → path contains only ≤KG1 lessons; locked/spillover/goal
fields correct; suite green at baseline fail-set.

### Phase 2 — Frontend: LearningPath + GoalCard 🟦
| # | Task | Files | Effort |
|---|---|---|---|
| 2.1 | `LearningPath.tsx` renderer (path, phase gates, states, current marker, spillover segment) | new component | M |
| 2.2 | `GoalCard.tsx` + wire into path header; child goal setter | new component | S |
| 2.3 | `StudentHome.tsx`: path as default tab, remove flat `all` grid as primary; keep festival/leaderboard | `StudentHome.tsx` | M |
| 2.4 | i18n keys + vitest (path states render, locked node not clickable, goal progress) | en.ts/ha.json, tests | S |

**Exit:** tsc clean, build OK, vitest green; a KG1 student sees a path with locked future
units and never a higher-band game.

### Phase 3 — Teacher goal-setting + polish 🟦
| # | Task | Files | Effort |
|---|---|---|---|
| 3.1 | Teacher dashboard: set weekly goal per child/class (reuses goal POST with `set_by='teacher'`) | `TeacherAnalytics.tsx` or new card | S |
| 3.2 | Spill-over UX copy + guide note (docs: "the path & goals") | guide | S |
| 3.3 | Live smoke post-deploy: teacher creates series w/ units → child sees path → plays → unit unlocks → goal 1/1 | manual | S |

**Exit:** end-to-end verified on `elitekids.com.ng`; teacher-set goal appears on child path.

---

## 4. Verification & rollback

- Per phase: `tsc --noEmit`, build, regression 25/25, full suite = baseline fail-set only
  (C-DEBT-01/02), vitest incl. new suites.
- **Backward compat:** old flat lessons endpoint unchanged (teacher/admin + other apps
  unaffected); the student UI is the only consumer switching to the path.
- Rollback = revert commit + re-push (deploy auto-runs); the new table is additive and
  unused by other apps.
- Deploy only via MASTER push; workers never self-commit.

## 5. Risks

- **Age-band mapping accuracy**: `classToAgeLevel` regexes are heuristic (Year 3 → KG1,
  Year 4 → KG2). Server-side enforcement is only as good as the mapping; log unmapped
  classes and fall back to **narrowest** band, never widest.
- **Lock UX frustration**: hard locks can frustrate spill-over kids — keep "go back & pass"
  (spillover) visible and always allow practice replays of already-passed lessons (never
  regress garden, per ECCE rule).
- **Goal fatigue**: weekly target default `1` (light); never auto-increment; teacher can
  raise per class; participation-based, not speed (Doc 16 equity).
- **N+1 queries**: path endpoint must batch `KidProgress`/`KidTestAttempt` per student (one
  IN query), not per-lesson lookups.

## 6. File touch map

**Backend:** `controllers/kidsSeries.js` (path endpoint, reuse lock gate), `controllers/kids.js`
(band ceiling), `controllers/kidsGoals.js` (new), `models/KidLearningGoal.js` (new),
`models/index.js` (boot reconcile), `routes/kids.js` (2 routes), `test/b3-learning-path.test.js`
(new).
**Frontend:** `components/LearningPath.tsx` (new), `components/GoalCard.tsx` (new),
`pages/Student/StudentHome.tsx`, `lib/api/endpoints.ts`, `lib/i18n/en.ts` + `ha.json`, vitest.
**Docs:** `docs/teacher-game-maker-guide.md` (path & goals section), this spec.

---

## Acceptance checklist (all = ✅)

- [ ] "All Games" tab replaced by **Learning Path** as default student view
- [ ] Path = series → units (phases) → lessons with **visual halting points/targets**
- [ ] **Age isolation hard server-side**: Year 3 never receives Year 4 games; Year 4 sees
      Year 3 only as passed/spill-over levels, may go back & pass
- [ ] Weekly goal: auto-default 1/week, child- or teacher-set, progress from real play, rollover
- [ ] Series rule holds: each unit = one topic; final story unit may connect the series
- [ ] Full suite at baseline fail-set; regression 25/25; vitest green; live smoke passed