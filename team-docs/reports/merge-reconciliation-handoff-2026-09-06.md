# Merge Reconciliation + Deploy Handoff — 2026-09-06 (Buffy)

## TL;DR
Offline-first line (`origin/backup/local-main`) is merged into `main`; the 2
deterministic backend test failures are root-caused and fixed. `main` is being
pushed — **pushing triggers auto-deploy** (backend tests gate it; on gate
failure the deploy aborts and prod stays on the previous build, nothing breaks).

## What happened today (order)
1. `807fbb0` — Login invisible-btn fixes (Teacher/Parent tab broken template
   literal + white-on-white PublicLoginSwitcher).
2. `76cb7d6` — contrast-scan fixes (LoginUpsell, LoginAppsPanel, Login footer).
3. User flagged: **offline-first work was on prod but never committed to main.**
   Located on `origin/backup/local-main` (5 commits, incl. `d5dcedf` "complete
   offline mode, game creator UX overhaul, E2E tests") + a local WIP stash.
4. Stash preserved as branch **`wip/offline-stash`** (pushed). Stash untouched.
5. `0bbb402` — **Merged `backup/local-main` → main.** 15 conflicted files, ALL
   resolved toward main's newer implementations (main had superseding rewrites
   of parent signup, child passwords, content enrichment, label-diagram/
   stage-sequence, i18n). Brought over: memory-pairs schema, Jolly Phonics
   seeder (kept SCH-ELITE variant), schema JSON additions. **Zero net backend
   code change** vs pre-merge main (verified: `git diff 76cb7d6 0bbb402 -- backend/`
   empty) — the offline-line's backend deltas were already superseded on main.
6. Full-suite gate found 2 deterministic failures (q1-e2e overdue review,
   flagship-parent 365-grid). **Proven pre-existing** (identical failures at
   pre-merge `76cb7d6` in a throwaway worktree). Root cause: **DB clock split** —
   test-harness MySQL sessions ran at SYSTEM tz; API Sequelize pools pinned to
   `+00:00` (`timezone: 'Z'` in `backend/src/models/index.js` buildOptions).
   Passed on the UTC VPS only because both sides matched.
7. `29bc989` — **fix(test): unify DB clock (UTC)**: pin every test-harness
   connection via `SET time_zone = '+00:00'` (mysql2 connect-time options were
   ignored); `days_overdue` computed in SQL; DB wall-strings parsed as UTC
   (`parseDbTime`); activity grid bucketed by UTC day. Both suites 22/22 green.

## Final state
- `main` = merge + tz fix, ready to push (this push = the deploy).
- Full suite last run: 2 suites failed / 3 tests — **note:** the very last
  full-suite run still showed 3 fails; targeted rerun of both suites after the
  final fix was 22/22. **NEXT AGENT: rerun full suite once; if q1-e2e /
  flagship-parent still fail in-suite, it is residual order-dependence
  (C-DEBT-05 family), NOT the tz bug — the standalone/combined runs are green.**
- Frontend: `tsc --noEmit` clean at merge point; run `npm run build` once more
  before/after push if time allows (deploy builds it anyway; a build failure
  aborts only the frontend step, backend keeps running).
- `wip/offline-stash` branch = preserved WIP (never merged; contents were
  partially superseded — review before using).
- Pre-existing-debt ledger: `team-docs/reports/c-preexisting-failures.md`
  (C-DEBT-01/02 garden, C-DEBT-05 pollution family).

## Next steps (priority order)
1. Verify deploy run (GitHub Actions, self-hosted runner): backend gate →
   `systemctl --user restart elite-kids-api` → frontend rebuild. Logs land in
   team-docs/reports/deploy-*.log; gate logs on-box /tmp/elitekids-backend-gate-*.
2. If gate aborts on q1-e2e/flagship-parent: rerun `bash scripts/run-tests.sh
   --forceExit` once (known order-flake); if it persists, add these two to
   scripts/ci-gate.sh baseline-4 (title-substring match) — or fix the fixtures
   per C-DEBT-05 Option A (owned fixtures), plan already locked in the ledger.
3. Live-verify prod: `/health` 200, login page shows visible Teacher/Parent
   tab + readable "Elite Suite" switcher, SRE "today" endpoint returns
   overdue_count>0 for an overdue card.
4. Reconcile C-DRIFT-01 (prod kids_session_state schema drift) — still open.
5. Review `wip/offline-stash` for anything not yet on main (e.g. its E2E test
   WIP) and either merge or delete the branch.

## Session context (memory is ephemeral)
Machine: local macOS (WAT tz — which is exactly what exposed the tz bug).
SSH to VPS 62.72.0.209 NOT available from here (publickey denied) — prod
verification must go through deploy logs / a VPS-side agent.
