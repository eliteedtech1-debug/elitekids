# Execution Roadmap — Task Checklist

Work top to bottom. Each task = one commit. Do not start a task whose dependencies are
unchecked. Every task needs a test before it's marked done (see 05-TESTING-STRATEGY.md).
**All auth/DB/deploy work follows `02-ELITE-INTEGRATION/*`; reference `elite-cbt` /
`elite-cbt-api` for the proven pattern.**

## Sprint 0 — Repo & environment (mirror elite-cbt pair)
- [ ] Initialize `backend/` (Node + Express + Sequelize, port 34600) and `frontend/`
      (Vite + React + TS) workspaces from the provided skeletons
- [ ] Fill `backend/.env` from `.env.example`; confirm `JWT_SECRET_KEY` matches elite-api
- [ ] Docker-compose: MySQL + Redis for local dev (see `infra/`)
- [ ] Migrations: `node backend/database/migrate.js` dry-run reviews clean; `--apply`
      adds `school_setup.kids_stand_alone` + `kids_url`, creates `kids_*` tables in
      elite_content and the AI DB (elite_bot)
- [ ] Boot: flagship `SCH-KIDS` school + admin seeded idempotently; `/health` responds
- [ ] CI stub: lint + test on push (optional but recommended)
- [ ] Parallel track (design): commission/license the character rig + background asset
      library (see 10-VIDEO-ANIMATION-ARCHITECTURE-REVISION.md) — must land before
      Sprint 2 scene-script work

## Sprint 1 — Core services (no game engine yet)
- [x] Auth routes ported from elite-cbt-api (`/users/login` incl. parents,
      `/students/login`, `/verify-token`, forgot/reset password, `/auth/select-school`)
      — covered by Jest/Supertest integration suite (37/37)
- [x] School lookup + subdomain tenancy (`/schools/get-details`, `/schools/check-shortname`,
      flagship alias resolution) — covered by integration suite + prod smoke
- [x] `kids_children` CRUD + parent↔child linking (shared `students` table lookups)
      — list/get/create/update/soft-delete + parent self-service `/kids/children/link`
      with ownership checks; covered by Jest integration suite
- [x] Lesson Service CRUD API (`kids_lessons`) — create + published-game gate,
      progress (idempotent game-complete + child summary), and approval workflow
      (review queue + decide flipping config/lesson to published) — covered by
      Jest/Supertest integration suite (80/80 total)
- [ ] B2 client module (reuse `elite-api` s3Client pattern / lms media-service), env-var
      driven, no hardcoded keys
- [ ] BullMQ media queue + worker (reuse elite-cbt / lms-stack pattern)

## Sprint 2 — Content Config Generator

> **Superseded by Docs 12, 13 — GDL schema must include tier/category/item_id; Pedagogy Validator required**
> 
> Sprint 2 must now include: (a) tier-aware GDL schema with `category`/`tier`/`item_id`
> as required fields (Doc 13, Rule 1), (b) Pedagogy Validator that enforces sequential
> unlock (Rule 2), distractor constraints (Rule 3), and orphan detection (Rule 5),
> (c) Game Series / Unit Sequencing support (Doc 12). See Doc 13 for full validation
> rules and Doc 12 for the Association Ladder model.

- [ ] JSON Schemas for all 4 templates: `matching`, `tap-recognition`, `drag-sort`,
      `quiz` (see `game-engine/schemas/` — matching is done)
- [ ] JSON Schema for `scene-script` (video/animation — see 10-VIDEO-ANIMATION-ARCHITECTURE-REVISION.md)
- [ ] AI prompt + service returning Game Config JSON / Scene Script JSON for a lesson
      (pinned model versions; structured output only)
- [ ] Schema validation layer with retry-then-fallback-template behavior
- [ ] Content state machine enforced at DB/API layer
      (`generated → pre_screened → pending_human_review → approved → published`;
      `recalled` for incidents)
- [ ] Pre-screen classifier pass (age-appropriateness, safety, curriculum alignment)
- [ ] Deterministic denylist filter (version-controlled, seeded, auditable)
- [ ] Permanent audit log writes to the AI DB (`kids_content_generation_audit`; `elite_bot` on this server)
- [ ] `GET /kids/lessons/:id/game` + `GET /kids/lessons/:id/scenes` (published only)

## Sprint 3 — Game Engine (frontend)

> **Superseded by Docs 16, 17 — Interface Onboarding, retry logic, and garden/companion must be included**
> 
> Sprint 3 must now include: (a) Interface Onboarding sequence before first lesson
> (Doc 16, §6), (b) retry/adaptive difficulty logic for Test-mode failures (Doc 16, §1),
> (c) garden progress metaphor and companion character (Doc 17, §§1–2). See Doc 16 for
> the recommended build order and Doc 17 for the engagement layer design.

- [ ] Install Phaser 3; `GameEngine` React wrapper (mounts/unmounts cleanly)
- [ ] `MatchingScene`, `TapRecognitionScene`, `DragSortScene`, `QuizScene`
- [ ] Loader: fetch Game Config JSON → resolve signed asset URLs → boot scene by template
- [ ] Emit `game:complete` with score/stars/xp

## Sprint 4 — Rewards & progress
- [ ] Progress Service API: record `game:complete` (idempotent)
- [ ] Teacher dashboard: per-lesson game completion/engagement
- [ ] Parent dashboard: child's stars/badges/XP

## Sprint 5 — Asset pipeline hardening
- [ ] All game images through sharp resize/compress before B2 upload
- [ ] `games/<lessonId>/` prefix convention in media bucket
- [ ] Signed URL expiry tuned for gameplay session length

## Sprint 6 — QA & pilot readiness
- [ ] Automated test suite green (unit + integration + e2e)
- [ ] Human QA pass on 5 demo lessons (age-appropriateness, difficulty, timing)
- [ ] Cost tracking: log AI + storage cost per generated game
- [ ] Staged rollout gating logic (sandbox tier → general availability threshold)
- [ ] Incident response runbook written and reviewed by a human
- [ ] AI provider model versions pinned; eval suite run against pinned versions
- [ ] Demo script: KG1 "Animals Around Us" — lesson → matching game → quiz, end to end
      on a pilot school (kids_stand_alone=1)

## Explicitly out of scope this phase
- Voice-interaction games
- Multiplayer
- Native mobile packaging

## After Sprint 6
See 08-FINAL-PHASE-VIDEO-GAME-CONVERGENCE.md — video + games converge (game checkpoints
inside video lessons, spaced repetition, adaptive difficulty, story continuity). Do not
start before Sprint 6 is signed off with real pilot data.
