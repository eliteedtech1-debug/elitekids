# System Architecture

EliteKids is a **stand-alone addon** to the EliteCore school management system — the
same architecture as EliteCBT. It reuses the ecosystem's auth, tenancy and databases
instead of standing up its own silo.

## Stack
- **Backend (`backend/`, elite-kids-api):** Node.js + Express + Sequelize (mirrors
  `elite-cbt-api`), passport-jwt, rate limiting, helmet.
- **Frontend (`frontend/`, elite-kids):** React + TypeScript + Vite (mirrors
  `elite-cbt`), Tailwind, Redux/zustand for auth state, axios client with auth + tenant
  interceptors.
- **Game rendering:** Phaser 3 mounted inside a React wrapper component.
- **Queue:** BullMQ + Redis (media processing, AI game-config generation jobs).
- **Storage:** Backblaze B2 (S3-compatible), private buckets `elite-kids-{bot,doc,media}-files`.
- **AI:** External LLM API (lesson/story/game-config/scene-script generation) — pinned
  model versions, structured JSON output only.
- **DB:** MySQL — shared school DB (`elite_db`) **read/use only**; addon tables in
  `elite_content` + the AI DB (see `02-ELITE-INTEGRATION/02-DATABASE-PLACEMENT.md`).

## Component diagram (text form)
```
┌────────────────────────────── Elite ecosystem ─────────────────────────────┐
│  elite-core (SMS SPA)  ──┐                                                 │
│  elite-api (SMS API) ────┤ shared JWT (JWT_SECRET_KEY)                     │
│  elite_db (users, students, teachers, parents, school_setup)               │
└─────────────────────────────────────────────────────────────────────────────┘

Teacher/Parent/Child (elitekids.com.ng)
        │  (subdomain → school, shared-JWT auth)
        ▼
API Gateway (elite-kids-api, Express)
   ├── Auth Service        → shared DB (users/students/parents) + JWT
   ├── Lesson Service      → elite_content.kids_lessons
   ├── AI Content Orchestrator → LLM (pinned models) → Game Config JSON / Scene Script JSON
   │                            → schema-validate → pre-screen + denylist → audit (AI DB)
   ├── Media Job Queue     → BullMQ/Redis → sharp → B2 elite-kids-media-files
   ├── Review Service      → elite_content.kids_content_approvals (human gate)
   └── Progress Service    → elite_content.kids_progress

Child/Play View (React + Phaser GameEngine)
   ├── fetches published Game Config JSON (only content_state='published')
   ├── resolves signed asset URLs from B2
   ├── renders scene via matching template
   └── emits game:complete → Progress Service (idempotent)
```

## Data flow: "generate a game for this lesson"

> **Superseded by Doc 13 — Pedagogy Validator gate added between step 3 and step 4**
> 
> The flow below is missing the Pedagogy Validator (Doc 13) which runs BEFORE
> the Content State Machine. AI-generated GDL must pass tier/distractor validation
> before entering the safety pipeline. See Doc 13 for the full pipeline diagram.

1. Teacher (elite-core credentials) creates a lesson in elite-kids → `kids_lessons`
   row, `content_state='generated'`.
2. AI Content Orchestrator calls generators that return **structured JSON only** —
   Game Config JSON / Scene Script JSON. Never raw/unbounded output.
3. Backend validates JSON against `game-engine/schemas/*.schema.json`, runs the safety
   pipeline (pre-screen classifier → denylist filter), and writes the permanent audit
   row to the AI DB (`kids_content_generation_audit`; `elite_bot` on this server) regardless of outcome.
4. Passed content → `content_state='pending_human_review'`; failed → auto-rejected +
   logged.
5. Referenced assets are processed (sharp) and pushed to `elite-kids-media-files` under
   `games/<lessonId>/`.
6. A teacher approval flips state to `approved` → `published`. **Only `published`
   content is ever returned by child-facing queries** (WHERE clause enforced).
7. Frontend Play View requests published content, mounts the Phaser scene, plays.
8. On completion, progress is persisted; teacher + parent dashboards read the same
   Progress Service.

## Security notes
- All buckets are private; the API returns short-lived signed URLs only.
- B2/AI/JWT credentials live only in server-side env vars, never in frontend bundles.
- The B2 application key exposed during earlier planning must be rotated before any
  real data is stored.
- Every endpoint touching child data requires auth; the content state machine is
  enforced at the DB/API layer, not by convention.
