# elite-kids-api (backend)

Express + Sequelize addon API for EliteKids. **Reference implementation:
`elite-cbt-api`** — this skeleton is a direct structural port (auth, tenancy,
migrations, seeds) with the Kids domain swapped in.

## Run

```bash
cp .env.example .env      # fill DB_* + JWT_SECRET_KEY (= elite-api's value)
npm install
node database/migrate.js        # DRY-RUN first — review the plan
node database/migrate.js --apply
npm run dev                     # http://localhost:34600/health
```

## Layout

```
database/migrate.js   production-safe runner (dry-run by default, backups before apply)
src/index.js          boot: migrations → model sync → flagship seed → denylist seed → listen
src/config/           database pools, passport-jwt (shared secret), roles
src/middleware/       corsAuthFix (wildcard subdomains), sessionAuth (login tokens)
src/models/           kids_* models → elite_content; audit → AI DB; shared read-only
src/controllers/      auth (users/parents/students login) + kids (children/lessons/progress/approvals)
src/routes/           /users/login, /schools/get-details, /kids/*
src/services/         contentGenerator (schema-validated AI output), safetyPipeline (denylist + classifier + audit)
src/seeders/          flagship kids school (SCH-KIDS), denylist seed
```

## DB connections

- `sequelize` → main school DB (`DB_NAME`) — read/use only
- `content` → `elite_content` — kids_* content tables
- `ai` → AI DB (`AI_DB_NAME`; `elite_bot` on the prod server) — kids_content_generation_audit

See `../02-ELITE-INTEGRATION/02-DATABASE-PLACEMENT.md` for the full table map.

## Not yet implemented (Sprint targets)

- Real LLM generation call (stub in `contentGeneratorService.js`)
- BullMQ worker wiring for `kids_generation_jobs`
- B2 signed-URL resolution for child-facing game configs
- Scene script generation + `/kids/lessons/:id/scenes`
- Tests (Jest/Supertest per 01-PLANNING/05-TESTING-STRATEGY.md)
