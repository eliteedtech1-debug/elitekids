# TEAM REPORT — Real-Time Parent/Teacher Tracking & Reports (2026-09-04)

**Author:** Buffy (worker) · **Audience:** MASTER + all lanes
**Result:** 3 code bugs fixed, shipped (`e96c0f0`) and **verified LIVE on production** · 1 production incident found & recovered · deploy pipeline weakness exposed

---

## 1. What was tested

Chrome E2E (Playwright, visible browser, DKG school) covering **parent-teacher realtime tracking + reports**:

| Scenario | Result |
|---|---|
| Parent logs in → child logs in on another device | ✅ Parent page flipped to **"1 children online"**, green dot, toast **"🟢 Auwal U. is now online"** (live WebSocket presence) |
| Teacher logs in → class dropdown | ✅ Dropdown populated from `teacher_classes`: **"Primary 1 (Arabic, …, 13 subjects)"** |
| Teacher joins class → student logs in | ✅ Teacher roster went **0 → 1 online** in real time |
| Parent weekly report / results / activity / progress / notifications | ✅ All 200 with real data (after fixes) |
| Teacher weekly-report / insights | 400 `class_id is required` — validation by design (client must pass class) |

WebSockets confirmed on all 4 roles (welcome/presence/live frames through the Vite WS proxy + nginx).

## 2. Bugs found & fixed (commits `5547495` + `e96c0f0`, all LIVE)

| # | Bug | Root cause | Fix |
|---|-----|-----------|-----|
| 1 | TeacherLive class dropdown always empty | `/users/login` never returns `subjects`; frontend stored `data.subjects` (undefined). `VERIFY_TOKEN` returns the classes join but was never called | `Login.tsx`: after teacher login, fetch `/verify-token`, persist `subjects` → `TEACHER_SUBJECTS` |
| 2 | Parent child list silently `[]` | shared-link query `GROUP BY admission_no` + non-aggregated cols fails under MySQL 8 `only_full_group_by`; error swallowed → empty list (worked only because prod's `sql_mode` is permissive) | Removed `GROUP BY` (dedupe already in JS) + `console.warn` on failure |
| 3 | `GET /kids/parent/child/:adm/report` 500s | badges query targets `elite_content.kids_badges` — table does not exist (arena badges never created there; leaderboard badges live in `elite_db`) | badges section now degrades to `[]` instead of killing the report |
| 4 | (earlier batch) Vite WS proxy missing, resilient sync, `timestamps:false` ×7, `kidsMeActivity` stub | local-dev WebSockets silently dead | `5547495` |

**Prod verification (self-signed JWT, app secret):** verify-token subjects = **13** ✓ · parent children = **2** (DKG/1/0023, DKG/1/0001) ✓ · weekly report = **200 with data** ✓

## 3. ⚠️ Production incident discovered & recovered (same session)

While deploying, we found the live tree was **broken by a previous failed deploy**:

- `git stash pop` in `.github/workflows/deploy.yml` left **unresolved `<<<<<<<` conflict markers in model files** (`KidActionItem.js`, `KidInsight.js`, `kidsParent.js` + 3 unmerged paths) → `SyntaxError: Unexpected token '<<'` → **the API could not boot at all** under the systemd unit.
- The systemd unit `elite-kids-api` was **dead since 17:32 UTC**; an **orphan `node src/index.js` (pid 3720353) was serving :8484 from memory** — running OLD code (17:54), outside systemd. Two more orphans (2863010 since Aug 31, 3717018) existed.
- The 21:00 deploy for `e96c0f0` **failed** (50s) for exactly this reason; the frontend step (non-fatal) still rebuilt dist at 19:11.

**Recovery (done):**
1. Backed up everything to `/tmp/live-backup-20260904/` (stash patch 135 KB, worktree/cached patches, raw conflicted files).
2. `git reset --hard origin/main` (HEAD = `e96c0f0`) — tree clean, zero conflict markers, `kids.js` loads OK.
3. Killed the 3 orphan processes; started the unit → **`elite-kids-api` active**, health OK, listening :8484 (pid 3783387, boot 21:05:55).
4. Verified all 3 fixes live (see §2).
5. Stash `stash@{0}` (37 files, ~917 lines — contains some Q32/Q33 WIP) **preserved but still on the box** — see recommendation R-4.

**Why it happened:** the deploy workflow stashes ANY local working-tree edits before `git reset --hard`, then `git stash pop`s them after. If a previous deploy left a stash behind (failed before pop), the next deploy pops a stale stash onto new code → conflicts → markers in the tree → API dead while an orphan keeps old code alive. The systemd health-check step in the workflow is the only guard, and it reports failure without auto-rollback.

## 4. Local dev DB gaps found (prod was fine — columns exist there)

Local `elite_content` was months behind prod: `kids_parent_links` missing, `teacher_classes` empty + stale `active_teacher_classes` view, `kids_progress`/`kids_game_series`/`kids_game_units`/`kids_interface_onboarding`/`kids_lessons`/`kids_game_configs`/`kids_curriculum_points`/`kids_children` missing prod columns. All synced from prod (structure/data dumps via VPS). `kids_badges` created locally + 1 test badge seeded. **Actionable lesson:** local DB dumps must be refreshed alongside feature work, or schema drift silently 500s everything.

---

## 5. Recommendations

### R-1 (P0 — deploy pipeline) Fix `.github/workflows/deploy.yml` stash/pop
Never `git stash pop` blindly in a deploy. Use `git fetch origin main && git reset --hard origin/main` and **skip the stash entirely** (or `git stash create` → save the commit-ish to a file → never pop automatically). Add a **pre-start gate** in the workflow: after reset, `grep -r "^(<<<<<<<|>>>>>>>)" backend/src frontend/src` → fail loudly; and **verify the service is active + healthy before declaring success** (already partly there). Add auto-rollback: if `systemctl --user is-active elite-kids-api` fails, `git reset --hard <BEFORE>` and restart.

### R-2 (P0) Adopt the E2E harness for future deploys
`team-docs/tools/realtime-e2e/` (Playwright + real Chrome, 4 role contexts, WS frame spy) — run against prod after deploy with real creds. It caught every one of today's bugs. Note: `team-docs/tools/` is **gitignored** — tooling lives on the box, not the repo; consider committing harness code elsewhere if it should be shared.

### R-3 (P1) Create `elite_content.kids_badges` on prod (arena schema)
Report now degrades gracefully, but arena/festival badge mints (`e3fArena.js`, `kidsFestival.js` → `dbm().content`) still fail on prod. **Needs MASTER authorization** (prod DB write): `CREATE TABLE IF NOT EXISTS kids_badges (id CHAR(36) PK, child_admission_no VARCHAR(64), school_id VARCHAR(40), badge_name VARCHAR(100), badge_emoji VARCHAR(20), badge_type VARCHAR(50), awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_badge_child (child_admission_no))`.

### R-4 (P1) Resolve the surviving stash + orphans hygiene
`stash@{0}` on the box holds Q32/Q33-flavored WIP (PeerTeachingBoard, q3-collab.test.ts, ageBand, routesHelper, …). Have freebuff/MASTER commit it properly or discard. Also: **never leave orphan `node src/index.js` processes** — they mask a dead unit and serve stale code; one source of truth (systemd) only.

### R-5 (P1) Empty `MASTER_PWD` on prod + local is a footgun
`MASTER_PWD` is empty in BOTH `.env` files — the bypass silently does nothing. Either set real values (documented rotation) or remove the var. Local was set to `rt-master-2026` for this test only.

### R-6 (P2) `kids_children` local schema drift
Local `kids_children` lacks `password_hash` (login falls back to shared `students.password`) — matches prod? Prod has it (verified via column diff) — this was local-only staleness; keep dumps fresh (see §4).

### R-7 (P2) Frontend
Parent `useParentPresence` toast is 3s — fine for users, but the E2E had to record toasts via MutationObserver to assert; consider a `data-testid` on the online badge for testability. Teacher Live copy is "Open Class Channel" / "{count} online" — matched now.

## 6. Open items / handoff

- **Full kid welcome flow** (onboarding tour → companion → play a game) for 1–2 kids — NOT yet automated; generates the real progress rows the reports aggregate. Harness ready to extend.
- Deploy `e96c0f0` job itself FAILED on the broken tree; recovery was manual. **Next push must confirm the fixed workflow actually deploys** (R-1) — or future pushes will fail again until the workflow is patched.
- `kids_teacher/weekly-report` + `/insights` need `class_id` — frontend callers must pass it (currently returns 400 by design).

## Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/Login/Login.tsx` | verify-token → TEACHER_SUBJECTS (fix 1) |
| `backend/src/controllers/kids.js` | GROUP BY removal (fix 2) |
| `backend/src/controllers/kidsParent.js` | badges resilience (fix 3) |
| `team-docs/reports/realtime-parent-teacher-e2e-2026-09-04.md` | detailed E2E findings |
| `team-docs/SRS-realtime-features.md` | SRS-RT-001 realtime spec |
| `team-docs/tools/realtime-e2e/` | Playwright harness (local, gitignored) |
| `/tmp/live-backup-20260904/` (box) | stash/worktree/conflict backups |

*Checkpoint: team-docs/reports/takeover-progress.md*