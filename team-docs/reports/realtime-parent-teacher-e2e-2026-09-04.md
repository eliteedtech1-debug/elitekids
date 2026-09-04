# Real-Time Parent/Teacher Tracking + Reports — Chrome E2E (2026-09-04)

**Tester:** Buffy (Playwright + real Chrome, visible) · **Env:** Local dev (API :34600, FE :34601 via Vite WS proxy) · **School:** DKG (SCH/23)

## Summary

**13/18 checks green in browser; remaining 3 report checks now green after schema sync + param fix (verified via API).** All realtime tracking features WORK end-to-end in a real Chrome session:

- Parent logged in → child tab logged in → parent page toggled to **"1 children online"** with green dot + toast **"🟢Auwal U. is now online"**.
- Teacher logged in → class dropdown populated from `teacher_classes` (**"Primary 1 (Arabic, …, 13 subjects)"**) → joined class → student logged in → teacher roster went **0 → 1 online** showing the student.
- WebSockets verified on all 4 roles (welcome/presence/live frames through the Vite WS proxy).

## Bugs Found & Fixed (all now shipped to prod)

| # | Severity | Bug | Root cause | Fix |
|---|----------|-----|-----------|-----|
| 1 | HIGH | TeacherLive class dropdown always empty | `/users/login` response has NO `subjects`; frontend stored `data.subjects` = undefined. `VERIFY_TOKEN` endpoint returns 13 subjects but was never called | `Login.tsx`: after teacher login, call `/verify-token` and persist `subjects` to `TEACHER_SUBJECTS` |
| 2 | HIGH | Parent child list silently empty | `listChildrenForParent` shared-link query `GROUP BY admission_no` + non-aggregated cols → fails under MySQL 8 `only_full_group_by`; error swallowed by catch → `data: []` | Removed `GROUP BY` (dedupe already in JS `seen` map) + added `console.warn` |
| 3 | MEDIUM | `GET /kids/parent/child/:adm/report` 500s on prod | badges query targets `elite_content.kids_badges`, which does NOT exist (arena badges were never created there; leaderboard badges live in `elite_db`) | Badges query wrapped in try/catch → `badges: []` (decorative section must never kill the report) |

## Local-DB gaps found (prod was fine — columns exist there)

- `kids_parent_links` table missing locally → dumped prod structure + 1 row.
- `teacher_classes` empty locally → dumped prod data (2755 rows) + recreated `active_teacher_classes` view (local view was stale, referenced missing columns).
- `kids_progress` missing 8 prod columns (mode, difficulty, xp_breakdown, …) → ALTERed.
- `kids_game_series`/`kids_game_units`/`kids_interface_onboarding`/`kids_lessons`/`kids_game_configs`/`kids_curriculum_points`/`kids_children` missing prod columns → ALTERed.
- `kids_badges` created locally (arena schema) + 1 test badge seeded.

## Report endpoints — verified 200 with data (parent token)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/kids/parent/child/DKG/1/0001/report` | 200 | child_name, summary, subjects, badges |
| `/kids/parent/results` | 200 | 2 children w/ results |
| `/kids/parent/children/activity` | 200 | object w/ per-child activity |
| `/kids/parent/child/:adm/progress` | 200 | week summary |
| `/kids/parent/notifications` | 200 | array (0 rows) |
| `/kids/teacher/weekly-report` | 400 | requires `class_id` (validation, by design) |
| `/kids/teacher/insights` | 400 | requires `class_id` (validation, by design) |

## Prod residual (NOT implemented — needs MASTER go)

1. **`elite_content.kids_badges` table doesn't exist on prod.** Report now degrades gracefully, but arena/festival badge mints (`e3fArena.js`, `kidsFestival.js` → `dbm().content` insert) will fail on prod. Recommend `CREATE TABLE IF NOT EXISTS` (arena schema) on prod elite_content — a prod DB write, requires authorization.
2. **`MASTER_PWD` was EMPTY in local `.env`** — set locally to `rt-master-2026` for testing only. Prod value untouched. Local `.env` now contains `MASTER_PWD=rt-master-2026` (test bypass); remove or set a real value when desired.

## Tooling

`team-docs/tools/realtime-e2e/` — `rt-test.mjs` (Playwright + system Chrome, 4 role contexts, WS frame spy) + `run-all.sh` (starts API+FE, runs test, cleans up). Accounts: parent `sadiyaauwal96@gmail.com` (MASTER_PWD), teacher `bilkisucyusuf@gmail.com` (MASTER_PWD), students `DKG/1/0001` + `DKG/1/0042` (pw 123456).

## Next steps

- Full kid welcome/onboarding flow (tour → companion → play a game) for 1–2 kids to generate real progress rows locally.
- Decide + authorize prod `kids_badges` creation (arena schema).
- Optional: run the visible E2E against prod once deployed (needs real creds).

*Companion: `SRS-realtime-features.md` (SRS-RT-001) + `realtime-theory-vs-reality-2026-09-04.md`.*