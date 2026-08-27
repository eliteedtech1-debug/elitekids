# PROGRESS — EliteKids Unified Project State

**Single source of truth for "where are we." Read fully before doing anything; update
before ending every session.**

**Last updated:** 2026-08-28
**Git sync:** Local ↔ Prod both at commit `1545b36`
**Sync method:** `git push production main` / `git pull production main`

---

## Current Status

- **Active sprint:** S8 — Hardening & Expansion
- **Last completed merge:** Orphan features restored, reports/briefs synced, git bidirectional
- **Production URL:** https://elitekids.com.ng
- **Production server:** 62.72.0.209 (Hostinger VPS)

---

## Feature Status Matrix

### Core Platform

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| Auth (login, JWT, multi-school) | ✅ LIVE | Sprint 1 foundation | 37/37 |
| Children CRUD + parent linking | ✅ LIVE | Parent engagement | 60/60 |
| Kids routes (lessons, progress, approvals) | ✅ LIVE | Content delivery | 80/80 |
| Media pipeline (B2 + BullMQ) | ✅ LIVE | Asset storage + processing | 124/124 |
| Frontend app shell (Vite + Tailwind v4) | ✅ LIVE | SPA foundation | Build green |

### Game Engine

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| 6 game templates (quiz, matching, tap, drag-sort, memory, fill-blank, puzzle) | ✅ LIVE | Multi-modal learning | Schema validated |
| Cross-modal learning (image→text) | ✅ LIVE | Visual → verbal reinforcement | 8/8 |
| Adaptive difficulty engine | ✅ LIVE | Personalized challenge level | Built + deployed |
| Spaced repetition scheduler | ✅ LIVE | Long-term retention | Built + deployed |
| Combo chains + rage meter | ✅ LIVE | Engagement multiplier | Built + deployed |
| Power-ups from practice | ✅ LIVE | Practice incentive | Built + deployed |
| Victory ceremony | ✅ LIVE | Celebration loop | Built + deployed |
| Sound effects (15 synthesized) | ✅ LIVE | Audio feedback | Built + deployed |

### Curriculum & Content

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| Jolly Phonics 10-week ladder | ✅ LIVE | Supervisor non-negotiable: authentic 42-sound structure | Seed verified |
| Subject code scheme (Eng-Phonics, Math-Numbers, Sci-Animals) | ✅ LIVE | Ministry-auditable labeling | 25/25 |
| Practice→Test gate | ✅ LIVE | Prevent skipping: complete ⟺ ≥1 practice AND ≥1 test ≥50% | 4/4 |
| NERDC curriculum mapping | ✅ LIVE | Nigerian education standard alignment | Built + deployed |
| Weekend Challenge | ✅ LIVE | Engagement spike on idle days | 6/6 |
| Animals/Numbers expansion seeds | ✅ LIVE | Content depth beyond U1-U4 | 50-char IDs |
| Curriculum points renumber | ⏳ TODO | Cosmetic: old PA-U{1..5} references | — |

### Engagement Layer (Phase 2+3)

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| Boss Battles "Guardians of the Storm" | ✅ LIVE | Epic competition mode, Nigerian mythology skin | 11/11 |
| Competition Engine (E5) | ✅ LIVE | Group tug-of-war + podium badges | 8/9 |
| Festival of Guardians (E6) | ✅ LIVE | Term-end mega event | Built + deployed |
| Parent Dashboard | ✅ LIVE | Mobile parent engagement | Built + deployed |
| Teacher Festival Manager | ✅ LIVE | Staff event scheduling | Built + deployed |
| Student Festival View | ✅ LIVE | Live guardian HP + battle CTA | Built + deployed |
| Sticker rewards | ✅ LIVE | Micro-incentives | Component deployed |

### Offline & Reliability (Phase 4)

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| Service Worker v3 (app-shell) | ✅ LIVE | Offline-first for spotty Nigerian internet | 8/8 |
| IndexedDB content cache (7d TTL) | ✅ LIVE | Repeat game loads without network | Built + deployed |
| Offline progress sync | ✅ LIVE | No silent data loss | Implemented |
| Storage budget guard (200MB ceiling) | ✅ LIVE | Prevent device fill | 7 unit tests |
| SW cache purge + bg-sync | ✅ LIVE | Fresh content without manual clear | Implemented |

### Realtime & Communication (Phase E)

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| WebRTC voice signaling (E4) | ✅ LIVE | Teacher speaks to remote class | 10/10 |
| Weekend push notifications (E3f) | ✅ LIVE | Re-engagement on idle days | 6/6 |
| Live class voice (Phase 0) | ✅ LIVE | Async voice notes ≤90s | Built + deployed |
| TURN server (coturn) | ⏳ BLOCKED | Needs sudo on VPS | Config ready |
| 2-way voice (per-child unmute) | ⏳ TODO | Phase 1 after TURN | — |

### Internationalization (i18n)

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| Single dictionary + tN() plurals | ✅ COMPLETE | Foundation for all translations | Integrity tests |
| P0: Infrastructure | ✅ COMPLETE | Registry, locale store, TTS abstraction | Vitest suite |
| P1: Teacher surfaces (132 strings) | ✅ COMPLETE | English extraction | Key-resolution gate |
| P2: Student surfaces (145 strings) | ✅ COMPLETE | English extraction | Key-resolution gate |
| P3: Locales + RTL + adaptive | ✅ COMPLETE | Hausa + RTL layout | Build green |
| Expanded Hausa locale (~890 keys) | ✅ DEPLOYED | Full student + parent + gameplay | Merged to prod |
| Arabic/Yoruba locales | ⏳ TODO | Future localization | — |
| English locale on prod | ❌ NOT DEPLOYED | i18n commits never pushed until now | — |

### Phonics TTS

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| PHONICS_SOUND_MAP (42 sounds) | ✅ RESTORED | TTS reads "sss" not "ess" | — |
| speakPhonicsSound() | ✅ RESTORED | Correct phonics pronunciation | — |
| toPhonicsSound() conversion | ✅ RESTORED | Grapheme → spoken sound | — |
| category-aware speakLabel() | ✅ RESTORED | Letters category routes to phonics TTS | — |

### Performance

| Feature | Status | Rationale | Tests |
|---|---|---|---|
| Lazy route-split (GamePlay isolated) | ✅ DONE | Main bundle 520KB→363KB | Build verified |
| Emoji tree-shaking | ✅ DONE | Reduce bundle size | Verified |
| Storage budget (80% soft / 200MB hard) | ✅ DONE | Prevent device fill | 7 unit tests |

---

## Environment State

- [x] `backend/.env` — JWT_SECRET_KEY = prod shared secret
- [x] `frontend/.env` — VITE_API_URL empty (nginx proxy)
- [x] MySQL (elite_db + elite_content + elite_bot) — verified via tunnel
- [x] Redis 8.10 on :6379 — media + generation queues live
- [x] WebRTC signaling (LIVE_WEBRTC=1)
- [x] VAPID keys for push notifications
- [ ] B2 application key rotated (old one exposed — see README)
- [ ] TURN server installed (coturn config ready, needs sudo)
- [ ] CI pipeline configured (optional)

---

## Active Blockers

| Blocker | Since | Impact |
|---|---|---|
| coturn needs sudo on VPS | Aug 25 | TURN fallback only; WebRTC works with STUN but fails behind CGNAT (Nigerian mobile ISPs) |
| B2 app key exposed in chat | Aug 17 | Security — needs rotation |
| GitHub SSH key not registered | Aug 28 | Can't push to GitHub from this machine |

---

## Deviations from Original Design

Full log in `01-PLANNING/09-DECISIONS-LOG.md`. Summary:

- DEC-001 — addon architecture (shared JWT + shared school DB; addon tables in elite_content/elite_ai)
- DEC-002 — B2 buckets renamed `elite-kids-*`
- DEC-003 — Boss mode does NOT satisfy practice+test gate (jest-proven)
- DEC-004 — Original Nigerian mythology skin for boss battles (zero Sony IP)
- DEC-005 — JP purity: Sound Match Bank moved OUT of ladder to practice bank

---

## Sprint History

### S1 — Core Services (Aug 17)
- Auth, children CRUD, media pipeline, Redis workers, frontend shell
- 124/124 tests green

### B1-B3 — Baseline & Hardening (Aug 22-23)
- Asset baseline, test matrix expansion, media repair
- Full suite: 295 pass / 9 pre-existing fail

### D — Content Factory (Aug 23)
- Content creation pipeline, form obstacles, topic matrix

### C — Test Expansion (Aug 23)
- CI gate, regression suites, pre-existing failure catalog

### E1 — NERDC & Offline (Aug 24)
- Curriculum codes, offline progress fix, recon

### E2 — Offline Hardening (Aug 24)
- Review verdict, offline content cache, SW hardening

### E3 — Curriculum & Flow (Aug 24)
- Practice→Test gate, JP 10-week ladder, offline gameplay, weekend challenge
- Phone smoke 6/6 PASS, offline smoke 8/8 PASS

### E4 — Live Voice (Aug 24-25)
- WebRTC signaling, coturn config, teacher voice broadcast
- 10/10 signaling tests PASS

### E5 — Competition Engine (Aug 25)
- Tug-of-war, rubber-band ×1.15, podium badges, analytics hook
- 8/9 smoke PASS

### E6 — Boss Battles (Aug 25)
- "Guardians of the Storm" — Nigerian mythology skin
- 11/11 tests PASS

### P2-P3 — Fun Engine & Festival (Aug 24-25)
- Sound effects, combo chains, power-ups, victory ceremony
- Festival of Guardians, parent dashboard, teacher festival manager

### P4 — Roadmap Batch (Aug 25)
- Offline progress fix, NERDC codes, lazy routes, storage budget, SW v3, i18n seam

### S8 — Hardening & Expansion (Aug 26)
- i18n P0-P3 (12 commits), RTL, adaptive layout
- Content expansion seeds, renumber script, continuity audit
- Error code standardization across all endpoints

### Merge — Reconciliation (Aug 28)
- Restored orphan features from prod
- Pulled 51 reports + 12 briefs from prod
- Git bidirectional sync established
- Unified PROGRESS.md created

---

## Next Up

- [ ] Deploy i18n frontend bundle to prod (local has it, prod doesn't)
- [ ] E4 Phase 2: Install coturn TURN server (needs sudo)
- [ ] Animals/Numbers 10-week ladder (supervisor authorization pending)
- [ ] Curriculum points renumber (cosmetic: old PA-U{1..5} refs)
- [ ] Add SSH key to GitHub for origin push
- [ ] Clean up 47 .bak files on prod
- [ ] B2 application key rotation

---

## Session Log

_(append one short entry per work session — do not delete old entries, this is the audit trail)_

```
2026-08-17 — Package generated: EliteKids.zip plan studied, ecosystem (elite-cbt /
  elite-cbt-api / elite-core / elite-api) studied, all planning docs adjusted for the
  EliteCore addon architecture, backend/frontend skeletons + game-engine schemas +
  infra added. No runnable code written yet.

2026-08-17 — Prod wiring + confirmations: backend/.env wired to real DBs (elite_db /
  elite_content / elite_bot via SSH tunnel), dry-run migration verified (no changes
  applied), AI DB confirmed elite_bot (no elite_ai) and JWT_SECRET_KEY confirmed
  shared; .env.example + DEC-002 updated. Smoke boot + shared-JWT verify-token ok.

2026-08-17 — Sprint 1 (auth + school port): extracted testable src/app.js; ported
  /users/login (parents + multi-school selection), /students/login, /superadmin-login,
  /verify-token, forgot/reset password, /auth/select-school, /schools/get-details,
  /schools/check-shortname. Added Jest/Supertest integration suite against hermetic
  local elite_kids_test DB (fixtures + global setup + teardown). 37/37 green.

2026-08-17 — Sprint 1 (children CRUD): GET one, PUT update, DELETE soft delete,
  POST /kids/children/link parent self-service linking. Suite grew to 60/60.

2026-08-17 — Kids routes tests + persistent boot: POST /kids/lessons, GET /kids/lessons/:id/game,
  progress (game-complete idempotency + child summary + student data-scoping 403),
  approvals (pending queue, school scoping, decide approve/reject state flips).
  Suite now 80/80.

2026-08-17 — Media module finished: B2 client + BullMQ queue, 42 tests + generation.worker
  regression. Fixed 3 real bugs (graceful queue degradation, wrong queue import,
  leaked Redis connection). Suite now 124/124 in-band.

2026-08-17 — Frontend app shell scaffolded: index.html, Tailwind v4, router, AuthGuard,
  Dashboard. Login fetches school crest/name from short name (onBlur).
  npm run build green.

2026-08-17 — Redis + workers live: installed redis, started media-worker + generation-worker.
  Fixed generation.worker wrong queue import + leaked Redis connection in Jest teardown.

2026-08-17 — Login branding fix: school short-name input resolves real school_id on onBlur.
  Verified with headless Chrome CDP test.

2026-08-22 — Multimodal game engine + manual lesson creator + smart blank sizing.
  Cross-modal learning (image→text) for tap-recognition and quiz games.

2026-08-22 — Jolly Phonics Adventure series seed: 5 units × 3 games = 15 lessons/configs
  across Creche→Primary, domain-labeled, prerequisite-chained.

2026-08-22 — Parent registration + login (phone & email).

2026-08-22 — Iconic level-up victory fanfare + text-only SUPER STAR celebration.

2026-08-22 — Fixed all Jolly Phonics games to >=5 questions, added memory-pairs template.

2026-08-23 — Fixed kids_mode_locks queries (dedicated kids DB connection).

2026-08-24 — E3-OFFLINE + E3f GATE + JP 10-WEEK LADDER: all live.
  Offline gameplay (8/8 PASS), Practice+Test gate (4/4 PASS),
  Jolly Phonics full term ladder (10 units, 52 published lessons).

2026-08-24 — E3f-FLOW: Learn→Practice→Test loop fixed + Weekend Challenge live.

2026-08-24 — E3f-PUSH: Weekend notifications live (VAPID web-push).

2026-08-24 — Phase 2+3: Fun Engine + Parent Dashboard + Festival of Guardians deployed.

2026-08-25 — E5 Competition Engine: rubber-band, podium badges, analytics hook. 8/9 PASS.

2026-08-25 — E6 Boss Battles: "Guardians of the Storm" — 11/11 PASS.

2026-08-25 — E4 WebRTC Voice Phase 1: signaling 10/10 PASS.

2026-08-25 — P4 Roadmap: offline fix, NERDC codes, lazy routes, storage budget, SW v3.

2026-08-25 — i18n P0-P3: 12 commits, single dictionary, tN() plurals, teacher/student
  extraction, Hausa locale, RTL, adaptive layout.

2026-08-26 — Sprint 8: hardening, expansion, error code standardization.

2026-08-28 — MERGE: Reconciled local + prod. Restored orphan features (phonics TTS,
  StickerButton, ParentDashboard, BossBattleOverlay, category field, expanded Hausa).
  Pulled 51 reports + 12 briefs. Git bidirectional sync established.
  Fixed deploy.sh path, production remote, .gitignore.
```
