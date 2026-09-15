# EliteKids — Gamified Nursery & Primary Content Delivery

> **🚀 Auto-Deploy**: `git push origin main` → backend tests run → frontend rebuilds → live.
> Pushing `main` to `origin` is all you need (`origin` is the only remote — there is no
> `production` remote). Backend: systemd user unit `elite-kids-api.service`; frontend:
> nginx serves the `frontend/dist` release.

Interactive learning app for **nursery-age children** (Creche → Primary), built as a
**stand-alone addon to EliteCore** — the same way `elite-cbt` (Computer Based Testing)
is an addon to the main school management system (SMS).

> **EliteKids** is like Duolingo for formal education — teachers create learning games for KG, Nursery & Primary students. Evaluated by professional ECCE (Early Childhood Care & Education) teachers.

**Domain:** `elitekids.com.ng`
**Stack:** React + TypeScript + Vite + Tailwind (frontend) / Node.js + Express (backend)
**Backend Port:** 8484 | **Frontend:** nginx serves `frontend/dist` on 443 (`34601`/`5173` are dev-only)

---

## What is EliteKids?

EliteKids is the **early childhood education arm** of Elite Suite:

- 🎮 **Gamified Learning** — Content delivered through games, not textbooks
- 👩‍🏫 **Teacher-Created Games** — Teachers build learning games using the platform
- 📚 **NERDC Curriculum Aligned** — Content follows Nigerian national curriculum
- 🎓 **ECCE Evaluated** — Evaluated by professional Early Childhood Care & Education teachers
- 🌱 **Progress Garden** — Visual progress tracking system for young learners

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

## Cross-App Integration

EliteKids receives JWT tokens from Elite SMS via the `?token=` URL parameter:

```
Elite SMS → Apps → 👶 EliteKids → elitekids.com.ng?token=<jwt>
```

- Token handler in `Login.tsx` extracts `?token=`, verifies with backend, routes to dashboard
- Has own login for standalone access (Teacher/Parent modes)
- Requires `kids_stand_alone >= 1` in school subscription

## Quick Start

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev
```

## Deployment

- **Trigger:** `git push origin main` (or `workflow_dispatch`)
- **Runner:** self-hosted on this VPS (`elitekids-runner.service`)
- **Target:** this checkout — `/var/www/html/elite/elite-kids`
- **Workflow:** `.github/workflows/deploy.yml`
- **Services:**
  - `elite-kids-api.service` (systemd user unit, port 8484) — backend API
  - nginx (system, 443) — serves the frontend release `frontend/dist`
  - `kids-web.service` (vite on 5173) — local dev only

## Documentation

- [Elite Suite Architecture](../ARCHITECTURE.md)
- [Deployment Rules](../bits/DEPLOYMENT_RULES.md)
- [AGENTS.md](./AGENTS.md) — AI agent instructions
- `team-docs/` — Development plans and decisions
- `docs/` — Architecture documentation

---

*EliteKids — Gamified Learning for Elite Suite*

---

# EliteKids — Gamified Nursery & Primary Content Delivery

**Part of the [Elite Suite](../ARCHITECTURE.md) ecosystem**

> **EliteKids** is like Duolingo for formal education — teachers create learning games for KG, Nursery & Primary students. Evaluated by professional ECCE (Early Childhood Care & Education) teachers.

**Domain:** `elitekids.com.ng`
**Stack:** React + TypeScript + Vite + Tailwind (frontend) / Node.js + Express (backend)
**Backend Port:** 8484 | **Frontend:** nginx serves `frontend/dist` on 443 (`34601`/`5173` are dev-only)

---

## What is EliteKids?

EliteKids is the **early childhood education arm** of Elite Suite:

- 🎮 **Gamified Learning** — Content delivered through games, not textbooks
- 👩‍🏫 **Teacher-Created Games** — Teachers build learning games using the platform
- 📚 **NERDC Curriculum Aligned** — Content follows Nigerian national curriculum
- 🎓 **ECCE Evaluated** — Evaluated by professional Early Childhood Care & Education teachers
- 🌱 **Progress Garden** — Visual progress tracking system for young learners

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

## Cross-App Integration

EliteKids receives JWT tokens from Elite SMS via the `?token=` URL parameter:

```
Elite SMS → Apps → 👶 EliteKids → elitekids.com.ng?token=<jwt>
```

- Token handler in `Login.tsx` extracts `?token=`, verifies with backend, routes to dashboard
- Has own login for standalone access (Teacher/Parent modes)
- Requires `kids_stand_alone >= 1` in school subscription

## Quick Start

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev
```

## Deployment

- **Trigger:** `git push origin main` (or `workflow_dispatch`)
- **Runner:** self-hosted on this VPS (`elitekids-runner.service`)
- **Target:** this checkout — `/var/www/html/elite/elite-kids`
- **Workflow:** `.github/workflows/deploy.yml`
- **Services:**
  - `elite-kids-api.service` (systemd user unit, port 8484) — backend API
  - nginx (system, 443) — serves the frontend release `frontend/dist`
  - `kids-web.service` (vite on 5173) — local dev only

## Documentation

- [Elite Suite Architecture](../ARCHITECTURE.md)
- [Deployment Rules](../bits/DEPLOYMENT_RULES.md)
- [AGENTS.md](./AGENTS.md) — AI agent instructions
- `team-docs/` — Development plans and decisions
- `docs/` — Architecture documentation

---

*EliteKids — Gamified Learning for Elite Suite*
