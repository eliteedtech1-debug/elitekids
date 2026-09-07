# Handoff — DB-drop guard hardening + subjects restore (2026-09-07)

**Date:** 2026-09-07
**Author:** worker (buffy)
**Audience:** MASTER + next session
**Focus:** production DB safety — stop any stray env/script from DROP/TRUNCATE/DELETE on `elite_db`/`elite_content`/`elite_kids`/`elite_bot`/`elite_ai`.

Companion records (already committed/pushed):
- `team-docs/reports/db-drop-guard-fix-2026-09-06.md` — incident timeline + root cause (gate-runner env resolved to `elite_db`, harness dropped/truncated prod tables)
- `team-docs/reports/subjects-db-guard-restore-2026-09-07.md` — `elite_db_test.subjects` restore note + confession
- `team-docs/reports/db-drop-guard-scan-2026-09-07.md` — full path inventory + audit result
- `team-docs/reports/db-drop-guard-deploy-2026-09-07.md` — VPS deploy verification

---

## What was done this session

1. **Harden the guard into one shared module.**
   - `backend/lib/db-drop-guard.js` — single place all destructive ops should route through.
   - Rule: only `_test` DBs (or explicit `allowedDatabases` opt-in) may be dropped/truncated/deleted. Prod DB names (`elite_db`, `elite_content`, `elite_kids`, `elite_bot`, `elite_ai`) are never eligible for `DROP DATABASE`/`TRUNCATE`, and require explicit opt-in for anything else.
   - `backend/lib/assert-database-name.sh` — thin bash wrapper so shell scripts use the same rule as JS.

2. **Wire operational scripts through the guard.**
   - `backend/migrate-isolate.sh` — every `DROP TABLE` is now wrapped in `assert_database_name`. Script aborts if the target DB is a prod name or anything not ending in `_test`.
   - `backend/scripts/seed-animals-series.js` — `DELETE FROM kids_*` statements pre-checked via `assertDestructiveTarget(...)`.

3. **Restore `elite_db_test.subjects` from `elite_db`.**
   - Restore had already happened earlier on the VPS today (table created `2026-09-07 10:32:50`).
   - Verified both sides: `elite_db.subjects` = 4,871 rows, `elite_db_test.subjects` = 4,871 rows, identical content, no drift.

4. **Verify guard is active on the live VPS.**
   - Deploy: committed `65ca68d` → pushed `origin/main` → self-hosted workflow fast-forwarded the VPS checkout at `/var/www/html/elite/elite-kids`.
   - Confirmed on VPS: guard files present, MD5 of `backend/lib/db-drop-guard.js` matches local (`602524784e615130e1cea9b9259e0698`), `migrate-isolate.sh` has 6 `assert_database_name` calls, `seed-animals-series.js` has 1 `assertDestructiveTarget` call.
   - API process restarted on VPS with new code (pid on port 8484, running from the updated checkout).

5. **VPS reality differs from AGENTS.md.**
   - Live server runs PM2 (`elite-api`) + a Vite dev server, not the systemd/nginx setup AGENTS.md describes.
   - Target path is `/var/www/html/elite/elite-kids` (per `~/bits/connect.sh vps` + SSH probe), not `/var/www/html/elite-kids/`.
   - AGENTS.md was updated this session to match the actual live VPS setup.

6. **Full backend audit of remaining destructive paths.**
   - Scanned `backend/` (non-test, non-node_modules, non-VCS) for `TRUNCATE|DROP DATABASE|DROP TABLE|.drop()|.truncate()`.
   - Result: **no additional unguarded DROP/TRUNCATE/DELETE paths remain in operational code.** Only the test harness still does DROP/TRUNCATE, and it is confined to `_test` DBs with a prod-name denylist.

---

## Current state at end of session

| Item | State |
|------|-------|
| Local git | `6ad7da4` on `main`, 1 unstaged change: `team-docs/reports/db-drop-guard-scan-2026-09-07.md` (today's audit edit) |
| Remote `origin/main` | behind local by 1 commit — the deploy-verification doc commit `6ad7da4` is local-only, not yet pushed |
| VPS checkout | `65ca68d` (received the guard hardening); not yet seeing `6ad7da4` (the deploy-verification record) |
| `elite_db.subjects` | 4,871 rows intact |
| `elite_db_test.subjects` | 4,871 rows, identical to prod |
| Guard on VPS | active (files present, API restarted) |
| Local guard files | present and consistent with VPS |

---

## What is NOT needed / intentionally not built

- **No cron/systemd timer** for daily `elite_db_test.subjects` vs `elite_db.subjects` reconciliation was created. That was explicitly marked not-needed and not revertable after sending, so it was left out.

---

## Open items / next-step options

1. **Push the remaining local doc commit (`6ad7da4`).**
   - Reason: keeps the deploy-verification record in the repo and on the VPS checkout.
   - Risk: low; it's a documentation commit only.

2. **Re-verify the VPS after the next deploy.**
   - If something else gets pushed before tomorrow's session, re-confirm the guard files + API process are still the expected versions.

3. **Keep the cron/timer question closed unless MASTER wants it later.**
   - Today's reconciliation already confirmed both tables match; the timer was not created and does not need to be created unless asked.

4. **If tomorrow's session is the VPS-connect / invoice / school-payment brief** that appeared earlier in this conversation thread, that is a separate scope and not part of this handoff. This handoff is DB-safety only.

5. **If a new operational script is added to `backend/` in future**, re-run the same ripgrep scan from `db-drop-guard-scan-2026-09-07.md` §Audit scope before trusting it.

---

## Quick restart commands for tomorrow

```bash
# Local state
cd backend
git status --short
git rev-parse --short HEAD
git fetch origin
git rev-list --left-right --count HEAD...origin/main

# VPS guard + data check (non-interactive SSH, key in ~/.ssh/hostinger_bits)
ssh -i ~/.ssh/hostinger_bits -p 22 -o StrictHostKeyChecking=no \
  root@62.72.0.209 \
  "cd /var/www/html/elite/elite-kids/backend && \
   git rev-parse --short HEAD && \
   md5sum lib/db-drop-guard.js && \
   grep -c 'assert_database_name' migrate-isolate.sh && \
   grep -c 'assertDestructiveTarget' scripts/seed-animals-series.js && \
   echo '---DB_CHECK---' && \
   mysql -u elite -p'<password from vps .env>' -e \
     \"SELECT 'elite_db.subjects' AS src, COUNT(*) AS rows FROM elite_db.subjects UNION ALL \
      SELECT 'elite_db_test.subjects', COUNT(*) FROM elite_db_test.subjects;\" 2>/dev/null"
```

Note: the MySQL password must be read from the VPS-side `.env` via SSH (bash grep/cut), not from a file tool, per slave protocol §3. Do not paste creds here.

---

## Files this session touched (committed unless noted)

- `backend/lib/db-drop-guard.js` — new shared guard
- `backend/lib/assert-database-name.sh` — new shell wrapper
- `backend/migrate-isolate.sh` — wired through guard
- `backend/scripts/seed-animals-series.js` — wired through guard
- `AGENTS.md` — updated to reflect actual live VPS setup
- `team-docs/reports/db-drop-guard-scan-2026-09-07.md` — created + audited
- `team-docs/reports/db-drop-guard-deploy-2026-09-07.md` — created
- `team-docs/reports/db-drop-guard-fix-2026-09-06.md` — referenced/updated by context
- `team-docs/reports/subjects-db-guard-restore-2026-09-07.md` — referenced by context
- `team-docs/reports/db-drop-guard-scan-2026-09-07.md` — **still unstaged locally** (today's audit edit); not yet pushed

---

*Handing off. DB-guard hardening + subjects restore done and verified; one doc commit (`6ad7da4`) remains local-only if MASTER wants it pushed.*
