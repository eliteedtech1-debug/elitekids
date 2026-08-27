# E2 REPORT — Offline Progress Reconciliation (2026-08-24 ~04:1xZ)

## VERDICT: IMPLEMENTED + TEST-GREEN; manual browser smoke pending human QA

## Root finding
The offline stack EXISTED but was NEVER WIRED: src/lib/offline/{db,sync}.ts (IndexedDB queue +
drain service) and OfflineBanner.tsx had ZERO usages. GamePlay.submitProgress dropped failures via
.catch(()=>{}) with no idempotency_key — silent progress loss on flaky rural networks.

## STEP 2 — Client (frontend, hot-reload live)
- GamePlay.tsx: idempotency_key generated per attempt (crypto.randomUUID w/ fallback); post failure now
  enqueues payload to offlineSync queue (single-post fallback preserved \u2014 success path unchanged);
  offlineSync.init listener tracks queued count; <OfflineBanner> mounted in play phase.
- sync.ts: RETRY_DELAYS backoff was DEAD CODE \u2014 wired as capped exponential re-drain (2s/5s/15s) when
  items remain; timer cleared on destroy/drain.
- OfflineBanner.tsx: new optional pending/failed props rendered inside the offline box.
- Evidence: tsc --noEmit RC=0; vite transforms all 3 modules HTTP 200. Backups /tmp/*.bak-e2.

## STEP 3 — Server
- POST /kids/sync/batch (auth): items[] <=50; per-item result created|duplicate|error IN ORDER;
  top-level {success, data:{results, failed}}; dedupe via uq_kids_progress_dedupe (child-scoped findOne);
  recordAttemptPoints fired per created row (leaderboard parity with single-post path);
  student ownership guard enforced PER ITEM (foreign child = error).
- Backward compatible: single-post flow untouched. Backups: controllers/kids.js.bak-e2 (+routes).

## STEP 4 — Tests
- NEW backend/test/e2-sync-batch.test.js: 5/5 PASS (empty-reject, fresh+order, replay-dedupe stable ids,
  partial failure order, cross-child key isolation + foreign-child block).
- Full regression b1 suite: 25/25 PASS RC=0 \u2014 zero new failures (baseline note same as E1: legacy
  4 content-ticket failures already fixed by D-phase).

## GATES
- Jest green vs baseline: PASS (above).
- Manual smoke: NOT executed (no browser automation in this environment) \u2014 RECOMMENDED SCRIPT:
  1) DevTools Network Offline \u2192 complete a game \u2192 banner shows "pending 1"; 2) back Online \u2192 auto-drain
  fires (or 30s periodic); 3) verify kids_progress has EXACTLY ONE new row for that lesson+child and
  leaderboard points incremented once. Replay-safety is already machine-proven (duplicate statuses + stable ids).

## Artifacts
backend/test/e2-sync-batch.test.js; frontend patches (3 files, backups /tmp/gp|sync|banner.bak-e2);
server patch kids.js.bak-e2; e2-progress.md checkpoints 1-4.
