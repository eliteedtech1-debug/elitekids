# Q67 — the G6 age ceiling never applied to real-school children (fixed 2026-09-15)

**Status: FIXED, committed locally, NOT DEPLOYED.**
Files: `backend/src/models/Student.js`, `backend/src/controllers/kids.js`,
`backend/test/band-ceiling-sms-students.test.js`.
Supersedes the diagnosis recorded in Q59 (which was wrong — see §6).

---

## 1. What was reported, and what it actually was

Q59 was filed from the 09-15 live band walks: `GET /kids/lessons` returned the
**full 1718-row catalog** to admissions `004` @ SCH/28 and `109` @ SCH/11, while
it correctly capped the flagship child `Demo5` at 1085. The client ceiling
(`learningPath.ts`) was therefore the only thing keeping Primary/Kindergarten
content out of a Nursery 2 child's Play tab.

The written diagnosis in Q59 was: *"their `students.class_name` is empty… a
never-empty fallback meeting a class that resolves to nothing… **a data problem
before it is a server bug**."*

**That was wrong, and it is now disproved with data.** `elite_db.students`
really holds:

| admission | school | class_name | current_class | class_code |
|---|---|---|---|---|
| `004` | SCH/28 | **Nursery 2** | `CLS0876` | `CLS0876` |
| `109` | SCH/11 | **Kindergarten** | `CLS0218` | `CLS0218` |
| `Demo5` | SCH/25 | **Nursery 1** | `CLS0780` | `null` |

```
students total: 6649
students with empty class_name: 0
```

The data was always fine. Nothing needed "fixing" in those two rows.

## 2. Root cause

`backend/src/models/Student.js` — the READ-ONLY mirror of the shared
`elite_db.students` — declared **7 attributes, and `class_name` was not among
them**:

```js
class_code: { type: DataTypes.STRING(50), allowNull: true },   // ← declared
// class_name / current_class were never declared
```

Sequelize selects only declared attributes, so inside
`ageBand.resolveBandForAdmission` the chain read:

1. `student.class_name` → **`undefined`** (not null — the column wasn't selected)
2. `student.current_class` → `undefined`
3. `student.class_code` = `'CLS0876'` → `classToAgeLevel` **deliberately strips**
   synthetic `CLS####` codes (they are mirror keys, not class names) → `null`
4. no `kids_children` row (SMS-imported child) → `null`
5. no tour declaration → return **`null`**

Then in `kids.js`:

```js
childBand = admission ? await resolveBandForAdmission(admission) : null;
if (childBand) {                       // ← no band = NO CEILING AT ALL
  const levels = visibleLevels(childBand);
  if (levels) where.age_level = { [Op.in]: levels };
}
```

No band ⇒ the `age_level` filter was never added ⇒ **all six bands**. So for
every child of a real school, the server-side ceiling was decorative.

`visibleLevels()` itself was never wrong; `age_level` in `kids_lessons` stores
exactly the six NERDC labels it returns (verified: Crèche 272 · Playgroup 270 ·
Nursery 1 272 · Nursery 2 271 · Kindergarten 271 · Primary 362 = 1718), so the
NRDEC-vs-legacy vocabulary mismatch I suspected was **not** a factor.

## 3. Why every existing test missed it

- `ageBand.test.js` exercises only the **pure** helpers (`classToAgeLevel`,
  `visibleLevels`, `resolveChildBand`, `ageToBand`) — never the async DB chain.
- `b3b-age-declaration.test.js` enters the chain, but with a fixture whose
  `class_name` is intentionally **unmappable** (`'PLANET X'`) and whose
  assertion is that the band is `null`. A fixture built to prove *no* band
  resolves can never notice that a *valid* class_name resolves to nothing.
- No suite asserted that `GET /kids/lessons` narrows at all.

The unit under test was always "given a band, is the visible set right?" —
never "does a real school child produce a band?".

## 4. The fix

1. **`models/Student.js`** — declare `class_name` and `current_class`.
   SELECT-widening only; the model is never written to
   (`sync: { force: false, alter: false }`).
2. **`controllers/kids.js`** — the un-capped branch now logs a `console.warn`
   naming the admission. The failure was previously **completely silent**
   (nothing in the server log during the live probe), which is how it survived
   unnoticed. Behaviour is unchanged (the never-empty product rule still owns
   that branch); only observability was added.

## 5. Evidence

### Real data, before → after (read-only queries against production)

| admission | band before | band after | serves before | serves after | expected |
|---|---|---|---|---|---|
| `004` | *none* | **Nursery 2** | 1718 | **1085** | 272+270+272+271 = 1085 ✅ |
| `109` | *none* | **Kindergarten** | 1718 | **1356** | 1085+271 = 1356 ✅ |
| `Demo5` | Nursery 2 *(declaration)* | **Nursery 1** *(class)* | 1085 | **814** | 272+270+272 = 814 ✅ |
| `EK-Q4-TEST-001` | Primary | Primary | 1718 | 1718 | top band, nothing filtered ✅ |

`Demo5` is the one **behaviour change**: its tour declaration (age 5) said
Nursery 2, but its school class is Nursery 1, and the class mapping outranks the
declaration **by explicit design** ("The class mapping (step 2) deliberately
outranks the tour declaration"). So it correctly narrows 1085 → 814.

### Tests

New suite `test/band-ceiling-sms-students.test.js` — 5 tests, hermetic
(`elite_db_test` / `elite_kids_test`), fixture is an SMS-school child
(no `kids_children` row, `class_name 'Nursery 2 A'`, `class_code 'CLS0876'`):

- resolver reads `class_name` → `Nursery 2` / `Primary` / `Crèche`
- arm suffix (`'Nursery 2 A'`) maps instead of failing
- a Nursery 2 child **does not receive** the Kindergarten or Primary lessons
- a Primary child is **not** over-filtered (top band)
- the never-empty widening door still works for a band with no content

**Mutation check** — reverting `Student.js` alone:
```
✕ resolveBandForAdmission reads students.class_name (the model must declare it)
✓ strips the arm/stream suffix rather than failing on it
✕ a Nursery 2 school child gets at-or-below-band lessons only
✓ a Primary child is not over-filtered (top band sees the whole catalog)
✓ keeps the never-empty widening door for a band with no content
```
The two failures are exactly the defect: no band, and Kindergarten/Primary
leaking to a Nursery 2 child.

**Full gate:** 67/67 suites, **767/767 tests** (was 66 / 762).

## 6. Corrections carried forward

- Q59's mechanism ("empty `class_name` … a data problem before it is a server
  bug") is **wrong** and is corrected in `QUEUE.md`. Do not act on the old text.
- **Prod `students.current_class` holds the class CODE** (`'CLS0876'`), not a
  class name — so the resolver's documented `current_class` compatibility
  fallback is inert against this data. Harmless, but it is not a real fallback.
- Still open and **not** addressed here: admissions `004`/`109` were also
  getting **no learning path at all** before this fix (the `student.class_name`
  side of Q66's 400). Both should now resolve a real band and therefore render
  the subject-sectioned PLAY.

## 7. Not done / next

- **Not deployed.** `git push origin main` is the deploy and needs an explicit
  order.
- No live walk after deploy. Once shipped, `004` (Nursery 2) and `109`
  (Kindergarten) become genuine **real-school mid-band children** for the
  subject-sectioned PLAY walk — the coverage gap from the earlier PLAY report
  (a Primary child validates nothing about the ceiling).
- The never-empty widening (capped query empties ⇒ drop the ceiling ⇒ full
  catalog) remains **by design** and is now asserted rather than accidental.
