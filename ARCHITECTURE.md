# 🏗️ Elite Suite — Ecosystem Architecture

**Last updated:** August 29, 2026

---

## What is Elite Suite?

**Elite Suite** is a modular ecosystem of integrated school management applications. Each app is **standalone** (can run independently) but **integrated** (cross-app SSO via shared JWT tokens).

The modular approach reduces bundle sizes, improves performance, and allows schools to adopt one app at a time.

---

## Naming Convention

| Name | What It Is |
|------|-----------|
| **Elite Suite** | The entire ecosystem of apps |
| **Elite SMS** | The main School Management System platform (formerly called "Elite Core") |
| **EliteCore** | **Former name** of Elite SMS — being phased out as the platform becomes modular |
| **EliteFin** | School Finance module — standalone app |
| **EliteCBT** | Computer-Based Testing module — standalone app |
| **EliteKids** | Gamified Nursery & Primary Content Delivery — standalone app |
| **EliteCampus** | University/College system — separate architecture |

> **Note:** `elitecore.com.ng` and `elitesms.com.ng` serve the **same codebase**. Elite SMS is the current name; EliteCore is the legacy name.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ELITE SUITE                                   │
│                  (Modular School Management)                         │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Elite SMS   │  │   EliteFin   │  │   EliteCBT   │              │
│  │  (Core App)  │  │  (Finance)   │  │   (Exams)    │              │
│  │              │  │              │  │              │              │
│  │  Port: 8383  │  │  Port: 3001  │  │  Port: 34567 │              │
│  │  systemd     │  │  systemd     │  │  systemd     │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                        │
│  ┌──────┴───────┐  ┌──────┴───────┐                                  │
│  │  EliteKids   │  │  EliteSMS    │                                  │
│  │ (KG/Nursery) │  │  (Reduced)   │                                  │
│  │              │  │              │                                  │
│  │  Port: 8484  │  │  Same code   │                                  │
│  │  systemd     │  │  as Elite SMS│                                  │
│  └──────┬───────┘  └──────────────┘                                  │
│         │                                                             │
│         └──────────────────────────────────────────────              │
│                    Cross-App SSO (JWT ?token=)                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Apps Overview

| App | Domain | Focus | Backend Port | Status |
|-----|--------|-------|-------------|--------|
| **Elite SMS** | `elitesms.com.ng` | School Management System | 8383 | ✅ Production |
| **EliteCore** | `elitecore.com.ng` | Same as Elite SMS (legacy name) | 8383 | ✅ Production |
| **EliteFin** | `elitefin.com.ng` | Finance & Billing | 3001 | ✅ Production |
| **EliteCBT** | `elitecbt.com.ng` | Exams & Testing | 34567 | ✅ Production |
| **EliteKids** | `elitekids.com.ng` | KG/Nursery Gamified Learning | 8484 | ✅ Production |
| **EliteCampus** | `elitecampus.com.ng` | Universities & Colleges | - | Separate system |

---

## Modular Design Philosophy

Each app in Elite Suite is **intentionally focused**:

| App | Why Separate? | Benefit |
|-----|--------------|---------|
| Elite SMS | Full platform for schools that need everything | Complete solution |
| EliteFin | Schools that only need fee management | Small bundle, fast |
| EliteCBT | Schools that only need testing | Independent deploy |
| EliteKids | Different UX paradigm (gamified learning) | Focused experience |
| EliteSMS | Reduced version of Elite SMS for smaller schools | Lightweight |

**Key principle:** Each app is small enough to understand deeply, but integrated enough to work together seamlessly.

---

## Cross-App Authentication (SSO)

All apps share the same JWT authentication system:

```
1. User logs into Elite SMS → JWT issued (signed with JWT_SECRET_KEY)
2. User clicks "Apps → EliteFin" → URL: elitefin.com.ng?token=<jwt>
3. EliteFin receives token → verifies with same JWT secret → auto-logged in
4. Same flow for EliteCBT, EliteKids
```

**Shared storage key:** `@@auth_token` in localStorage (same across all apps)

**Token verification:** Each backend validates JWT using the same `JWT_SECRET_KEY`

---

## Deployment Architecture

### VPS (62.72.0.209)

| Service | systemd Unit | Port | Memory |
|---------|-------------|------|--------|
| EliteFin | `elitefin.service` | 3001 | 512M |
| Elite API | `elite-api.service` | 8383 | 512M |
| EliteCBT API | `elite-cbt-api.service` | 34567 | 300M |
| EliteKids API | `elite-kids.service` | 8484 | 512M |
| EliteKids Web | `elite-kids-web.service` | 34601 | 256M |
| Actions Runner | `actions-runner.service` | - | - |

### go54 cPanel

| Domain | App |
|--------|-----|
| `elitecore.com.ng` | Elite SMS (frontend) |
| `elitecbt.com.ng` | EliteCBT (frontend) |

---

## Deployment Rules (NON-NEGOTIABLE)

1. **NO APP WITHOUT GITHUB ACTIONS** — Every app must have `.github/workflows/deploy-selfhosted.yml`
2. **NO PM2** — All services must use systemd
3. **NO MANUAL SSH DEPLOYMENTS** — All deploys via GitHub Actions self-hosted runner

See `/var/www/html/elite/DEPLOYMENT_RULES.md` for full rules.

---

## Repository Structure

```
elite-suite/                     # Monorepo root
├── ARCHITECTURE.md              # This file
├── elite-core/                  # Elite SMS (formerly EliteCore)
│   ├── src/                     # React + TypeScript + Vite
│   ├── .github/workflows/       # Deployment workflows
│   └── AGENTS.md                # AI agent instructions
├── elite-fees/                  # EliteFin
│   ├── elitefin/backend/        # Node.js + Express
│   ├── elitefin/frontend/       # React + TypeScript + Vite
│   └── docs/                    # Documentation
├── elite-cbt/                   # EliteCBT frontend
│   ├── src/                     # React + TypeScript + Vite
│   └── .github/workflows/       # Deployment workflows
├── elite-cbt-api/               # EliteCBT backend
│   ├── src/                     # Node.js + Express
│   └── .github/workflows/       # Deployment workflows
├── elite-kids/                  # EliteKids
│   ├── frontend/                # React + TypeScript + Vite
│   ├── backend/                 # Node.js + Express
│   ├── game-engine/             # Game logic
│   └── AGENTS.md                # AI agent instructions
├── elite-api/                   # Elite SMS backend (core API)
│   ├── src/                     # Node.js + Express + Passport
│   └── .github/workflows/       # Deployment workflows
└── bits/                        # DevOps scripts & configs
    ├── DEPLOYMENT_RULES.md      # Deployment rules
    ├── nginx/                   # Nginx configs
    ├── setup-actions-runner.sh  # Runner setup
    └── validate-deployment-rules.sh  # Compliance checker
```

---

## Port Registry

| Port Range | Purpose |
|------------|---------|
| 3000-3099 | EliteFin ecosystem |
| 8000-8099 | Elite SMS ecosystem |
| 8400-8499 | EliteKids ecosystem |
| 34500-34599 | EliteCBT ecosystem |
| 34600-34699 | Additional services |

---

*Elite Suite — Modular. Integrated. Focused.*
