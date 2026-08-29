# SLAVE PROTOCOL — READ FIRST (non-negotiable)

> **⚠️ AUTO-DEPLOY ACTIVE** — `git push production main` triggers:
> 1. Backend tests (run-tests.sh)
> 2. Frontend build (rebuild-frontend.sh)
> 3. Nginx serves new dist/ automatically
>
> **Do NOT manually rebuild or restart.** Just push. Deploy logs: `team-docs/reports/deploy-*.log`
> Backend runs on systemd (`elite-kids-api.service`), NOT pm2.

You operate as a SLAVE agent under a single off-box MASTER (team lead via SSH dispatch).
1. Execute ONLY the dispatched brief/scope. No self-assigned missions, no refactors beyond brief.
2. CHECKPOINT after every step: one line (timestamp + done-what) to team-docs/reports/<phase>-progress.md.
3. NEVER open .env with Read/file tools — bash grep/cut only.
4. Small tool calls. No blocking waits >60s. No git push unless brief explicitly orders it.
5. All artifacts/plans/status/temp files go inside elite-kids/team-docs/ (or repo paths per brief). Never /root, never scatter.
6. On completion or block: write final status line to your progress file and STOP. Master polls reports async.
7. DB: read-only by default; writes only where brief authorizes; never ALTER schema without explicit order.
8. Idle is forbidden: if brief exhausted, append IDLE:blocked-reason to progress file and stop.
9. MEMORY IS EPHEMERAL (security policy): chat history is purged continuously — this server is SHARED between startups and only elite may run AI agents. Persist ALL knowledge into team-docs files DURING the run; assume your session will vanish. Never reference past session IDs.
10. ZERO-IDLE (C5/C7): on finishing your brief, IMMEDIATELY claim the next QUEUED row in team-docs/QUEUE.md matching your role (worker=phase*, advisor=fb-review read-only), mark it RUNNING with your name + timestamp, and proceed. Append a milestone line to your progress report at EVERY meaningful checkpoint, not just completion.


---

# EliteKids — AI Agent Instructions

## What Is This App?

**EliteKids** is the Gamified Nursery & Primary Content Delivery module in the **Elite Suite** ecosystem. It's like Duolingo for formal education — teachers create learning games for KG, Nursery & Primary students.

**Domain:** `elitekids.com.ng`
**Stack:** React + TypeScript + Vite + Tailwind (frontend) / Node.js + Express (backend)
**Backend Port:** 8484 | **Frontend Port:** 34601

## What Makes EliteKids Special

- **Gamified Learning** — Content delivered through games, not textbooks
- **Teacher-Created Games** — Teachers build learning games using the platform
- **NERDC Curriculum Aligned** — Content follows Nigerian national curriculum
- **ECCE Evaluated** — Evaluated by professional Early Childhood Care & Education teachers
- **Progress Garden** — Visual progress tracking system for young learners

## Role in Elite Suite

EliteKids is the **early childhood education arm** of Elite Suite:
- Gamified content delivery for KG, Nursery, and Primary
- Teacher game creation tools
- Parent and teacher dashboards
- Progress tracking and analytics

## Cross-App Integration

- **Receives JWT** from Elite SMS via `?token=` URL parameter
- **Token handler** in `Login.tsx` extracts `?token=`, verifies with backend, routes to dashboard
- **Has own login** for standalone access (Teacher/Parent modes)
- **Requires** `kids_stand_alone >= 1` in school subscription

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/Login/Login.tsx` | Login + `?token=` handler |
| `frontend/src/components/AuthGuard.tsx` | Route protection |
| `frontend/src/lib/utils/constants.ts` | Shared storage keys |
| `frontend/src/lib/utils/school.ts` | School context utilities |
| `frontend/src/lib/api/endpoints.ts` | API endpoints |
| `backend/src/index.js` | Backend entry point |

## Architecture

```
elite-kids/
├── frontend/                    # React + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── pages/               # Page components
│   │   ├── components/          # Shared components
│   │   └── lib/                 # Utilities & API
│   └── dist/                    # Built frontend
├── backend/                     # Node.js + Express
│   ├── src/
│   │   ├── index.js             # Entry point
│   │   └── routes/              # API routes
│   └── uploads/                 # Game assets
├── game-engine/                 # Game logic & scenes
├── team-docs/                   # Development docs
└── docs/                        # Architecture docs
```

## Deployment

- **Runner:** Self-hosted on VPS (62.72.0.209)
- **Target:** VPS (`/var/www/html/elite-kids/`)
- **Workflow:** `.github/workflows/deploy-selfhosted.yml`
- **Services:** 
  - `elite-kids.service` (systemd, port 8484) — Backend API
  - `elite-kids-web.service` (systemd, port 34601) — Frontend static server

## Rules

1. No PM2 — use systemd
2. No manual deployments — use GitHub Actions
3. JWT secret must match Elite SMS (`JWT_SECRET_KEY`)
4. All knowledge must be persisted to `team-docs/` files
5. Never reference past session IDs (memory is ephemeral)

---

*EliteKids — Gamified Learning for Elite Suite*
