# EliteKids Database Environment Contract

**Status:** Phase 0 integration decision  
**Applies to:** EliteKids backend and its sibling EliteSMS integration  
**Priority:** Safety and source-of-truth contract

## 1. Canonical environment variables

| Variable | Production example | Development/test rule | Owner and use |
|---|---|---|---|
| `DB_NAME` | `elite_db` | Must resolve to `elite_db_test` or another `*_test` database | EliteSMS shared school database. EliteKids may retain read-only legacy access, but new bridge context comes from the EliteSMS API. |
| `KIDS_DB_NAME` | `elite_kids` | Must resolve to `elite_kids_test` or another `*_test` database | EliteKids-owned database. Every `kids_*` model, including lesson bridges and teacher observations, belongs here. |
| `CONTENT_DB_NAME` | `elite_content` | Must resolve to `elite_content_test` | Legacy compatibility variable for older scripts/configuration. It is not the target for new Kids models. |
| `AI_DB_NAME` | `elite_bot` | Must resolve to `elite_bot_test` | AI/audit database. Optional runtime capability; never a reason to use a live database in development. |

## 2. Mandatory behavior

1. Production may use the unsuffixed deployed names, subject to deployment secrets and permissions.
2. `NODE_ENV=development`, `NODE_ENV=test`, `JEST_WORKER_ID`, or `USE_TEST_DATABASES=true` activates isolation.
3. In isolation mode, configured values are normalized to end in `_test`. For example, `KIDS_DB_NAME=elite_kids` resolves to `elite_kids_test`.
4. An explicitly suffixed value remains unchanged.
5. `DB_NAME` and `KIDS_DB_NAME` must never resolve to the same database.
6. Test setup, migrations, seed scripts and destructive helpers must refuse empty, production or non-`*_test` targets unless a deliberately documented production operation explicitly opts in.
7. No credentials are stored in this document or committed environment files.

## 3. Ownership boundary

```text
EliteSMS / shared DB (DB_NAME)
  school, branch, students, DOB, classes, subjects,
  academic year, term, week and SMS lesson-plan/lesson-note context
                │
                │ server-to-server EliteSMS shared API
                ▼
EliteKids DB (KIDS_DB_NAME)
  kids lessons, game configs, game chains, bridges,
  observations, child gameplay and evidence
```

### Important distinction

EliteSMS's **lesson plan** and **lesson note/content** remain EliteSMS entities:

- `lesson_plans` describes the normal professional teaching plan.
- `lesson_notes` describes classroom delivery notes/content and references an SMS lesson plan where applicable.

EliteKids's **lesson bridge** is a separate Kids-owned translation layer. It may reference the authoritative SMS lesson ID and context, but it does not replace or overwrite an SMS plan/note. EliteKids owns the game/game-chain, playful delivery and Kids evidence.

## 4. Required configuration examples

### EliteKids production

```dotenv
DB_NAME=elite_db
KIDS_DB_NAME=elite_kids
CONTENT_DB_NAME=elite_content
AI_DB_NAME=elite_bot
```

### EliteKids development/test

```dotenv
NODE_ENV=development
DB_NAME=elite_db_test
KIDS_DB_NAME=elite_kids_test
CONTENT_DB_NAME=elite_content_test
AI_DB_NAME=elite_bot_test
```

The runtime resolver also protects a developer who accidentally leaves production names in a development `.env` by converting them to their `_test` counterparts. Test credentials should have access only to the test databases.

### EliteSMS development/test

```dotenv
NODE_ENV=test
DB_NAME=elite_db_test
CONTENT_DB_NAME=elite_content_test
AUDIT_DB_NAME=elite_logs_test
AI_DB_NAME=elite_bot_test
```

EliteSMS uses the same suffix policy for its own database connections. The two applications do not share a test database simply because they share production school data: use matching test fixtures in separate owned databases, and use the API contract for integration tests.

## 5. Implementation references

- EliteKids resolver: `backend/src/config/databaseNames.js`
- EliteKids Sequelize registry: `backend/src/models/index.js`
- EliteKids raw pools: `backend/src/config/database.js`
- EliteKids test environment: `backend/test/setup-env.js`
- EliteKids test fixture ownership: `backend/test/helpers/test-db.js`
- EliteSMS resolver: `../elite-sms/backend/src/config/databaseNames.js`
- EliteSMS test bootstrap: `../elite-sms/backend/scripts/testDatabase.js`
- EliteSMS Sequelize connections: `../elite-sms/backend/src/models/index.js`

## 6. Verification checklist

- [ ] Deployment environment sets `KIDS_DB_NAME` explicitly.
- [ ] Production service account can read/write only the required Kids database and read the shared DB as permitted.
- [ ] Every development/test database value ends in `_test`.
- [ ] EliteKids `kids_*` models resolve to `KIDS_DB_NAME`, not `CONTENT_DB_NAME`.
- [ ] EliteSMS shared API integration tests run against EliteSMS test fixtures.
- [ ] No bridge code adds a new direct shared-DB query.
- [ ] Production deployment is not tested against unsuffixed databases.
