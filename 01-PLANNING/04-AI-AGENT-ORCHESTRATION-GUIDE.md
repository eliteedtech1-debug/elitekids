# AI Coding Agent — Operating Guide

## Session start protocol (do this before anything else, every session)
1. Read `PROJECT_STATE.md` at the package root — where the last session left off.
2. Read `01-PLANNING/09-DECISIONS-LOG.md` — where practical experience changed the
   plan, that log overrides the original design docs.
3. Read `02-ELITE-INTEGRATION/*` — auth/tenancy, DB placement, API contract,
   migration rules. These are the architecture constraints that differ from a
   standalone app.
4. Only then read the rest of `01-PLANNING/` and `03-EXECUTION-ROADMAP.md`.
5. Resume from the "Next task to start" noted in `PROJECT_STATE.md`.

## Session end protocol (do this before the session ends)
1. Update `PROJECT_STATE.md`: current status, in-progress/partial work, new blockers.
2. If anything deviated from the plan — a different library, a schema change, a
   skipped feature, a different approach — add an entry to `09-DECISIONS-LOG.md`.
   Every time, not just when you remember to.
3. This applies even if the session ends mid-task (context limit, user stop). An
   unfinished session that skips this breaks the next session's resume.

## Order of operations
1. Session start protocol.
2. Work through `03-EXECUTION-ROADMAP.md` top to bottom, one unchecked task at a time.
3. After finishing a task: write/run its test, check the box, commit `[Sprint N] <task>`.
4. If a task is ambiguous, make the smallest reasonable assumption, note it in the
   commit message **and** in `09-DECISIONS-LOG.md` if it's a real deviation, and
   continue — don't stall.

## Hard rules
- **Mirror the elite-cbt pair.** Auth, tenancy, migrations, CORS, flagship seeding:
  copy the working implementation from `elite-cbt-api` / `elite-cbt` and swap the
  domain (CBT → Kids). Do not redesign what already works.
- **Never hardcode credentials** (JWT_SECRET_KEY, DB URLs, B2 keys, AI API keys).
  Always `process.env`, matching `backend/.env.example`.
- **Never write Game Config / Scene Script JSON to a client without schema validation.**
- **No AI-generated content type ever produces raw/unbounded output that gets rendered
  directly** — everything is structured JSON validated against a schema.
- **No content reaches a child-facing query/screen unless `content_state='published'`**
  — enforce at the DB/API layer, not as an application convention. `recalled` removes
  instantly.
- **Every generated asset passes the pre-screen classifier and denylist filter**
  before entering the human review queue, and is written to the permanent audit log
  (AI DB `kids_content_generation_audit`) regardless of outcome.
- **Never invent a new game template** outside the four in the integration plan, or add
  a new character rig/background outside the approved asset library, without flagging
  it for human review first.
- **Every backend endpoint that touches child data needs an auth check** — no
  exceptions for "MVP speed."
- **Addon tables go in elite_content / the AI DB (AI_DB_NAME; `elite_bot` on this
  server), never in the shared school DB.**
  Shared DB changes are additive columns only, via `database/migrate.js` (dry-run
  first, backups before apply).

## Testing expectation
Run the relevant test suite after every task, not just at sprint end. A task is not
done until its test passes. See 05-TESTING-STRATEGY.md.

## Handoff to human QA
After each sprint, leave `SPRINT_N_NOTES.md` in the package root: what was built, what
was skipped/assumed, what a human should eyeball (age-appropriateness and content
judgment calls are the human's job, not the agent's).

## When stuck
If a task depends on an external credential, model access, or human decision you don't
have (e.g. the shared JWT_SECRET_KEY value, a pilot school's `kids_stand_alone=1`),
stop that task, log it in `SPRINT_N_NOTES.md` under "Blocked", and move to the next
independent task rather than guessing at production secrets or content policy calls.
