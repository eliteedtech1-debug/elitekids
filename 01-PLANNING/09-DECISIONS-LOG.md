# Decisions Log

Append-only record of where the actual implementation diverged from the original
`EliteKids.zip` planning docs, and why. When they conflict, this log is authoritative —
but don't edit the planning docs to match without also noting it here.

Each entry: number, date, what changed, why, what it affects.

---

### DEC-001 — Addon architecture (standalone → EliteCore addon)
Date: 2026-08-17
Sprint: 0
Changed: The original plan described a standalone backend/frontend/DB (`elitekids`
database, own auth, own user tables). → EliteKids is built as a **stand-alone addon to
EliteCore**, mirroring `elite-cbt` / `elite-cbt-api`: shared JWT (`JWT_SECRET_KEY`),
shared `users`/`students`/`teachers`/`parents`/`school_setup` tables in the main school
DB, subdomain→school tenancy, module gate via `school_setup.kids_stand_alone`.
Reason: The user directed it explicitly: "develop a new app using similar auth,
branding approach … so it will work with elite-core via api." The CBT pair is the
proven pattern; teachers/parents keep their existing EliteCore credentials.
Affects: 02-SYSTEM-ARCHITECTURE.md, 03-EXECUTION-ROADMAP.md, 06-BRANDING-AND-UIUX.md,
all of 02-ELITE-INTEGRATION/. Follow-up needed: yes — implement auth per
02-ELITE-INTEGRATION/01 and never create users in addon tables.

### DEC-002 — Database placement (own DB → elite_content / elite_ai)
Date: 2026-08-17
Sprint: 0
Changed: Original plan used a dedicated `elitekids` MySQL database (infra/docker-compose
created `MYSQL_DATABASE: elitekids`). → All new tables go into the existing ecosystem
DBs: `kids_*` content tables in **`elite_content`** (same DB as the CBT addon's
`cbt_*` tables), and the AI generation audit log in the **AI DB** (`AI_DB_NAME`);
only additive columns (`kids_stand_alone`, `kids_url`) touch the shared school DB
via the dry-run-first migration runner.
Reason: The user directed it explicitly: "most of the tables that are not in existence
will be on elite_ai, elite_content etc same dbs." Avoids proliferating databases and
keeps the shared school DB untouched by addon code.
Affects: infra/docker-compose.yml (elitekids DB removed), 02-DATABASE-PLACEMENT.md,
backend/src/models/index.js, backend/database/migrate.js.
Follow-up needed: RESOLVED 2026-08-17 (re-confirmed) — verified on the prod VPS
  (62.72.0.209): there is **no `elite_ai` DB**; the AI DB is **`elite_bot`**
  (elite-api's code default — neither elite-api nor elite-cbt sets `AI_DB_*` in
  their .env). `backend/.env` and `backend/.env.example` therefore default to
  `AI_DB_NAME=elite_bot`, and `kids_content_generation_audit` will be created
  there. Set `AI_DB_NAME=elite_ai` only on servers that provision an `elite_ai`
  DB. No new DB created on prod.

  Also confirmed on the same date: the shared `JWT_SECRET_KEY` value
  (bad8u328430932930) is identical in `elite-api/.env` and `elite-cbt/.env` on
  prod — elite-kids-api uses the same value so ecosystem tokens are
  interchangeable. Keep it out of anything committed (it lives only in the
  gitignored `backend/.env`).

### DEC-003 — B2 buckets (elite-kids-*)
Date: 2026-08-17
Sprint: 0
Changed: Original plan's buckets (`elite-kids-bot-files`, `elite-kids-doc-files`,
`elite-kids-media-files`) are kept, but the storage layer reuses the ecosystem's
existing media-service / `s3Client.js` signed-URL pattern instead of a new client.
Reason: Consistent with DEC-001 — reuse proven infrastructure.
Affects: 02-SYSTEM-ARCHITECTURE.md storage notes.
Follow-up needed: no.

### DEC-004 — Local .env wired to prod via SSH tunnel; read-only smoke boot
Date: 2026-08-17
Sprint: 0
Changed: `backend/.env` was populated with the real prod DB credentials
  (`elite_db` / `elite_content` / `elite_bot`) and the shared prod
  `JWT_SECRET_KEY` (bad8u328430932930, verified identical in elite-api/.env and
  elite-cbt/.env). Because MySQL only grants the `elite` user on localhost, the
  .env points at an SSH tunnel (`ssh -L 33061:127.0.0.1:3306`), not a direct
  remote port. Added `KIDS_SKIP_DB_SYNC=1` to `src/index.js` so the API can be
  smoke-booted without applying schema changes to prod.
Reason: User asked to wire the backend against the real DBs and run the
  dry-run migration + smoke tests without (yet) applying the schema.
Affects: backend/.env (gitignored), backend/src/index.js, PROJECT_STATE.md.
Follow-up needed: yes — run `node database/migrate.js --apply` (with the
  tunnel up) when the schema should actually be created; stop the tunnel with
  `pkill -f 33061:127.0.0.1:3306` when done.

---

## Template (copy for each new entry)
```
### DEC-00X — <short title>
Date: YYYY-MM-DD
Sprint: N
Changed: <what was originally planned> → <what was actually done>
Reason: <what was learned in practice that caused the change>
Affects: <which planning doc(s)/roadmap task(s) this touches — update their status but don't rewrite history>
Follow-up needed: <yes/no — anything else that now needs revisiting>
```
