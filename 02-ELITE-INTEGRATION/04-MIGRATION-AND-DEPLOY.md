# Elite Integration — Migrations & Deployment

## 1. Migration runner (`backend/database/migrate.js`)

A direct port of `elite-cbt-api/database/migrate.js` — the production-safe pattern the
user has already validated. **Do not write raw one-off ALTERs.**

Usage:
```bash
node backend/database/migrate.js              # DRY-RUN — print plan, change nothing
node backend/database/migrate.js --apply      # backups, then apply
node backend/database/migrate.js --apply --skip-backup   # not recommended
node backend/database/migrate.js --help
```

Safety features (inherited from the CBT runner):
- **Dry-run by default**; changes only with `--apply`.
- **Guard check**: refuses to run if the main DB lacks `users`, `school_setup`,
  `students` (i.e. it must be the elite school DB).
- **Backups**: every shared table it modifies is dumped via `mysqldump
  --single-transaction` into `logs/kids-migration-backups/<timestamp>/` before apply.
- **Additive only**: columns added only if missing, using `information_schema`
  existence checks + prepared statements (MySQL 8.0 has no `ADD COLUMN IF NOT EXISTS`).
  A re-run prints "column exists, skipping" and exits cleanly.
- **Addon tables never touch the shared DB**: `kids_*` tables are created in
  `elite_content`; the audit table in the AI DB (`elite_bot` on this server).
- Full run log at `logs/kids-migration-<timestamp>.log`.

### Migration plan (main DB — additive columns)

| Table | Column | DDL |
| --- | --- | --- |
| `school_setup` | `kids_stand_alone` | `TINYINT(1) NOT NULL DEFAULT 0` |
| `school_setup` | `kids_url` | `VARCHAR(50) NULL DEFAULT NULL` |

`CONTENT_COLUMN_PLAN` (elite_content) and `AI_COLUMN_PLAN` (AI DB) reconcile
columns on `kids_*` tables the same idempotent way.

### Boot sequence (mirror `elite-cbt-api/src/index.js`)

```
ensureSchemaMigrations()          # additive ALTERs on main DB
  → models.syncKidsTables()       # create kids_* tables in elite_content + AI DB (never alters)
  → ensureFlagshipKidsSchool()    # SCH-KIDS flagship + admin (idempotent)
  → ensureKidsDenylistSeed()      # deterministic denylist (if empty)
  → app.listen(PORT)
```

## 2. Environments (backend/.env.example)

```
# ── Database ─────────────────────────────────────────────────────────
DB_NAME=elite_db                    # shared school DB (users/students/school_setup)
DB_USERNAME=...
DB_PASSWORD=...
DB_HOST=localhost
DB_PORT=3306
CONTENT_DB_NAME=elite_content       # kids_* content tables
AI_DB_NAME=elite_bot                # kids_content_generation_audit — CONFIRMED: prod AI DB is elite_bot, not elite_ai (DEC-002)
# AUDIT_DB_NAME=elite_logs          # optional

# ── Server ───────────────────────────────────────────────────────────
PORT=34600                          # keep clear of elite-api:34567, cbt-api:34568
NODE_ENV=development

# ── Auth ─────────────────────────────────────────────────────────────
# MUST equal elite-api's JWT_SECRET_KEY — tokens are shared across the ecosystem.
JWT_SECRET_KEY=change_this_to_the_same_value_as_elite_api
MASTER_PWD=

# ── CORS ─────────────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:5173,https://*.elitekids.com.ng

# ── Redis / Queue (game-config + media jobs) ────────────────────────
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# ── Backblaze B2 (S3-compatible) — rotate the exposed key first ─────
B2_ENDPOINT=s3.<region>.backblazeb2.com
B2_REGION=<region>
B2_KEY_ID=replace-me
B2_APPLICATION_KEY=replace-me
B2_BUCKET_BOT=elite-kids-bot-files
B2_BUCKET_DOC=elite-kids-doc-files
B2_BUCKET_MEDIA=elite-kids-media-files
MEDIA_PUBLIC_BASE_URL=http://127.0.0.1:34600

# ── AI (content generation) — pin model versions ────────────────────
AI_API_KEY=replace-me
AI_MODEL=gemini-2.5-flash           # pin exact version; never auto-upgrade
CLASSIFIER_MODEL=gemini-2.5-flash
```

Frontend (`frontend/.env.example`):
```
VITE_API_URL=http://localhost:34600
VITE_APP_DOMAIN=elitekids.com.ng
```

## 3. Deploy

Same playbook as elite-cbt (PM2 or Docker — see `elite-cbt-api` for the PM2 pattern,
`lms-stack` for Docker):

1. `git pull` on the server
2. `cd backend && npm install --production` (or `pnpm install`)
3. **DRY-RUN migrations first**: `node database/migrate.js` — review the plan
4. `node database/migrate.js --apply` (takes mysqldump backups first)
5. `npm run build` (frontend) → serve dist on `<school>.elitekids.com.ng`
6. Restart PM2 process (`pm2 restart elite-kids-api`), confirm `/health`
7. Verify CORS + subdomain school resolution with a browser smoke test

### DNS

- `elitekids.com.ng` → SPA (Vercel/nginx)
- `*.elitekids.com.ng` → SPA (wildcard; each school is a subdomain)
- API at a stable URL, e.g. `https://server.brainstorm.ng/elite-kids-api` (set
  `VITE_API_URL` at build time) — matches how elite-api/elite-cbt are hosted.

## 4. Rollback

- **Schema**: restore the mysqldump backups from
  `logs/kids-migration-backups/<timestamp>/`.
- **Content**: flip `content_state` to `recalled` on the offending rows — instantly
  removes from all child-facing queries (single UPDATE, per the incident plan).
- **Feature flag**: `school_setup.kids_stand_alone = 0` disables the app for a school
  without touching data.
