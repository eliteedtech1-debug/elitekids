# FREEBUFF TASK-2 — read-only audit: convert math + staff-gating on new endpoints

You are the standing review/verification arm. READ-ONLY (C7): do NOT edit app code.
Write findings to `team-docs/reports/fb-fix-convert-audit.md`.

Scope (all in backend/src/):

1. **Conversion math — controllers/kidsModeLock.js `convertTestScores`**
   - Input contract: lesson_ids[] (1..N games), class TEST lock context, ca_setup.max_score.
   - Verify: raw scores sum / denomSum scaled to max_score; expected 40/60 -> 10/15 mapping correct for N>1 and N=1; zero-denominator guard; rounding behavior; duplicate lesson_ids; lessons from another school/subject rejected?
   - Cross-check weekly_scores rows written (draft state) against elite_db schema expectations.

2. **Staff-gating audit — every NEW FB route in routes/kids.js**
   - POST /kids/test-scores/convert
   - POST /kids/series/:id/domesticate
   - GET  /kids/series-domestications
   - GET  /kids/lessons/:id/next-up
   - GET  /kids/leaderboard, GET /kids/leaderboard/me, GET /kids/badges (kidsLeaderboard.js)
   For each: middleware chain present? handler-level re-checks consistent? student/parent correctly blocked or scoped? staff required where data is cross-child? Privacy rules: no admission_no, class-scope only, leaderboard sanitization (first name + last initial, hashed avatar) actually enforced in code paths.

3. **Leaderboard integrity (controllers/kidsLeaderboard.js)**
   - recordAttemptPoints hook: fire-and-forget failure containment (can it crash recordGameComplete?), diminishing-returns math, quality cap <=10.
   - awardTop3IfNeeded rollover: double-award guards (concurrent calls), week-boundary correctness, free_access_until set to week_end.

Output format: verdict per area (PASS / GAP / FAIL), file:line evidence, minimal suggested fixes as diff-style snippets (do not apply).
