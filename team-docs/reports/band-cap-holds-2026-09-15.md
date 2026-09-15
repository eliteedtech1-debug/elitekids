# The server-side band cap now holds — second pass on Q59/Q67

**Date:** 2026-09-15 · **Worker:** Buffy · **Status: FIXED, NOT DEPLOYED**
**Supersedes:** nothing — Q67 fixed the *mass* failure; this closes what it left.

**Brief:** *"Make the server-side band cap hold so `visibleLevels()` actually narrows
`/kids/lessons`."*

---

## 1. Where it stood before this pass

Q67 (`8b35aa5`, deployed) fixed the reason **every** real-school child failed to resolve a
band: `models/Student.js` never declared `class_name`. After it, 6009 of 6649 children
resolve a band and are capped correctly.

**647 of 6649 (9.7%) still resolved NOTHING** — and the listing did not merely fail to
narrow them, it **widened** them:

```js
childBand = admission ? await resolveBandForAdmission(admission) : null;
if (childBand) {                       // ← no band ⇒ NO ceiling at all
  const levels = visibleLevels(childBand);
  if (levels) where.age_level = { [Op.in]: levels };
}
```

Measured against the live DB (`team-docs/tools/probe-band-ceiling-coverage.mjs`, read-only):
those children received **all 1718 lessons across all six bands**, silently — which is the
exact inverse of what the ceiling exists for, and of `ageBand.js`'s own documented risk rule:

> *"Risk rule (TECH-SPEC-LEARNING-PATH §5): when class mapping is ambiguous, fall back to the
> NARROWEST known rank — never widen."*

## 2. Two real causes, and one policy hole

| # | Cause | Evidence |
|---|---|---|
| 1 | **The class row's `section` was never passed to `classToAgeLevel`.** Real schools name classes decoratively ('Umar bin Khaddab', 'TAMHEED B', 'Abdurrahman bin Auf'). Those names carry no pedagogical signal at all — the *section* is the signal — and `classToAgeLevel(name, section)` documents a fallback for precisely them. The resolver called `classToAgeLevel(student.class_name)` with no section, so that fallback was **dead code on the resolver path**. `students.current_class` holds a synthetic `CLS####` code (Q67) that the normalizer deliberately strips, so nothing else could rescue them. | 640 children; the section-aware remap recovers every one |
| 2 | **Age-word room names** — 'Just 2s', '3s room', 'Twos'. No rule matched them. | 7 children |
| 3 | **Policy:** an unreadable identity widened to all six bands instead of narrowing. | the code above |

## 3. Fixes

1. `services/ageBand.js#lookupClassRow` — resolves the child's class row from the shared DB
   (`class_code`/`class_name` → `class_name`, `section`), and `resolveBandForAdmission` now
   carries its `section` into `classToAgeLevel`. Returns `null` (never throws) when the table
   or row is absent, so an older mirror schema degrades to the previous behaviour.
2. `classToAgeLevel` — an **age-word rule**, anchored to the *whole* name and placed after
   every keyword rule so it cannot hijack real vocabulary ('Nursery 2s', 'Primary 3s' are
   matched by their own rules first), mapped through the existing `ageToBand` so it cannot
   introduce a second, disagreeing ladder.
3. `kids.js` — **fails closed to the narrowest rank** (`AGE_BANDS[0]` = Crèche) when no band
   resolves, instead of skipping the ceiling. Age isolation holds, the dashboard is non-empty
   (the youngest band carries 272 published lessons), so the never-empty rule stays satisfied.
   The `console.warn` is kept and now names the band it applied.

`test/helpers/test-db.js` gained a `classes` table (shared DB): the app now reads it, so the
hermetic schema has to carry it.

## 4. Verification

**Live, read-only, against the production DB** (`tools/verify-band-resolution-live.mjs`, paced
at 20 ms/admission, every query a SELECT):

```
identities: 6649 | resolved before the fix: 6009 | UNRESOLVED before: 640
resolved NOW by the shipped resolver: 640 of 640
   Primary 639 · Nursery 1 1
still unresolved: 0
```

(The 7 'Just 2s' children don't appear in this list because the script's "before" pass runs the
*shipped* pure helper, which already carries the new age-word rule — 640 + 7 = the 647 measured
pre-fix. Both halves are covered.)

So in the live data the **fail-closed policy is a safety net, not the mechanism**: every child
now resolves a real band.

**Tests** — `test/band-ceiling-sms-students.test.js`, 11 tests. Three mutations, each of which
must be caught:

| mutation | result |
|---|---|
| fail-closed policy reverted (`childBand \|\| AGE_BANDS[5]`, i.e. widen to everything) | ✕ *"an unresolvable identity is capped to the narrowest band"* |
| section-aware class-row lookup removed | ✕ 2 tests (resolver **and** the endpoint narrowing) |
| age-word rule disabled | ✕ *"maps AGE-WORD room names"* |

Files verified byte-identical to their backups after the mutation sweep.
**Full gate: 67/67 suites · 778/778 tests, exit 0** (was 772).

**Never-empty widening — measured unreachable, retained, now tested.** `visibleLevels()`
admits ≥272 lessons for every band in this catalog (Crèche 272 → Primary 1718), so the
widening door cannot fire for a *resolved* band. It is a deliberate product rule, so the test
now deletes the ceiling's content explicitly to exercise it rather than relying on a band
happening to be empty.

## 5. Flagged, not changed

- **`/kids/learning-path` still isolates** for a truly unresolvable child (empty path → 400),
  while `/kids/lessons` now caps to Crèche. Both are deliberate (the path refuses to invent a
  journey; the listing refuses to blank a dashboard) and the two now agree for every child in
  the live data, since nothing is unresolvable. Recorded so the divergence is a decision, not a
  surprise.
- **NOT DEPLOYED.** `git push origin main` is the deploy and needs an explicit order. Live is
  still `20260915T154251Z-8b35aa5`, where the 647 remain uncapped.

## 6. Reproduction

```bash
node team-docs/tools/probe-band-ceiling-coverage.mjs    # who resolves nothing; §1, §2
node team-docs/tools/verify-band-resolution-live.mjs    # before/after against prod; §4
bash scripts/run-tests.sh test/band-ceiling-sms-students.test.js --forceExit
```

All read-only (SELECTs only; the live sweep is paced at 20 ms/admission). The scripts live in
`team-docs/tools/`, which `.gitignore:29` excludes by policy, so the numbers they produced are
quoted inline above.
