# Offline Progress Reconciliation — Fix Design (ECCE Roadmap #2)

**Date:** 2026-08-23 · **Agent:** phaseC (ox-alpha) · **Queue:** Q6 · **Status:** DESIGN ONLY — no frontend/backend code changed (frontend tree is owned by B2/B3 agents this session)
**Scope source:** `team-docs/reports/ecce-roadmap.md` top-3 spike; this doc = the roadmap's #2 deliverable. Interfaces with #4 (SW/sync hardening) and #3 (i18n prep for banner copy).

---

## 1. Problem statement

`frontend/src/pages/Student/GamePlay.tsx` `submitProgress()` (~line 2616) posts game completions with:

```ts
await apiClient.post(ENDPOINTS.PROGRESS.GAME_COMPLETE, {...}).catch(() => {});
```

Failure modes today:
1. **Silent loss** — offline / timeout / 5xx ⇒ completion vanishes. No queue, no retry, no signal.
2. **No idempotency key sent** — server supports it (`recordGameComplete`, backend/src/controllers/kids.js:755 dedupes on `(child_admission_no, lesson_id, game_config_id, idempotency_key)` via `uq_kids_progress_dedupe`) but the client never generates one, so a naive retry would double-count stars/XP.
3. **Two parallel queues** — SW IndexedDB (`elitekids-offline/syncQueue` in sw.js) vs app-side `offlineDB` syncQueue (lib/offline/db.ts) are separate stores; items can strand in either.
4. **No batch endpoint** — drain sends N sequential POSTs over rural 2G; each pays auth+TLS round-trip.
5. **User blindness** — OfflineBanner has no failed-count signal; kids/parents can't tell progress was lost.

Impact per roadmap: rural data loss = trust loss. Impact **H**, Effort **S**.

## 2. Non-goals

- No conflict-resolution engine (progress rows are append-only facts; last-write-wins is correct here).
- No change to scoring/stars logic.
- No SW cache-versioning work (that's roadmap #4; we only unify the *queue handoff point*).

## 3. Design

### 3.1 Client — submitProgress becomes "try, then enqueue, then signal"

```ts
const idemKey = `${lessonId}:${sessionId}:${Date.now()}`;   // stable per attempt-batch
const body = {
  child_admission_no: admissionNo,
  lesson_id: lessonId,
  score: finalScore,
  stars_earned: ...,
  mode,
  answers_count: answers.length,
  difficulty: ...,
  idempotency_key: idemKey,          // NEW — server already honors it
};

try {
  await apiClient.post(ENDPOINTS.PROGRESS.GAME_COMPLETE, body);
} catch (err: any) {
  const retryable = !err?.status || err.status >= 500 || err.code === 'ECONNABORTED';
  if (!retryable) { reportToBanner('rejected', err); return; }   // 4xx = bad request, don't retry
  const ok = await offlineSync.enqueue({
    endpoint: ENDPOINTS.PROGRESS.GAME_COMPLETE, method: 'POST',
    body,                       // same object → replay-safe via idempotency_key
  });
  if (!ok) reportToBanner('dropped_queue_full');             // MAX_QUEUE_SIZE hit
  else reportToBanner('queued');                             // OfflineBanner: "saved on device"
}
```

Rules:
- Generate `idempotency_key` ONCE per completion event and persist it INTO the queued item (replay uses the SAME key — duplicates collapse server-side even across app restarts).
- Only network/5xx enqueue; 4xx surfaces an error state instead of poisoning the queue.
- `offlineSync.init(listener)` already exists — wire its status into OfflineBanner (`queued/draining/failed` counts).

### 3.2 Client — drain hardening (small, inside roadmap #2 boundary)

- `drainNow()`: stop dropping after MAX_RETRIES when the item carries `idempotency_key` AND endpoint is the progress route — extend cap to 10 with existing backoff array cycled (rural devices go offline >45 s routinely). All other routes keep cap 3.
- Emit `{sent, failed}` through listener (already returned) → banner shows "N pending".

### 3.3 Server — new `POST /kids/sync/batch` (reconciliation endpoint)

Route: `backend/src/routes/kids.js` → controller in `backend/src/controllers/kids.js`.

Request:
```json
{ "items": [
  { "client_ref": "c1", "child_admission_no": "NUR-001", "lesson_id": "LESSON-1",
    "game_config_id": null, "score": 90, "stars_earned": 3, "xp": 15,
    "mode": "learning", "difficulty": null,
    "idempotency_key": "LESSON-1:sess42:1730000000", "completed_at_client": "2026-08-23T07:00:00Z" }
]}
```
Semantics:
1. Validate ≤50 items/request (cap payload); reject non-array.
2. For each item IN ORDER: reuse the exact `recordGameComplete` dedupe+create logic (extract to helper `upsertProgressItem(item, ctx)` so single-post path and batch share one implementation — no drift).
3. Per-item result: `{ client_ref, status: 'created' | 'duplicate' | 'error', id?, message? }`.
   - `duplicate` = idempotency hit (200-level, NOT an error).
   - Item-level failures do NOT abort the batch.
4. Response: `{ success:true, data:{ results:[...], created:n, duplicate:m, failed:k }, failed:k }`.
5. Auth: same student/parent JWT + ownership checks as game-complete (child must belong to caller).

DB impact: **zero schema changes** — `uq_kids_progress_dedupe` already covers `(child, lesson, config, idempotency_key)`; batch relies on the same unique key. Race between two concurrent replays of one item → second INSERT throws ER_DUP_ENTRY → catch → re-read → return `duplicate` (handles the findOne/create TOCTOU window).

### 3.4 Queue-store unification (minimal, defers full #4)

SW `queueRequest` keeps its store but forwards progress-route items to the app store once (on next page load) OR — simpler accepted tradeoff — sw.js stops enqueueing `/kids/progress/*` entirely and lets the page handle it (page JS runs during gameplay; SW interception adds nothing for XHR POSTs that already failed). Document chosen direction in sw.js header comment.

### 3.5 Banner UX (OfflineBanner.tsx)

States: `Synced ✓ | Saving… | Saved on device (n) | Syncing n… | n couldn't sync`. Copy strings externalized per roadmap #3 keys (`offline.banner.*`) so i18n prep lands for free.

## 4. Test plan (hooks into phase-C infrastructure)

- Backend: extend `backend/test/b1-regression.test.js` or sibling `sync-batch.test.js` against hermetic DB:
  - batch of 3 (new, dup-of-first, invalid-item) → `{created:1,duplicate:1,error:1}`, order preserved;
  - concurrent duplicate replay → one row, second returns `duplicate`;
  - ownership check: student token batching another child's admission_no → 403.
- Frontend (manual/E2E): airplane-mode play-through → complete game → banner "Saved on device"; reconnect → drains, stars counted once; kill server mid-drain → retries resume, still exactly one row (idempotency).
- Regression guard: existing `uq_kids_progress_dedupe` tests in kids-routes.test.js must stay green.

## 5. Rollout & rollback

- Ship order: server batch endpoint first (backward compatible, unused), client switch second.
- Rollback = revert client commit; server endpoint is inert without callers. Single-item path unchanged.

## 6. Estimate & sequencing

| Step | Effort |
|---|---|
| Extract upsertProgressItem helper + batch endpoint + tests | 1–2 d |
| submitProgress rewrite + banner wiring + idempotency key plumbing | 1–2 d |
| drain cap tweak + SW handoff comment + E2E manual pass | 0.5–1 d |

Total ≈ **1 week** (roadmap classed S — holds if banner copy reuses existing components).

## 7. Open questions for supervisor

1. Should `xp` be client-reported (current) or server-derived from score×mode? Batch makes spoofing slightly easier; consider server-side clamp.
2. MAX_QUEUE_SIZE 100 — raise to 200 for rural week-long outages? (rows are ~200 B; 200 ≈ 40 KB IndexedDB.)
3. Adopt C-DRIFT-01 fix (kids_session_state model/prod mismatch) before enabling session-save queueing? Progress-only scope avoids it.
