# BRIEF: E1 — NERDC codes layer (READ-ONLY recon + design draft)

Assigned: freebuff (remote opencode). Mode: read-only on app code + DB; your ONLY writes go to `team-docs/reports/`.
Deliverable: `/var/www/html/elite-kids/team-docs/reports/e1-nerdc-recon.md`

## Context
Elite-kids stack: `/var/www/html/elite-kids/backend` (express+sequelize, port 8484, systemd user unit).
DB creds pattern: read `.env` keys DB_USERNAME/DB_PASSWORD/DB_HOST/DB_NAME (see any p3-* script in /tmp for getv() helper). NEVER print secrets.
Prior art: `team-docs/reports/f41-domesticate-ddl-order.md` — follow its 5-step DDL discipline (no DDL on request path).

## Tasks
1. INVENTORY (schema only): tables/columns touching subjects + curriculum codes — subjects, classes, kids_series/kids_lessons (or equivalent), kids_series_subject_maps, academic_calendar, ca_setup. Note existing code-like columns (e.g. subject_code, code) and uniques.
2. COUNTS: row counts per subject; how many series/lessons lack any subject linkage. No bulk row dumps.
3. ROUTES: which API routes touch subjects/curriculum mapping today (file:line refs).
4. NERDC MAPPING DESIGN: propose minimal reference table(s) for NERDC subject codes/themes + linkage to kids_series (series-level, mirroring domestication invariant — NEVER per-game). Include: CREATE TABLE DDL, backfill sketch, verification queries, rollback. Reversible, no destructive ALTERs.
5. RISKS: note anything that would touch elite_db shared writes (documented exception only).

## Constraints (binding)
- C7: you never edit application code. This is recon/design only.
- Read-only SQL. No INSERT/UPDATE/ALTER anywhere.
- Do not print tokens, passwords, or student PII.

## Done
Write the report, then `touch /tmp/.fb-e1-done`. Do not start another task until master assigns one.
