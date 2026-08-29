# EliteKids — Gamified Nursery & Primary Content Delivery

> **🚀 Auto-Deploy**: Push to `production` remote → tests run → frontend builds → live.
> `git push production main` is all you need. Backend: systemd (`elite-kids-api.service`).

Interactive learning app for **nursery-age children** (Creche → Primary), built as a
**stand-alone addon to EliteCore** — the same way `elite-cbt` (Computer Based Testing)
is an addon to the main school management system (SMS).

> **EliteKids** is like Duolingo for formal education — teachers create learning games for KG, Nursery & Primary students. Evaluated by professional ECCE (Early Childhood Care & Education) teachers.

**Domain:** `elitekids.com.ng`
**Stack:** React + TypeScript + Vite + Tailwind (frontend) / Node.js + Express (backend)
**Backend Port:** 8484 | **Frontend Port:** 34601

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

- **Runner:** Self-hosted on VPS
- **Target:** VPS (`/var/www/html/elite-kids/`)
- **Workflow:** `.github/workflows/deploy-selfhosted.yml`
- **Services:**
  - `elite-kids.service` (systemd, port 8484) — Backend API
  - `elite-kids-web.service` (systemd, port 34601) — Frontend static server

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
**Backend Port:** 8484 | **Frontend Port:** 34601

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

- **Runner:** Self-hosted on VPS
- **Target:** VPS (`/var/www/html/elite-kids/`)
- **Workflow:** `.github/workflows/deploy-selfhosted.yml`
- **Services:**
  - `elite-kids.service` (systemd, port 8484) — Backend API
  - `elite-kids-web.service` (systemd, port 34601) — Frontend static server

## Documentation

- [Elite Suite Architecture](../ARCHITECTURE.md)
- [Deployment Rules](../bits/DEPLOYMENT_RULES.md)
- [AGENTS.md](./AGENTS.md) — AI agent instructions
- `team-docs/` — Development plans and decisions
- `docs/` — Architecture documentation

---

*EliteKids — Gamified Learning for Elite Suite*
