# `/kids/learning-path` 500s for SMS-imported children — found live, fixed

**Date:** 2026-09-15
**Found by:** the live PLAY walk (trying to reach a mid-band child, which is the one band the
first walk did not cover).

## Symptom

Probing children on record, read-only, against the live API:

| admission | result |
|---|---|
| `004` @ SCH/28 | `400 Could not resolve the child's age band (class/age_level missing)` |
| `109` @ SCH/11 | `400 Could not resolve the child's age band (class/age_level missing)` |
| `Demo5` @ SCH/25 | **`500 Server error`** |
| `EK-Q4-TEST-001` @ SCH-ELITE | 200 — 51 series, band Primary (this is the child the first walk used) |

Server log for the 500:

```
getLearningPath error: Cannot read properties of null (reading 'class_code')
```

## Root cause

`getLearningPath` (`backend/src/controllers/kidsSeries.js`) builds its response with

```js
student: { age_band: band, class_name: child.class_code || null },
```

`child` comes from `computeLearningPath`, which looks it up with
`db.KidChild.findOne({ where: { admission_no } })`. **SMS-imported children have no
`kids_children` row**, so `child` is `null` — and `computeLearningPath` was already fixed to cope
with that for BAND resolution (its own comment records the earlier "games no longer showing"
report). The response builder was missed, so any child whose band resolves from the **tour
declaration** (step 3 of `resolveBandForAdmission`) rather than from a local profile reached the
dereference and 500'd.

`student.class_name` is informational only — `grep` over `frontend/src` finds no consumer — so
the guard is complete, not a partial fix.

**Why it never failed the gate:** `test/b3b-age-declaration.test.js` has a fixture that is exactly
this child (`ADM = 'B3B-IMPORTED'`, commented *"SMS-imported kid: students row, NO kids_children
row"*), but its learning-path assertion called `resolveBandForAdmission(ADM)` **directly** and
never issued the HTTP request. Resolving a band is not the same as the endpoint working.

## Fix

- `backend/src/controllers/kidsSeries.js` — `child?.class_code || null`, with the reason inline.
- `backend/test/b3b-age-declaration.test.js` — new test
  `GET /kids/learning-path answers 200 for a child with no kids_children row`, which issues the
  actual request against the existing fixture and asserts 200 + `class_name === null`.

**Verified:** suite 6/6; full gate **66/66 suites · 762/762 tests**.
**Mutation-checked:** reverting `child?.` to `child.` makes the new test fail
(`✕ GET /kids/learning-path answers 200 for a child with no kids_children row`, 1 failed);
restoring it passes. The test catches the bug — it is not decoration.

## What this does and does not explain

- **Explains** why the first PLAY walk could only ever have been done on `EK-Q4-TEST-001`: every
  other child on record fails to get a path at all, so PLAY degrades to a single flat group
  (no subject sections, no locks, no jump-ahead offers). The subject-sectioned PLAY is only
  reachable by a child whose path resolves.
- **Does not fix** `004` / `109`. They 400 because their `students.class_name` is empty, so no
  band resolves at all — a **data** problem, not a code one. `resolveBandForAdmission` correctly
  isolates by default rather than guessing.
- **Precisely explains Q59.** With no resolvable band, `filterInBand` deliberately does not filter
  (the never-blank-PLAY rule), so those children receive all 1718 rows and the client shows every
  band's content. The "client ceiling is the only defence" risk in Q59 is this interaction: a
  never-empty fallback meeting an unresolvable class. It is not a server cap that is broken so much
  as a class that resolves to nothing.

## Not deployed

Committed but **not pushed** — a push is a production deploy and needs an explicit order
(`AGENTS.md`). The 500s continue until it ships.
