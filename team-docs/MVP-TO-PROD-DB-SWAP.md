# EliteKids — MVP → Production DB Swap Checklist

**Scope:** move EliteKids off the MVP `_test` databases and onto the production
databases, then flip `.env`. Config-only on the code side (every DB name comes
from an env var — nothing is hardcoded), but the **data move must be planned,
reviewed, and verified** before the flip.

**Last reviewed:** 2026-09-01 (with Codebuff) — facts below verified against the
live VPS (`/var/www/html/elite/elite-kids/backend/.env`) and `src/models/index.js`.

---

## 0. The architecture rule (why the DBs are split this way)

| Table group | Owner | Kids connection | Current (MVP) | Production target |
|---|---|---|---|---|
| Shared school tables: `users`, `parents`, `students`, `teachers`, `school_setup`, `classes`, `subjects`, `school_locations`, `password_reset_tokens` | **EliteSMS** | main (`dbm().sequelize`) — **READ-only, NEVER altered** | `elite_db_test` | `elite_db` |
| Kids content tables: `kids_parent_links`, `kids_children`, `kids_progress`, `kids_lessons`, `kids_game_configs`, `kids_scene_scripts`, `kids_content_approvals`, `kids_badges`, … (the `kids_*` set) | **EliteKids** | content (`dbm().content`) | `elite_content_test` | `elite_content` |
| Dedicated kids-domain tables (C1 target home) | **EliteKids** | kids (`KIDS_DB_NAME`) | `elite_kids_test` | `elite_kids` |
| AI audit log (`kids_content_generation_audit`) | shared | ai | `elite_bot` ✅ (already correct) | `elite_bot` |

> **Login identity is shared.** Parents authenticate against the shared
> `users`/`parents` tables with the EliteSMS password (bcrypt) — see
> `unified-login.test.js`. That means the production `elite_db` must already
> contain the parent accounts; the kids app never creates them.

---

## 1. Pre-flight (do this before touching anything)

- [ ] Confirm **go-live date** and freeze window (no school data changes mid-copy).
- [ ] Confirm production `elite_db` exists and is the **same schema** as
      `elite_db_test` (run the shared-DB migrations / verify table DDL).
- [ ] Confirm the parent accounts that must log in actually exist in production
      `elite_db.users` + `elite_db.parents` (phone + bcrypt password).
- [ ] Confirm `JWT_SECRET_KEY` is identical in:
      - `/var/www/html/elite/elite-kids/backend/.env`
      - `/var/www/html/elite/backend/.env` (elite-api)
      (Already synced 2026-09-01 — re-verify before cutover.)
- [ ] Take a **full backup** of the MVP DBs:
      ```bash
      mysqldump elite_db_test      > /var/www/html/elite/backups/mvp-elite-db-$(date +%Y%m%d).sql
      mysqldump elite_content_test > /var/www/html/elite/backups/mvp-elite-content-$(date +%Y%m%d).sql
      mysqldump elite_kids_test    > /var/www/html/elite/backups/mvp-elite-kids-$(date +%Y%m%d).sql
      ```
      (Use the DB creds from `backend/.env`; store backups OUTSIDE the web root,
      e.g. `/var/www/html/elite/backups/`.)

---

## 2. Inventory the data to move

Only the **kids-owned** tables move. The shared tables are read from EliteSMS's
own production DB — kids must NOT copy them (that would violate the read-only rule).

- [ ] List kids tables in `elite_content_test`:
      ```sql
      SHOW TABLES FROM elite_content_test LIKE 'kids\_%';
      ```
- [ ] List kids tables in `elite_kids_test` (the dedicated DB — many tables are
      the same `kids_*` names; confirm which the app actually reads via
      `KIDS_DB_NAME` vs `CONTENT_DB_NAME` in `src/models/index.js`).
- [ ] Count rows per table (`SELECT COUNT(*)`) and record them in this doc —
      the after-flip counts must match.

---

## 3. Data migration (recommended order: content → kids)

> Work on a maintenance window. Use `mysqldump ... --single-transaction` for
> InnoDB. Do NOT touch any non-`kids_*` table in the shared DBs.

```bash
# 3a. Kids content tables: elite_content_test -> elite_content
mysqldump --single-transaction --no-create-db elite_content_test \
    kids_parent_links kids_children kids_progress kids_lessons \
    kids_game_configs kids_scene_scripts kids_content_approvals \
    kids_badges kids_generation_jobs kids_prescreen_log \
    kids_content_generation_audit kids_parental_controls kids_mode_locks \
    # ... (complete list from step 2) \
  | mysql elite_content

# 3b. Dedicated kids-domain tables: elite_kids_test -> elite_kids (if in use)
mysqldump --single-transaction --no-create-db elite_kids_test \
    kids_badges kids_weekly_points \
    # ... (complete list from step 2) \
  | mysql elite_kids
```

- [ ] After each copy: `SELECT COUNT(*)` per table in the target and compare
      with the source counts recorded in step 2.
- [ ] If the production DBs already contain tables (e.g. other suite apps share
      `elite_content`), use `--no-create-info` and re-run with
      `INSERT ... ON DUPLICATE KEY UPDATE` semantics or a checked merge — do
      not blindly overwrite existing rows.

---

## 4. Flip the kids `.env`

Edit `/var/www/html/elite/elite-kids/backend/.env`:

```diff
- DB_NAME=elite_db_test
+ DB_NAME=elite_db
- CONTENT_DB_NAME=elite_content_test
+ CONTENT_DB_NAME=elite_content
- KIDS_DB_NAME=elite_kids_test
+ KIDS_DB_NAME=elite_kids
  AI_DB_NAME=elite_bot        # already correct
```

- [ ] Do NOT commit `.env` (it is gitignored).
- [ ] Confirm `NODE_ENV=production` and `JWT_SECRET_KEY` unchanged.
- [ ] Keep the old `.env` as `.env.mvp-backup-$(date +%Y%m%d)` next to it for
      instant rollback.

---

## 5. Restart + verify

```bash
systemctl --user restart elite-kids-api
systemctl --user is-active elite-kids-api        # active
ss -tlnp | grep 8484                              # listening
```

Smoke tests (use a real parent account that exists in production `elite_db`):

1. `POST /kids/parent/login {phone, password, school_id}` → **200 + token**
2. `POST /kids/parent/login {phone, pin: '1234'}` → **400** (PIN still dead)
3. `GET /kids/parent/children` with the token → linked children load
4. Cross-app: call elite-api `/api/apps/access` with the kids token →
   **no re-login** (shared JWT secret)
5. Spot-check `kids_parent_links`, `kids_progress` reads against the new DBs
   (kids service log should no longer say `elite_content_test`).

---

## 6. Rollback (if anything fails)

- [ ] Restore `.env.mvp-backup-$(date +%Y%m%d)` → `.env`
- [ ] `systemctl --user restart elite-kids-api`
- [ ] Re-run the smoke tests (1–5) — must pass against `_test` DBs again
- [ ] The MVP DBs and the backups in step 1 remain untouched until the new
      setup has been stable for **≥ 1 week**; only then archive them.

---

## 7. Post-cutover cleanup

- [ ] Archive the MVP DBs (do NOT delete immediately):
      ```bash
      mysqldump elite_db_test > backups/archived-elite-db-test-$(date +%Y%m%d).sql
      # then optionally DROP the _test DBs once confirmed unused
      ```
- [ ] Update `.env.example` if any documented value drifted.
- [ ] Run the `EliteKids Diagnostics` workflow (manual) once more for the record.
