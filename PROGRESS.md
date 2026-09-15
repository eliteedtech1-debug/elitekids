# PROGRESS — EliteKids Unified Project State

**Single source of truth for "where are we." Read fully before doing anything; update
before ending every session.**

**Last updated:** 2026-09-15
**Git sync:** `origin/main` = `8fc1e11` (live release `20260915T151254Z-8fc1e11`); local is
**ahead 1** with `b8fef89` (read-only walk harness) deliberately unpushed — pushing it would
re-run the full gate + publish for a docs/harness-only change.
**Sync method:** `git push origin main` / `git pull origin main` — pushing `main` IS the
 deploy (`.github/workflows/deploy.yml`); there is no `production` remote

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

### Student Experience & Deploy (2026-09-10 → 09-15)

| Feature | Status | Rationale | Evidence |
|---|---|---|---|
| 5-tab student dashboard (HOME/PLAY/LEARN/REVIEW/ME) | ✅ DEPLOYED | Zero overlap: one branch per tab key, no fallback `else` | 22 AST tests, live walk 0 errors (`ad6dbbb`, `7120fbe`) |
| PLAY sectioned by subject in unit order | ✅ DEPLOYED | Flat 1718-card grid → 52 sections; unit-level rejected on data (1350 of 1530 units hold ONE game) | live walk 1718/52/6, 0 errors (`8fc1e11`) |
| Play-0 fix — canonical NERDC band ladder | ✅ DEPLOYED | Nursery children saw `Play 0`: client ranked on the old 5-value legacy ladder, so every NERDC row ranked −1 and was dropped | Demo5 0 → 814 (`dd78174`) |
| Class-safe load budget | ✅ DEPLOYED | ~40 → 15 API calls/load, 1 when idle | (`ad6dbbb`); class-sized gap still flagged below |
| Jump-ahead checkpoints ("test out" of a locked chain) | ✅ DEPLOYED | Prove the prerequisite instead of grinding; a skip is EXEMPT, never mastery | 66/66 · 761/761 (`eb9b527`); migration applied + independently verified |
| ECCE game bridge — DB binding, mounted routes, review/publish/recall, teacher screen | ✅ DEPLOYED | 2 of the 3 failing suites were real production defects, not test defects | (`0176bdc`, `535a91e`) |
| Crèche content + placement implementation committed | ✅ DEPLOYED | Seeder entry point guarded so a test cannot trigger seeding | gate 65/65 · 724/724 (`5fda5ba`) |
| Deploy hardening — staging gate + atomic release swap | ✅ DEPLOYED | After the 403 incident: the nginx docroot had no `index.html` | (`ef46cbb`, `65d86e3`) |
| **Server-side band cap** | ⚠️ OPEN | The client ceiling is currently the only thing keeping higher-band content out | Q59 |
| **A dashboard load counts as a play day** | ⚠️ OPEN | Streaks inflate and every dashboard visit is a server write | Q58 |
| **Flagship pilot reproducible from the repo** | ⚠️ OPEN | Prod serves 6 bands / 1718 lessons; HEAD's plan declares 5 and no `primary` | Q48, Q60 |

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
| Complete annual pilot seed | ✅ VALIDATED | 5 bands × 9 subjects × 3 terms × 10 weeks; Numbers, Letters and PHONIX included | 1,350 rows |
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
| TURN server (coturn) | ✅ LIVE | Installed + active (verified `systemctl is-active coturn` → active, 2026-09-15); Q18 set it up via `coturn-setup.yml`, 3478 relaying, `LIVE_WEBRTC=1` | 10/10 signaling |
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
| English locale on prod | ✅ DEPLOYED | Verified 2026-09-15: live serves `en-XLaQ_gOp.js` and `ha-COH7dJaP.js`, both HTTP 200 | Release `20260915T151254Z-8fc1e11` |

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
- [x] TURN server installed — coturn **active** (verified 2026-09-15)
- [x] CI pipeline configured — `.github/workflows/deploy.yml` on `push: main`, self-hosted
      runner; backend gate + staging build + atomic release swap
- [x] Deploy verified end-to-end 2026-09-15: gate 66 suites / 761 tests, publish SUCCESS,
      `frontend/dist` → `releases/20260915T151254Z-8fc1e11`
- [x] `elite-kids-api.service` (systemd user unit, :8484) active
- [ ] B2 application key rotated (old one exposed — see README)
- [ ] Checkpoint + ECCE bridge migrations are APPLIED to live `elite_kids` but are
      migration-only by design (never added to `KIDS_CONTENT_TABLES`), so a fresh
      environment needs them run explicitly

---

## Active Blockers

| Blocker | Since | Impact |
|---|---|---|
| B2 app key exposed in chat | Aug 17 | Security — needs rotation. **Only open blocker with a security impact** |
| Server-side band cap may not hold (Q59) | Sep 15 | `resolveBandForAdmission` resolved no band for two children, so `visibleLevels()` never capped `GET /kids/lessons` and the CLIENT ceiling was the only defence. Needs re-confirmation with a mid-band child |
| A dashboard load counts as a play day (Q58) | Sep 15 | `POST /kids/economy/streak/record` fires on every mount and UPDATEs `kids_economy`; streaks inflate and every visit is a write |
| Class-sized load still exceeds the rate limit | Sep 15 | 15 calls/child × 30 children opening at once ≈ 450 req/min against a **300/min per-IP** limit shared by a whole school. Server work, not client work |
| Flagship pilot not reproducible from the repo (Q48/Q60) | Sep 15 | Prod serves 6 bands / 1718 lessons; HEAD's plan declares 5 and no `primary`, and the seeder writes one game per unit. A rebuild from source cannot reproduce prod |
| **Unverified schema migration against the SHARED `elite_db` (Q65)** | Sep 10 | `backend/database/migrate.js` left three pre-migration backups of `elite_db.school_setup` (06:10:45Z, 06:11:14Z, 07:09:10Z) and the backup grew 18,291 → 22,155 bytes, so a **shared, non-kids table** changed. No report, no commit, nobody has said what it applied |

**Resolved since the last update:** TURN/coturn (installed + active, Q18) · GitHub push
(works over HTTPS — both deploys today pushed successfully, so the "SSH key not registered"
blocker is moot) · English locale on prod (verified serving) · the 403 docroot incident
(Q55).

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

### S9 — Student experience, ECCE bridge, deploy hardening (Sep 10 → Sep 15)

- **Sep 10** — Primary annual pilot: band-count verified against live `elite_kids`, Primary
  progressive band + Playgroup one-class-fits-all ladder implemented, seed re-run
  (1,710 games / 6 bands / 51 series). ⚠️ The plan/seeder half of this work is **not in the
  repo** — see Q48/Q60. Also: the student dashboard split tests cards from games
  (`b142333`), the login hid the Change School button on subdomain auto-detect (`cdd8eae`),
  and a `migrate.js --apply` run touched the **shared `elite_db.school_setup`** with no report
  (**Q65 — unverified**).
- **Sep 11** — Crèche game audit (Milestone 1: tap-recognition discovery).
- **Sep 14** — Deploy hardening after the 403 docroot incident; ECCE bridge model binding +
  mounted observation routes (2 real production defects); bridge review/publish/recall state
  machine + teacher authoring screen; Home made the games grid with games grouped by lock
  state (`fbc021a`). A bridge push failed the gate and published nothing, which exposed that
  CI step 1 runs `git stash create` + `git reset --hard origin/main`.
- **Sep 15** — Crèche content + placement committed so the gate could pass; jump-ahead
  checkpoint feature (backend, frontend, policy) with its migration applied to live;
  onboarding split (gender/age step out of the tour) + lazy tab panels + live feed badges
  (`a55be81`); login shows the school logo/name and hides the shortname on a subdomain
  (`2924984`); 5-tab student restructure with a class-safe load budget; the Play-0 production
  bug fixed (Nursery children saw `Play 0`); PLAY ordered by curriculum then sectioned by
  subject. Live band walks were run against real children's sessions (Nursery 2, Kindergarten,
  Demo5) — they produced the two open findings Q58 and Q59.

---

## Next Up

Ordered by what actually protects production, not by what is easiest.

- [ ] **Q58** — stop a dashboard load from counting as a play day (it writes to
      `kids_economy` and inflates streaks)
- [x] **Q59/Q67** — make the server-side band cap hold — **FIXED + DEPLOYED 2026-09-15**
      (`8b35aa5`). It was never the resolver: `models/Student.js` did not DECLARE `class_name`,
      so no band resolved for any real-school child and the ceiling was skipped entirely.
      004 1718→1085, 109 1718→1356, Demo5 1085→814; walked on live. **Second pass (Q70,
      NOT deployed)**: 647 children (9.7%) still resolved NO band and were served all six —
      now fixed by passing the class row's `section` (640 recover), an age-word rule for
      'Just 2s'-style room names (7), and failing closed to the narrowest band instead of
      widening; verified read-only against production, 0 left unresolved, gate 67/67 · 778/778.
- [x] **Q60** — reconcile the tracked flagship plan + seeder with the content prod serves —
      **RESOLVED 2026-09-15**: tracked source now generates prod exactly (1710/1710/1530/51,
      zero drift, gate 67/67 · 772/772). Root cause was that the 09-10 Primary work existed only
      in the live DB and was destroyed by the deploy's `git reset --hard origin/main`.
- [ ] **Q69 DECISION** — the content's closure contract contradicts the gate: `gamePlan.test`
      is JSON null for all 270 Crèche games (which the gate nonetheless requires a passing test
      for) and `requiredAfterPractice: true` for the other 1,440 (which the gate deliberately
      ignores). Unread dead metadata today; fixing it means plan + seeder + a re-seed decision,
      which would re-open Q60's drift
- [ ] **Q65** — establish what the 2026-09-10 `migrate.js` run applied to the SHARED
      `elite_db.school_setup`, and confirm the kids-only rule was respected
- [ ] **Q51** — migrate the 42 direct `elite_db.students` reads (17 files) onto elite-sms APIs
- [x] **Q71** — PLAY ordering — **FIXED 2026-09-15**: PLAY now leads with the child's own
      band, then the review ladder nearest-first. Measured live vs the new build on the same
      child: own-band section index **45 of 52 → 0**, counts unchanged (1718/52/6), harness now
      asserts it. **LEARN still leads with spill-over** (deliberate, PLAY-only brief) — worth an
      explicit decision, since PLAY and LEARN now disagree about which end to lead with. Not deployed
- [ ] Rate-limit the API by school/user for authenticated kids (the class-sized gap)
- [x] Deploy the i18n frontend bundle to prod — done, verified serving
- [x] Install the coturn TURN server — done, active
- [x] Annual Numbers/Letters/PHONIX pilot source and idempotent seed validated; adult
      approval still required before publication
- [ ] Curriculum points renumber (cosmetic: old PA-U{1..5} refs)
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

2026-09-09 — Annual pilot curriculum handover: added the 2026/2027 idempotent source-driven
  seed for 5 bands × 9 subjects × 3 terms × 10 weeks (1,350 schema-validated rows).
  Numbers are age-banded; Letters carry PHONIX sound-first metadata. Seed remains pending
  adult review by default; dry run, focused Jest test and frontend build passed.

2026-09-10 — Primary annual pilot: band-count verified against LIVE elite_kids (published
  rows only); Primary progressive band (2 games/subject/week, 15-item cap) and Playgroup
  one-class-fits-all ladder added to the plan; idempotent seed re-run → 1,710 games across
  6 bands / 51 series. Login: Change School hidden when the school is auto-detected.
  NOTE (found 2026-09-15): the plan + seeder changes that would reproduce this are NOT in
  the repo at HEAD — prod has the content, tracked source cannot generate it. See Q48/Q60.

2026-09-11 — Crèche game audit Milestone 1 (tap-recognition): discovery complete,
  implementation fix pending.

2026-09-14 — Deploy hardening + ECCE bridge. 403 incident: the nginx docroot had no
  index.html, and `index index.html` with autoindex off yields 403 (not 404). Fixed by
  gating frontend publishes behind a staging build + atomic release swap and retiring the
  manual rsync scripts. ECCE bridge: two of three failing suites were REAL production
  defects — the bridge/observation models were bound to the shared EliteSMS DB instead of
  KIDS_DB_NAME, and POST /kids/observations was never mounted (404). Then the
  review/publish/recall state machine + teacher authoring screen. A push failed the gate and
  published nothing, exposing that CI step 1 does `git stash create` + `git reset --hard`,
  which reverts tracked edits and leaves untracked files.

2026-09-15 — Crèche content + placement committed so the gate could pass (gate 65/65 ·
  724/724); the Jolly Phonics seeder entry point is now guarded so a test cannot trigger
  seeding or its process.exit. Jump-ahead checkpoints shipped end to end (backend, frontend,
  policy panel, teacher queue) and the migration was APPLIED to live elite_kids, verified
  independently via information_schema. Student dashboard restructured into 5 tabs with zero
  overlap (22 AST contract tests) plus a class-safe API budget (~40 → 15 calls/load, 1 idle).
  The Play-0 production bug — Nursery children saw "Play 0" because the client ranked lessons
  on the old 5-value legacy ladder while kids_lessons.age_level stores NERDC labels — fixed
  and deployed (Demo5 went 0 → 814). PLAY then ordered by curriculum instead of createdAt, and
  sectioned by subject in unit order (live walk: 1718 cards / 52 sections / 6 offers, 0 errors).
  Two live-safety findings recorded: a dashboard load writes a streak (Q58), and the
  server-side band cap may not hold (Q59). Both deploys of the day passed the gate
  (66/66 · 761/761) and published atomically.
```
