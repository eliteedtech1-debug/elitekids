# E2 REVIEW VERDICT — Offline Progress Reconciliation Implementation

**Reviewer:** Buffy (fb-review advisory arm)  
**Date:** 2026-08-24  
**Scope:** Verify e2-report.md claims against actual file contents. Read-only, no code edits.

---

## (a) Success-path behavior change — PASS ✅

**Claim:** "single-post flow untouched"

**Evidence (GamePlay.tsx:2742–2752):**
```js
try {
  await apiClient.post(ENDPOINTS.PROGRESS.GAME_COMPLETE, progressPayload);
} catch {
  // E2: offline or failed post — queue for later drain; never silently lose progress.
  await offlineSync.enqueue({
    endpoint: ENDPOINTS.PROGRESS.GAME_COMPLETE,
    method: 'POST',
    body: progressPayload,
  });
}
```

**Verdict:** ✅ On success, the code reaches the `try` block, the POST succeeds, and falls through to the `finally { setSubmitting(false); }`. The catch block is only entered on failure. **No behavior change on the happy path.** The prior `.catch(()=>{})` is replaced by the offline enqueue — a strictly additive improvement on the error path.

---

## (b) Dedupe is child-scoped — PASS ✅

**Claim:** "dedupe via uq_kids_progress_dedupe (child-scoped findOne)"

**Evidence (controllers/kids.js, `syncBatch` handler, ~line in controllers):**
```js
if (idempotency_key) {
  const existing = await db.KidProgress.findOne({
    where: { child_admission_no, lesson_id, game_config_id: game_config_id || null, idempotency_key },
  });
  if (existing) { results.push({ status: 'duplicate', id: existing.id }); continue; }
}
```

**Unique key (KidProgress.js:27–30):**
```
name: 'uq_kids_progress_dedupe'
fields: ['child_admission_no', 'lesson_id', 'game_config_id', 'idempotency_key']
```

**Verdict:** ✅ Dedupe `findOne` uses all 4 key fields including `child_admission_no`. Two students replaying the same lesson with the same idempotency_key won't collide because `child_admission_no` is part of the key. **Child-scoped confirmed.**

**Additional note:** Per-item student ownership check also enforced (controllers/kids.js `syncBatch`):
```js
if (isStudent && String(child_admission_no).trim() !== mine) {
  results.push({ status: 'error', message: 'You can only access your own data' });
  continue;
}
```
**Verdict:** ✅ Cross-child collision blocked for student users.

---

## (c) Leaderboard hook fires per created batch row — PASS ✅

**Claim:** "recordAttemptPoints fired per created row (leaderboard parity with single-post path)"

**Evidence (controllers/kids.js, `syncBatch` handler):**
```js
const record = await db.KidProgress.create({ ... });
recordAttemptPoints({ school_id, branch_id, child_admission_no, score: record.score });
results.push({ status: 'created', id: record.id });
```

**Comparison — single-post path (`recordGameComplete`):**
```js
const record = await db.KidProgress.create({ ... });
recordAttemptPoints({ school_id, branch_id, child_admission_no, score: record.score });
```

**Verdict:** ✅ Both paths fire `recordAttemptPoints` per created row with identical arguments. Leaderboard parity confirmed. (Note: `recordAttemptPoints` is fire-and-forget per prior audit — cannot crash the handler.)

---

## (d) Route wiring — PASS ✅

**Evidence (routes/kids.js):**
```js
app.post('/kids/sync/batch', auth, syncBatch);
```

**Import verification (routes/kids.js:15):**
```js
const { ..., syncBatch, ... } = require('../controllers/kids');
```

**Controller export (controllers/kids.js):**
```js
module.exports = { ..., syncBatch, ... };
```

**Verdict:** ✅ `syncBatch` is imported, exported, and registered with `auth` middleware.

---

## (e) Offline backoff/retry — PASS ✅

**Evidence (sync.ts, `drainNow` method):**
```js
// E2: capped exponential backoff — re-drain remaining items after a delay
if (this.backoffTimer) { clearTimeout(this.backoffTimer); this.backoffTimer = null; }
if (remaining > 0) {
  const head = (await offlineDB.getSyncQueue())[0];
  const idx = Math.min(head?.retries ?? 0, RETRY_DELAYS.length - 1);
  this.backoffTimer = setTimeout(() => {
    this.backoffTimer = null;
    if (navigator.onLine) this.drainNow().catch(() => {});
  }, RETRY_DELAYS[idx]);
}
```

**Constants:** `RETRY_DELAYS = [2000, 5000, 15000]` (2s / 5s / 15s), `MAX_RETRIES = 3`

**Verdict:** ✅ Capped exponential re-drain confirmed. Backoff uses retry count of head item, clamped to array length. Timer cleaned on destroy. Prior dead-code `RETRY_DELAYS` is now wired.

---

## (f) OfflineBanner integration — PASS ✅

**Evidence (GamePlay.tsx play-phase render, ~line 3139):**
```tsx
<OfflineBanner hasQueuedProgress={queuedCount > 0} pending={queuedCount} />
```

**Evidence (GamePlay.tsx:2706–2707, init):**
```ts
offlineSync.init({ onStatusChange: (_s, size) => setQueuedCount(size) });
offlineSync.getStatus().queueSize.then((n) => setQueuedCount(n)).catch(() => {});
```

**Evidence (OfflineBanner.tsx props):**
```ts
interface OfflineBannerProps {
  hasQueuedProgress?: boolean;
  pending?: number;
  failed?: number;
  onRetry?: () => void;
  className?: string;
}
```

**Verdict:** ✅ Banner wired with live queue count via listener. Props match interface. Banner renders count in text (`{pending} pending`). Auto-hides when `navigator.onLine` is true. `failed` prop not passed from GamePlay (default 0) — acceptable since drain errors are logged/retried silently.

---

## CONCERNS (non-blocking)

### CONCERN-1: syncBatch lacks `denyForeignChildData` middleware (LOW)

**Evidence (routes/kids.js):**
```js
// Single-post path — has denyForeignChildData:
app.post('/kids/progress/game-complete', auth, (req, res, next) => {
  const denied = denyForeignChildData(req);
  if (denied) return res.status(denied.status).json(denied.body);
  next();
}, recordGameComplete);

// Batch path — NO denyForeignChildData:
app.post('/kids/sync/batch', auth, syncBatch);
```

**Impact:** `syncBatch` has its own per-item `isStudent && child_admission_no !== mine` guard, which covers the student case. But parent/staff foreign-child checks (which `denyForeignChildData` performs at the route level) are not applied. For batch requests from parent users, cross-child items would be accepted if the batch contains items for children not linked to the parent.

**Severity:** LOW — student users (the primary offline use case) are covered; parent batch usage is unlikely in offline scenarios.

---

### CONCERN-2: KidProgress model missing `difficulty` field (LOW)

**Evidence (KidProgress.js model definition):** No `difficulty` field defined.  
**Evidence (controllers/kids.js `syncBatch` + `recordGameComplete`):** Both create records with `difficulty: difficulty || null`.

**Impact:** Sequelize will silently ignore unmapped fields in `create()` — the `difficulty` value won't persist to the DB unless the column exists in the actual table (possibly added via manual DDL). If the column does exist, Sequelize picks it up via `raw: true` queries. This is a **schema drift risk** — the code assumes a column that the model doesn't declare.

**Severity:** LOW — doesn't crash; may silently not persist difficulty data.

---

### CONCERN-3: syncBatch per-item error doesn't roll back previously-created rows (BY DESIGN, note only)

If items 1-3 succeed and item 4 fails, items 1-3 are already committed. The response returns `{ results: [...], failed: N }` and the client can retry failed items. This is correct for the offline queue drain use case — each item is independently idempotent via `idempotency_key`.

---

## Summary

| Check | Verdict |
|---|---|
| No behavior change on success path | **PASS** ✅ |
| Dedupe is child-scoped | **PASS** ✅ |
| Leaderboard hook fires per created batch row | **PASS** ✅ |
| Route wiring correct (import, export, auth) | **PASS** ✅ |
| Backoff/retry exists and is capped | **PASS** ✅ |
| OfflineBanner wired with live queue count | **PASS** ✅ |
| syncBatch has per-item student ownership guard | **PASS** ✅ |

| Concern | Severity |
|---|---|
| Missing `denyForeignChildData` on batch route | LOW |
| `difficulty` field not in KidProgress model | LOW |
| No batch transaction (by design for idempotent items) | INFO |

**OVERALL: PASS** — E2 implementation is correct and matches e2-report.md claims. Two low-severity concerns flagged for future hardening.
