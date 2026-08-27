# E5 Brief — Competition Engine (Tug-of-War groups + Individual Tournaments)

Context: EliteKids platform (/var/www/html/elite-kids). Supervisor vision: intra-class competition that makes learning fun. TWO modes sharing one engine:
(a) GROUP TUG-OF-WAR — class splits into 2 teams; every game-complete pulls the rope toward the scoring team; rope meter visible to kids; teaches group participation.
(b) INDIVIDUAL TOURNAMENTS — teacher-created competitions where each child's score is their own; final standings award 1st/2nd/3rd (podium) into existing `kids_badges`.
Builds on EXISTING rails: recordGameComplete→recordAttemptPoints hook chain, kids_weekly_points, kids_badges, Trophy Board tab (StudentLeaderboardPanel), FB-17 privacy rules (first name + last initial only).
Execution: autonomous agent works STEPS in order on the VPS; after every STEP append `[CHECKPOINT HH:MMZ] <done>` to `team-docs/reports/e5-progress.md`.

## STEPS

1. **STEP 1 — Schema (additive, elite_content via db.content).**
   `kids_tug_matches` (id PK, school_id, class_code, title VARCHAR(120), subject_code VARCHAR(50) NULL filter, start_at DATETIME, end_at DATETIME, swing_cap INT DEFAULT 500, status ENUM('draft','active','ended') DEFAULT 'draft', winner_team CHAR(1) NULL).
   `kids_tug_members` (id PK, match_id, child_admission_no, team CHAR(1) ENUM('A','B'), UNIQUE(match_id, child_admission_no)).
   `kids_tug_events` (id PK BIGINT, match_id, child_admission_no, team CHAR(1), points INT, created_at, idx match_id/created_at).
   `kids_tournaments` (id PK, school_id, class_code, title VARCHAR(120), type ENUM('individual','trophy'), subject_code NULL, start_at, end_at, status ENUM('draft','active','ended'), podium_json NULL).
   CHECKPOINT appended.

2. **STEP 2 — Rope math service (backend/src/controllers/kidsCompetition.js NEW).**
   ropePct(match) = clamp(50 + (ptsA − ptsB) / (2×swing_cap) × 100, 0, 100) from SUM(kids_tug_events).
   RUBBER BAND (anti-blowout, keep weak kids in the game): while a team trails, its earned points post ×1.15 (round). Document constant in code header.
   Team assignment on first game-complete during an ACTIVE match: auto-balance (alternate, or balance by trailing weekly avg points). Rotation encouraged by UI copy ("new match = new teams").
   CHECKPOINT appended.

3. **STEP 3 — Hook into scoring pipeline.**
   In recordAttemptPoints success path add fire-and-forget tugHook(child, class_code, pts): find active match for class → member lookup → INSERT kids_tug_events (with rubber-band applied) → update cached rope if cheap. MUST never throw into the main flow (same shape-proof pattern as P3 fix — no naked nested destructures).
   CHECKPOINT appended.

4. **STEP 4 — APIs.**
   Student: GET /kids/competition/state (auth student) → {my_team, rope_pct, my_match_contribution, active_tournament:{title, my_rank, my_points}, ends_at}. Privacy-sanitized.
   Staff: POST /kids/tug-matches (create+auto-start optional), POST /kids/tug-matches/:id/end (computes winner_team), POST /kids/tournaments, GET /kids/tournaments?class_code=.
   Tournament end job (lazy rollover pattern like awardTop3IfNeeded): compute standings over window from kids_progress scores (same quality math family as leaderboard), write podium_json {first,second,third} + mint badges into kids_badges 🥇🥈🥉 with tournament title.
   CHECKPOINT appended.

5. **STEP 5 — Frontend.**
   StudentHome: 🪢 "Class Tug-of-War" card when active — animated rope meter (two team flags/mascots, % position from API, poll 30s), "Your pull: +N pts for Red!" toast after each submit (mirror of +pts toast). Trophy Board tab += Tournaments section: active banner + ended podiums w/ medals.
   Staff panel: create/manage matches & tournaments (type toggle individual|trophy, duration presets 1d/1w/custom, subject filter optional).
   tsc clean; vite build rc=0. Backups .bak-e5.
   CHECKPOINT appended.

6. **STEP 6 — Tests + smoke.**
   Jest: rope math unit cases (even, blowout clamp, rubber band flips leader within cap); event insert on complete; end-match winner; tournament podium minting idempotent (re-run no dupes); cross-school 403. Zero NEW failures vs baseline.
   Extend /tmp/e3-smoke phone harness: kid plays → rope moves → state endpoint reflects team. Report → team-docs/reports/e5-report.md.
   CHECKPOINT appended.

## FREEBUFF TASKS (C7 — docs/QA/content ONLY)
- QA checklist: teacher creates match mid-week → two kids play on opposite teams → rope moves correctly → end → winner banner.
- Copy pass: match titles, empty-state ("No tug happening yet — ask your teacher!"), rubber-band explainer for teachers ("trailing team gets a little wind behind them").
- Teacher guide section: when to use group vs individual mode (group participation vs personal responsibility).
- Mascot/name suggestion list for team pickers (kid-safe, Nigerian-flavored).

## GATES
- All tables exist w/ exact names; unauth endpoints 401; student endpoints class-scoped (no other school's rope visible).
- Rope math unit suite green; zero new jest failures; build ✓ restart ✓ /health ok.
- No admission_no in any competition response payload (grep proof in report).

## RULES
- Work only under /var/www/html/elite-kids. Never print secrets/tokens/.env values. No git commit/push. Additive-only schema.
- Fire-and-forget hooks must NEVER break game-complete (wrap try/catch + err.stack log).
- If any gate fails twice, STOP → team-docs/reports/e5-obstacles.md.
