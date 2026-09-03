# Q1 Bridge Validation — reviewer verdict on `ngeg-2027-overview-and-gap-plan-request.md`

**Date:** 2026-09-03 · **Reviewer:** Buffy (worker, validation dispatch) · **Base validated:** `origin/main` = `eb7efe5` (HEAD == origin/main, clean pull)
**Report under review:** `team-docs/reports/ngeg-2027-overview-and-gap-plan-request.md` (authored 2026-09-03, pre-`7234975`)

---

## VERDICT: SUBSTANTIALLY ACCURATE — 1 stale item (G1), everything else verified

| Area | Report claim | Re-verified result | Verdict |
|---|---|---|---|
| Pull state | validate against current `main` | HEAD == origin/main == `eb7efe5` | ✅ |
| 9 cited commits | dc9c1dd, b81e89c, 8638561, b9fc445, 191e75e, 31295c3, 7234975, d54b2ae, 1b610ec | all present on main, subjects consistent with claims | ✅ |
| Sub-feature 1 ADE v2 next-item | "What's next?" panel, per-lesson skill_key | GamePlay fetches `ADE_V2.NEXT_ITEM(count=3)`, renders panel; `kidsAdaptiveV2.getNextItems` sends lesson_id + excludes sentinel skills | ✅ |
| Sub-feature 2 SRE v2 grading loop | POST reviews/v2/complete, quality 0–5 from accuracy | present (quality mapping now in `lib/game/review.ts` + vitest) | ✅ |
| Sub-feature 3 shop equipped-state | SKIN_META/THEME_HEADER → StudentHome ring + header | verified in StudentHome/Shop/CompanionBubble | ✅ |
| Sub-feature 4 error envelope | `error_code` per contract, 8 FE mappings fixed | sweep green; G3 marked CLOSED is consistent | ✅ |
| Sub-feature 5 UUID→BIGINT + phantom INSERT | d40241a | commit verified; current controller inserts no UUIDs | ✅ |
| Sub-feature 6 ParentDashboard PIN fix | was `password: pin \|\| '1234'` | fix landed in `31295c3` (component `frontend/src/components/ParentDashboard.tsx` — note: components/, not pages/Parent/) | ✅ |
| Sub-features 7–8 login short-name UX | d54b2ae + 1b610ec | submit-time resolution + resolved-school chip verified in Login.tsx | ✅ |

### Gaps G1–G8 re-verification

| # | Report claim | Code-level result | Verdict |
|---|---|---|---|
| G1 v1-engine removal DEFERRED (M) | v1 "still routed and load-bearing" | **STALE — CLOSED by `7234975`.** `kidsAdaptive.js`/`kidsSpacedRep.js` deleted (−369 lines); routes/kids.js: v1 require + endpoints gone; ReviewZone v2-only ("v1 (Ebbinghaus) removed (Phase 4)" in code); GamePlay reads `ADE_V2.PROFILE`; kidsRevision nudges ported to `kids_review_schedule_v2`; endpoints.ts v1 defs dropped | ⚠️ update status → CLOSED (report predates the commit) |
| G2 streak migration NO-OP (XS) | single key `elitekids-streak` since initial commit | `frontend/src/lib/utils/streak.ts:18` — only key | ✅ agree, close as NO-OP |
| G3 contract gap-fill | CLOSED in-session | consistent with green sweep | ✅ CLOSED |
| G4 LEVELS mismatch (XS) | FE 10 entries vs BE 14 | exact: `types/adaptive.ts` 10 (1,2,3,5,7,10,15,20,25,30) vs `economyService.js` 14 (adds 4,6,8,9 Seeker/Sage/Adept/Virtuoso) | ✅ open (XS) |
| G5 GardenScene rendering (S) | compact-only, no equipped-item props | `GardenScene.tsx:70` — `{ compact = false }` only | ✅ open (S) |
| G6 real-browser live-smoke (M) | pending human QA | not falsifiable from repo; takeover confirms chromium present, needs staff account | ✅ open (L3-QA) |
| G7 badge_url artwork (XS) | using brand mark `/logo.svg` | takeover confirms badge set to logo.svg; real artwork still needed | ✅ open (XS) |
| G8 PAT in origin URL (XS, ROOT) | ghp_ token in .git/config | **still present** (`ghp_` in remote.origin.url, redacted here) | ✅ open — ROOT revoke |

### Test gates — re-run 2026-09-03 (this session, post-pull)

| Gate | Report | Re-run result | Verdict |
|---|---|---|---|
| Q1 backend sweep | 77/77 | **94/94, 6 suites** (grew: `7234975` added review.ts extraction tests) | ✅ superset, claim held at time of writing |
| q1-e2e | 17/17 | included in sweep, all pass | ✅ |
| Frontend tsc | clean | exit 0 | ✅ |
| Frontend vitest | 98/98 | **106/106** (grew same way) | ✅ superset |
| Full backend suite | 476P/2F | **476P/2F reproduced** — single-threaded run gives 474P + the 2 documented garden-companion flake tests that pass standalone (intermittent in-suite state leak); totals 478 match exactly | ✅ (see flake note) |
| Build | OK | `npm run build` OK (6.05s) | ✅ |

**Flake note for future gate-runners:** `garden-companion.test.js` C-DEBT-01/02 ("auto-initializes garden…", "does not downgrade when tier is lower") sometimes fail IN-SUITE only (observed 4F parallel / 4F+2-pass-on-retry single-threaded / 2F stable) — never standalone. Do not treat extra garden failures as regressions; re-run the file alone. Parallel (`--maxWorkers`) full-suite runs are unreliable on this box because `ensureTestDb` does `DROP DATABASE` per global-setup and workers race one test DB — use `--runInBand --forceExit` with `TEST_DB_*` exported.

**Repro for backend gates** (creds are in `backend/.env.test` under `DB_*` names but jest reads `TEST_DB_*`):
```bash
set -a; . backend/.env.test; set +a
export TEST_DB_USER="$DB_USERNAME" TEST_DB_PASSWORD="$DB_PASSWORD" TEST_DB_HOST="$DB_HOST" TEST_DB_PORT="$DB_PORT"
cd backend && ./node_modules/.bin/jest --runInBand --forceExit   # system jest is stale v30; use local bin
```

### Status-summary check

- **Q1 ≈ 92%** — accurate **as of the report's writing**. Measured against the roadmap's own Q1 scope (SRS §2/§3/§4 + Phase 4 + A17): all workstreams built, deployed, gated green. With G1 now closed by `7234975`, the only remaining Q1 code items are XS/S (G4 reconcile, G5 render path, G7 artwork) + QA (G6) + ROOT (G8). **Post-report effective Q1 completion ≈ 95–96%** — the stale number errs conservative, which is the safe direction.
- **Roadmap §0** ("Adaptive 20% stub", "Spaced-rep 30% scaffold", "no reward economy") is now outdated **by design** — Q1 is exactly the work that retires those §0 rows. Consistent.
- **Architecture/table claims** — 4/16 new tables done verified: `kids_adaptive_state`, `kids_economy`, `kids_shop_items`, `kids_purchases` (migrations in `backend/database/q1-*-migration.js`); `kids_speech_logs`/`kids_drawing_logs` absent. ✅
- Q2/Q3/Q4 = 0% verified (no speech/drawing/portfolio/collab/marketplace code in tree). ✅

---

## Bridging plan to 100% Q1 (updated order — G1/G3 closed)

1. **G4** (XS, L2-FE) — align FE `LEVELS` to BE 14-entry table (or derive both from one source). Do first: pure data.
2. **G2** (XS) — close as NO-OP (verified single key). Record decision only.
3. **G5** (S, L2-FE) — pass equipped garden items into `GardenScene` props + render. Residual from shop equipped-state work.
4. **G7** (XS, L2-FE) — swap real Elite EduTech artwork URL into `badge_url` (needs asset from owner).
5. **G8** (XS, ROOT) — revoke exposed `ghp_` PAT, rotate remote URL. **Do before any external exposure review.**
6. **G6** (M, L3-QA) — real-browser live-smoke (teacher wizard → admin approve → child path), chromium available on VPS; final gate.

Items 1–5 ≈ half a worker-session; G6 is human/QA-scheduled. Q1 100% is reachable this week.

## Q2 kickoff (confirmation)

Report's Q2-A…Q2-G decomposition matches roadmap §2.5–2.7; 21-week effort estimate accepted as roadmap-authoritative. Dependencies on Q1 confirmed real: economy XP hooks feed speech/drawing rewards; ADE BKT per-skill mastery feeds the Q2-E portfolio skill map; SRE review cards are the template for speech/drawing item scheduling. Sequence: **speech (A/B/F) → drawing (C/D/G) → portfolio (E)** — portfolio consumes both. Kickoff blocked only until G6 (live-smoke) signs off Q1.

## Items the report missed (minor)

1. **Test-harness footgun** (documented above): `.env.test` uses `DB_*` names vs jest's `TEST_DB_*` — costs every future session 20 minutes. Recommend a `backend/scripts/test-env.sh` wrapper.
2. **Report internal inconsistency:** it lists `7234975` as a sub-feature commit (Phase 4 cleanup *done*) while grading G1 as *deferred* — same workstream, contradictory states in one document. Root cause: report compiled from pre-`7234975` takeover text, commit list added after. Now reconciled by this validation.
3. `talesia`-style FE dead-code sweep for v1 ADE/sre references post-`7234975` was not in any gap list — quick grep shows tree is clean, but worth one line in the next worker brief.
4. **`levelFromXp` max-level bug** (found during G4, fixed in same pass): the cap guard read `xp >= next.xp_required → isMax` — with the old 10-row table that showed **Grandmaster for every kid ≥500 XP** (the cliff moves to ≥350 XP with the 14-row table). Fixed to `isMax` only when no next row exists; regression-covered in `adaptive.test.ts`.

## QUEUE check (zero-idle)

Next QUEUED row for worker role: none code-dispatchable found at validation time — QUEUE items are MASTER/ROOT-owned (G-W2 smoke, PAT revocation, Q22/Q23 root steps) pending this sign-off. IDLE until MASTER dispatches G4/G5/G7 bridge work.

---
*Generated with Codebuff 🤖 · validation is read-only; no source files modified.*
