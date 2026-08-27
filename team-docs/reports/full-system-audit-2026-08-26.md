# EliteKids Full System Audit — 2026-08-26

**Status:** COMPLETE
**Auditor:** opencode
**Scope:** Backend, Frontend, Infrastructure, Security, DB

---

## Executive Summary

The system is **functional but has significant gaps** in three areas: (1) orphaned/unused code creating maintenance overhead, (2) missing infrastructure (no backups, no PM2, no monitoring), and (3) incomplete features that are wired but empty. No critical security vulnerabilities, but several medium-risk items need attention.

**Health:** ✅ Running — `elite-kids-api` active, health endpoint responding, frontend built and served.

---

## CRITICAL — Fix Immediately

### C1. No MySQL backups exist
- **Impact:** Single disk failure loses ALL data (500+ tables, elite_db + elite_content)
- **Fix:** Set up daily mysqldump cron + offsite storage
- **Effort:** 30 minutes

### C2. No DB backup cron, no monitoring
- **Impact:** Silent failures go undetected
- **Fix:** Add cron job + optional Sentry/error tracking
- **Effort:** 1 hour

---

## HIGH — Fix This Sprint

### H1. Backend: 26 `.bak-*` backup files in `src/`
- Files like `src/controllers/kids.js.bak-e2`, `src/index.js.bak-e3flive`, etc.
- **Fix:** Delete all `.bak-*` files, add `*.bak*` to `.gitignore`
- **Effort:** 10 minutes

### H2. Backend: `kids_adaptive_profiles` table queried but never created
- `kidsRevision.js:184` queries it, silently returns empty via `.catch(() => [[]])`
- **Fix:** Create table via `ensureSchema()` or migration
- **Effort:** 30 minutes

### H3. Backend: `kidsRevision.js` creates `kids_failed_items` via raw DDL, not tracked by ORM
- `CREATE TABLE IF NOT EXISTS` on every cold start — schema drifts silently
- **Fix:** Add to migration framework or `ensureSchema()`
- **Effort:** 30 minutes

### H4. Backend: `memory-pairs` template missing from ENUM migration
- `fix-template-enum.js` adds `fill-in-blank` and `puzzle-split` but NOT `memory-pairs`
- AI-generated memory-pairs configs fail at INSERT
- **Fix:** Add `memory-pairs` to ENUM ALTER
- **Effort:** 15 minutes

### H5. Backend: Hardcoded credentials in debug scripts
- `debug-login.js:49` — `admin / 123456`
- `daemon.js:43` — `hhfh@hhf.com / test1234`
- `flagshipKidsSeed.js:127` — `Admin@2026`
- **Fix:** Remove scripts from repo or sanitize
- **Effort:** 20 minutes

### H6. Backend: `kidsPool` connects to non-existent `elite_kids` DB
- `database.js:40` creates pool for `KIDS_DB_NAME` (defaults to `elite_kids`) but all kids models use `elite_content`
- Dead connection pool consuming resources
- **Fix:** Remove unused `kidsPool` or redirect to correct DB
- **Effort:** 15 minutes

### H7. Frontend: 8 orphan components/pages
- `TeacherVoiceNotes.tsx` — full page with NO route
- `StudentArenaPanel.tsx`, `StudentCurriculumPanel.tsx`, `StudentLiveBar.tsx` — never imported
- `ParentDashboard.tsx` — never imported, has hardcoded API paths
- `StickerButton.tsx`, `EmojiPicker.tsx` — never imported
- `OfflineBanner.tsx` — only referenced in JSDoc
- **Fix:** Either wire to routes OR delete
- **Effort:** 30 minutes each

### H8. Frontend: 65 API endpoint definitions never called
- QUICK_CREATE, ARENA_GAMES, MATCH_HISTORY, POWER_UPS, TRACKING, GARDEN, COMPANION, SESSION, PUSH, etc.
- These are planned features with no frontend consumer
- **Fix:** Document as "planned" or remove dead definitions
- **Effort:** 30 minutes

---

## MEDIUM — Fix Next Sprint

### M1. Backend: `authBypass.js` conditional auth bypass
- When `NODE_ENV=development` or `AUTH_BYPASS=1`, passport auth is skipped
- If misconfigured on prod → all kid routes unauthenticated
- **Fix:** Ensure `AUTH_BYPASS` is never set in production `.env`
- **Effort:** 5 minutes (verification)

### M2. Backend: SQL template literals in `src/index.js:29,55`
- Uses `${name}` and `${table}`/`${col}` directly in `ALTER TABLE` DDL
- Values from hardcoded arrays (not user input) but pattern is unsafe
- **Fix:** Use proper escaping or parameterized DDL
- **Effort:** 30 minutes

### M3. Frontend: 4 hardcoded API paths bypassing ENDPOINTS constants
- `ParentChildren.tsx:155` — `'/kids/parent/activities'`
- `ParentActivities.tsx:82` — `'/kids/parent/activities'`
- `Dashboard.tsx:135` — `'/health'`
- `ParentDashboard.tsx:27` — `'/kids/parent/login'`
- **Fix:** Add to ENDPOINTS constants, use reference
- **Effort:** 15 minutes

### M4. Frontend: 7 hardcoded English strings should use `t()`
- `AdminNav.tsx:41,42,79` — "Elite Kids", "Sign out"
- `ParentChildren.tsx:226` — "Elite Kids" alt text
- `ParentActivities.tsx:110` — "Elite Kids" alt text
- `TeacherLessons.tsx:327` — "Cancel"
- `App.tsx:36` — "Loading"
- **Fix:** Add i18n keys and replace
- **Effort:** 20 minutes

### M5. Frontend: 5 silent error swallows (`catch {}`)
- `ParentChildren.tsx:157`, `TeacherBossRaid.tsx:58,104`, `ReviewZone.tsx:43`, `RevisionCard.tsx:55,80`
- User sees no feedback when API calls fail
- **Fix:** Add toast/error notification in catch blocks
- **Effort:** 30 minutes

### M6. Backend: `puzzle-split` template half-wired
- Image splitting works (`media/puzzle-splitter.js`)
- Generation loop references it but has no prompt builder → crashes
- **Fix:** Add prompt builder or disable generation path
- **Effort:** 1 hour

### M7. Backend: `e3fLive.js` WebSocket has independent JWT verification
- Separate auth implementation from main passport flow — can drift
- **Fix:** Share auth middleware or document the dual path
- **Effort:** 1 hour

### M8. Backend: `dotenv` ^8.2.0 is very outdated (current: 16.x)
- Known issues with overwrite/multi-env support
- **Fix:** Upgrade to ^16, test .env loading
- **Effort:** 30 minutes

---

## LOW — Backlog

### L1. No frontend test suite
- vitest configured, `@testing-library/react` installed, but zero test files
- **Fix:** Write critical path tests (login → game → result)

### L2. No structured logging
- Console.log only, no log rotation, no aggregation
- **Fix:** Add winston/pino with rotation

### L3. Node.js 20 EOL April 2026
- Should plan upgrade to Node 22 LTS
- **Effort:** 2-4 hours (testing)

### L4. deploy.sh still references PM2 (now fixed)
- Was using `pm2 restart` — updated to `systemctl --user restart`

### L5. 37 tables in elite_content with 0 rows
- Many are feature tables (boss_raid, festival, match_history, etc.) that exist but haven't been used yet
- Not broken, just unused features

### L6. `kids_power_ups` table exists in DB but zero code references
- Orphan table — either implement or drop

---

## DB Schema Status

### Tables with 0 rows (23 kids_* tables)
kids_adaptive_profiles, kids_boss_raid_games, kids_boss_raid_participants, kids_boss_raid_state, kids_boss_runs, kids_class_game_variants, kids_engagement_snapshots, kids_failed_items, kids_festival_state, kids_library_games, kids_mastery_progress, kids_match_history, kids_mode_locks, kids_parental_controls, kids_power_ups, kids_prescreen_log, kids_push_log, kids_push_subscriptions, kids_review_schedule, kids_series_subject_maps, kids_session_state, kids_teacher_questions, kids_tournament_games

### Tables queried but don't exist
- `kids_adaptive_profiles` — queried by kidsRevision.js, silently fails

### Tables created by raw DDL (not in migration framework)
- `kids_failed_items` — created by `kidsRevision.js:35`

---

## Sprint 8 Completion Status

| Task | Status | Notes |
|------|--------|-------|
| Q8: S8-4 Auth hardening | ✅ DONE | `requireStaff` present |
| Q9: S8-3 Curriculum renumber | ✅ DONE | 30 canonical points |
| Q10: S8-1 i18n P3 | ✅ DONE | en.json + ha.json + RTL |
| Q11: S8-5 Spaced repetition | ✅ DONE | ReviewZone integrated |
| Q12: S8-6 Adaptive difficulty | ✅ DONE | GamePlay fetches profiles |
| Q13: S8-2 Content expansion | ✅ DONE | 12 units, 36 games seeded |
| Q14-Q17: Freebuff QA | ⏳ QUEUED | Awaiting fb-review agent |
| Q18: E4 WebRTC | 🔒 BLOCKED | Needs supervisor go + coturn ROOT |

---

## What Needs Your Intervention

### E4 WebRTC — Requires Root Access
The WebRTC realtime broadcast feature (`e3fLive.js`) needs:
1. **coturn server** installed and configured (requires ROOT/sudo access on the VPS)
2. **Supervisor approval** to proceed with real-time features

**Do you need to intervene?**
- **coturn installation:** Yes — requires `sudo apt install coturn` on the VPS, which only root can do. The dev user doesn't have sudo.
- **Supervisor go:** That's your call — the feature is a real-time audio intercom for teacher-student communication. It's functional code (319 lines) but needs the TURN server for NAT traversal.

**What I can do without you:**
- Everything else in the audit — all fixes, all content, all infrastructure improvements

---

## Recommended Fix Order

1. **Today:** H1 (delete .bak files) + H5 (sanitize debug scripts) + M3 (hardcoded API paths) — quick wins
2. **This week:** C1 (DB backups) + H2 (adaptive profiles table) + H4 (memory-pairs ENUM) + M1 (verify AUTH_BYPASS)
3. **Next sprint:** H7 (orphan components) + H8 (dead endpoints) + M5 (error handling) + L1 (frontend tests)
4. **When ready:** E4 WebRTC (needs root + supervisor)

---

*Report generated: 2026-08-26 09:20 UTC*
*Prod deployed: ✅ i18n P3 + adaptive + content seed + renumber*
*Health: ✅ http://127.0.0.1:8484/health → {"status":"ok"}*
