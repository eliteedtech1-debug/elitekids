# C-DEBT-05 Order-Independence Fix — 10x Stability Verification

**Date:** 2026-09-06 · **Worker:** Buffy (freebuff) · **Brief:** "Run the full suite 10x to confirm the order-independence fix is truly stable"
**Tree under test:** HEAD `c1c79fe` + uncommitted owned-fixture fix (children/flagship/kids-routes tests; cf. commit `4ae4d6f` family, C-DEBT-05 Option A)
**Runner:** `bash scripts/run-tests.sh` (hermetic env, `jest --runInBand`). DB `elite_db_test`/`elite_content_test` DROP/CREATE + reseeded by globalSetup **every run** → runs are independent and comparable.

## Verdict

**FIX VERIFIED under the shipped protocol — with two caveats.**

1. **C-DEBT-05 claim holds:** the owned-fixture assert ("returns an exact, pollution-free progress rollup for an owned dedicated fixture (C-DEBT-05)") passed in **13/13 runs**, including 3 fully randomized orders. The children/flagship NUR-001 shared-fixture pollution is gone.
2. **Caveat A — residual order-coupling inside children.test.js:** under `--randomize`, the suite's *shared-fixture* tests (link/list, NUR-004/005/006) fail with list-length and 200↔201 state violations. The owned fixtures removed the pollution *outflow* from this suite, but its own tests still depend on legacy order/state.
3. **Caveat B — two unrelated intermittent single-test flakes** in the default order (below).

## Protocol A — shipped gate (default alphabetical order), 10 runs

| Run | Exit | Result |
|----|------|--------|
| 01–05 | 0 | 607/607, 50/50 suites (also a prior control run: 607/607, 65s) |
| 06 | 1 | 606/607 — `children.test.js` "lists only linked children for a parent" → **401 on /users/login** (one-off auth flake) |
| 07–08 | 0 | 607/607 |
| 09 | 1 | 606/607 — `e5-parent-live.test.js` presence wait timed out (`Expected: true, Received: false`) + cascading `afterAll server.close` 30s hook timeout |
| 10 | 0 | 607/607 |

**Score: 8/10 fully green, 2/10 single unrelated flakes, 0 C-DEBT-05 failures.**
Each flake seen once in 10 runs (~10% each), both distinct signatures. Note e5's presence test also failed in all 3 randomized runs → e5 is itself order/timing-sensitive.

## Protocol B — characterization only (jest `--randomize`, explicit seeds)

NOT the shipped gate; run to measure residual coupling. Alphabetical file order is what CI ships.

| Seed | Result | Failing suites |
|------|--------|----------------|
| 1 | 577/607 | 9 suites (incl. kids-routes approvals `>=2` cross-suite count, q1-e2e seed data 404s) |
| 2 | fail | **15 suites** |
| 3 | fail | **12 suites** |

Randomized-order findings:
- `children.test.js` shared-fixture tests fail with **genuine pollution + order-state violations**: list length 4→5, `Expected: 200 / Received: 201` and inverse on the link endpoint (duplicate-link idempotency depends on prior order), and NUR-005 soft-delete state leaking across orderings. Owned fixture NUR-008 + cleanup hooks work even here.
- Cross-suite data coupling is broad: kids-routes (approvals queue count), q1-e2e (seed data), onboarding, b3/b3b, garden, e3f, e6, parental, session, subscription, series-units, b1-regression.

## Conclusion & Recommendations

- The brief's acceptance target is met for the C-DEBT-05 fix: **stable across 10 shipped-protocol runs**; the polluted-assert signature did not reproduce once.
- New tickets (proposed, master to prioritize):
  1. **C-DEBT-06** — `children.test.js` link/list tests still order-dependent (200↔201, list length) under randomized order; extend Option A owned-fixture pattern to the parent-self-service link family.
  2. **FLAKE-01** — one-off `/users/login` 401 in children.test.js (rate-limit? bcrypt timing? needs a repro run).
  3. **FLAKE-02** — e5-parent-live presence timeout + `afterAll server.close` 30s hook timeout (raise hook timeout, ensure socket teardown; e5 failed 4/13 runs overall).
  4. **C-DEBT-07** — broad cross-suite data coupling (15 suites fail under `--randomize`); fix incrementally or document alphabetical-order as the contract and drop `--randomize` from the toolbox.
- Keep `scripts/ci-gate.sh` on the default (alphabetical) order — that is the shipped contract; randomized runs are diagnostics only.

## Artifacts

- Summary ledger: `team-docs/reports/logs/c-debt-05-10x-summary.txt`
- Logs: `team-docs/reports/logs/c-debt-05-10x-run-{01..10}.log`, `c-debt-05-10x-run-01-default.log`, `c-debt-05-randomized-seed-{02,03}.log`, `c-debt-05-control-default-order.log`

**STATUS: DONE — brief satisfied (10x shipped-protocol runs executed, fix verified); no code changed by this run; nothing pushed. IDLE:pending-master-review.**
