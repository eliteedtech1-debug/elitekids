# EliteKids — Nursery Learning App (elitekids.com.ng)

Interactive learning app for **nursery-age children** (Creche → Primary), built as a
**stand-alone addon to EliteCore** — the same way `elite-cbt` (Computer Based Testing)
is an addon to the main school management system (SMS).

This package is the adjusted EliteKids plan (`EliteKids.zip`) re-architected to plug
into the Elite ecosystem:

- **Auth** — identical to elite-cbt: the addon API validates the same JWTs signed with
  the shared `JWT_SECRET_KEY`, reads the same `users` / `students` / `teachers` /
  `parents` tables in the main school DB, and issues its own login tokens. A teacher's
  or parent's existing EliteCore credentials work on elitekids.com.ng.
- **Branding** — identical school-skin approach: subdomain → `school_setup.short_name`
  → school crest/name/colors; the shared Yale-Blue (`#0F4D92`) login shell with a
  warmer, play-oriented EliteKids skin ("Elite Kids" wordmark, mascot-friendly panel).
- **Databases** — new tables do **not** go into the shared school DB. Content tables
  (`kids_lessons`, `kids_game_configs`, `kids_progress`, …) live in **`elite_content`**;
  the AI generation audit log lives in the **AI DB** (`AI_DB_NAME`; **`elite_bot`** on
  the current server — there is no `elite_ai`, see `01-PLANNING/09-DECISIONS-LOG.md`
  DEC-002); audit/messaging (optional) in **`elite_logs`**. Only additive, idempotent
  columns (e.g. `kids_stand_alone` module flag) touch `school_setup` in the main DB —
  via the dry-run-first migration runner.

## Reference implementation

**Mirror `elite-cbt` / `elite-cbt-api` wherever possible.** That repo pair is the
proven addon pattern: two-connection Sequelize (main DB + content DB), passport-jwt
auth against the shared secret, subdomain school resolution, `school_setup` module
flags, flagship-school seeder, dry-run-first migration runner. Do not invent a
parallel architecture — copy the working pieces and swap the domain.

| Concept | EliteCBT | EliteKids |
| --- | --- | --- |
| Frontend repo | `elite-cbt` (Vite + React + TS) | `elite-kids` (this package's `frontend/`) |
| Backend repo | `elite-cbt-api` (Express + Sequelize) | `elite-kids-api` (this package's `backend/`) |
| Domain | `<school>.elitecbt.com.ng` | `<school>.elitekids.com.ng` |
| Module flag | `school_setup.cbt_stand_alone` | `school_setup.kids_stand_alone` |
| Content tables | `cbt_*` in `elite_content` | `kids_*` in `elite_content` |
| AI audit tables | — | `kids_*` in AI DB (`elite_bot` on this server) |
| Flagship school | `SCH-ELITE` (Elite Practice Academy) | `SCH-KIDS` (Elite Kids Academy) |

## Read order (for the AI agent)

1. `PROJECT_STATE.md` — where the last session stopped (always read first)
2. `02-ELITE-INTEGRATION/01-AUTH-AND-TENANCY.md` — how auth/tenant resolution works
3. `02-ELITE-INTEGRATION/02-DATABASE-PLACEMENT.md` — which table lives in which DB
4. `02-ELITE-INTEGRATION/03-API-CONTRACT.md` — every endpoint the addon API exposes
5. `02-ELITE-INTEGRATION/04-MIGRATION-AND-DEPLOY.md` — idempotent migrations + deploy
6. `01-PLANNING/01-GAME-ENGINE-INTEGRATION-PLAN.md` — Phaser 3, data-driven games, 4 templates
7. `01-PLANNING/02-SYSTEM-ARCHITECTURE.md` — EliteCore addon architecture, component diagram
8. `01-PLANNING/03-EXECUTION-ROADMAP.md` — Sprint plan 0-6, task checklist
9. `01-PLANNING/04-AI-AGENT-ORCHESTRATION-GUIDE.md` — Agent operating guide
10. `01-PLANNING/05-TESTING-STRATEGY.md` — Automated + human QA
11. `01-PLANNING/06-BRANDING-AND-UIUX.md` — Brand colors, login design
12. `01-PLANNING/07-QA-INSTRUCTIONS.md` — Step-by-step QA instructions
13. `01-PLANNING/08-FINAL-PHASE-VIDEO-GAME-CONVERGENCE.md` — Long-term convergence plan
14. `01-PLANNING/09-DECISIONS-LOG.md` — Actual deviations from original plan
15. `01-PLANNING/10-VIDEO-ANIMATION-ARCHITECTURE-REVISION.md` — Animation rig system + implementation progress
16. `01-PLANNING/11-RISK-MITIGATION-AND-SAFETY.md` — Child safety architecture
17. `01-PLANNING/12-LEARNING-PROGRESSION-AND-ASSOCIATION-LADDER.md` — Tier model, distractor sizing, category modality maps, sequencing rules, game series
18. `01-PLANNING/13-PEDAGOGY-ENFORCEMENT-LAYER.md` — How Doc 12's rules get enforced at the GDL authoring/generation step
19. `01-PLANNING/14-PATTERN-TRACKING-AND-PARENT-TEACHER-INSIGHTS.md` — Descriptive learning-pattern signals for parents/teachers
20. `01-PLANNING/15-CURRICULUM-MAPPING-AND-CONTENT-LIBRARY-MODEL.md` — Library-first content model with ECE specialist validation
21. `01-PLANNING/16-GAMIFICATION-DEPTH-RETENTION-AND-ONBOARDING.md` — Retry logic, spaced repetition, reward equity, multilingual audio, session fatigue, interface onboarding
22. `01-PLANNING/17-ENGAGEMENT-AND-ACCESSIBILITY-LAYER.md` — Garden metaphor, companion character, offline mode, save/resume, parental controls, accessibility, feedback juice
23. `backend/`, `frontend/`, `game-engine/` — skeletons to fill in

## Status

This package is a **planning + scaffolding** drop: all documents are adjusted for the
EliteCore addon architecture, and the backend/frontend skeletons mirror the elite-cbt
reference structure with the EliteKids schema, migration runner and seeders in place.
No child-facing code exists yet — see `03-EXECUTION-ROADMAP.md` for the sprint plan.

## Security notes

- Never hardcode credentials (DB URLs, `JWT_SECRET_KEY`, B2 keys, AI API keys) — read
  from `process.env`, matching `backend/.env.example` / `frontend/.env.example`.
- The B2 application key that appeared in earlier planning chat is **compromised** —
  rotate it in the B2 console before this project touches real data.
- Every child-facing endpoint requires auth; every generated asset must be
  `published` before it can be returned to a child (see
  `01-PLANNING/11-RISK-MITIGATION-AND-SAFETY.md`).
