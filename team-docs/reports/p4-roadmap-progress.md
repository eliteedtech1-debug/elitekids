# PHASE 4 ROADMAP BATCH — PROGRESS (6-item dispatch)

STATUS: #2, #1, #3, #4, #6, #11 all IMPLEMENTED in working tree (uncommitted).
Verification: frontend `tsc && vite build` green; vitest 38/38; bundle guard
passes; backend kids-routes + curriculum suites 51/51 (via TEST_DB creds from
backend/.env).

## Checkpoints
- 2026-08-25T20:05Z RESUME. Inherited uncommitted tree: #2 offline progress fix
  (GamePlay submitProgress → offlineSync.enqueue; streak persistence backend
  kidsStreak.js + GET/POST /kids/streak; passport parent-id lookup) and #1
  NERDC layer (KidLesson nerdc_code/strand/sub_strand; createLesson accepts +
  persists; test-db schema). Verified via git diff.
- 2026-08-25T20:07Z #11 DONE. App.tsx: GamePlay + all teacher/admin pages lazy
  route-split (React.lazy + Suspense + RouteFallback). Main bundle 520KB→363KB
  (gzip 114KB); GamePlay isolated to 97.6KB lazy chunk. emojiData: NOT in main
  bundle already (its only importers EmojiPicker/MediaLibrary/StickerButton are
  unreferenced dead components — grep confirmed), so code-split was already
  effectively satisfied; left as-is rather than forcing dynamic imports.
- 2026-08-25T20:08Z #6 DONE. New frontend/src/lib/utils/storage-budget.ts:
  evaluateBudget() pure fn (80% soft limit, 200MB hard ceiling when quota
  unknown, 50MB min headroom) + canPrefetch()/getStorageBudget()/formatBudget().
  Wired into offline content.prefetchAll/prefetchLesson (batch checks) and
  asset-cache.warmCache (between batches). OfflineBanner shows storage-paused
  note when budget exceeded. 7 unit tests added — caught + fixed a real logic
  bug (hard ceiling shadowed soft limit; fixed to strict `>` so exactly-80% is
  allowed).
- 2026-08-25T20:10Z #4 DONE. public/sw.js → v3: CACHE_VERSION gate + purge of
  old shell caches; new `sync` handler posts ELITEKIDS_SYNC message to open
  clients. offline/sync.ts: registers background sync ('progress-sync') on
  enqueue, listens for SW messages → drainNow(); E2 design applied — progress
  endpoints (/kids/progress/game-complete, /kids/progress/item) get 10-retry
  cap with 7-step backoff cycle, others keep 3. Added sync types to
  vite-env.d.ts (lib.dom lacks SyncManager).
- 2026-08-25T20:11Z #3 DONE (seam + reference extraction). New
  frontend/src/lib/i18n/: zustand locale store (en/en-NG, ttsLocale default
  en-NG) + t() with {param} interpolation + en.ts dictionary (~90 keys). TTS
  locale abstraction: sound.ts speak() now uses getTtsLocale() instead of
  hardcoded 'en-US'; speakNumber drops its 'en-NG' hardcode. Extracted strings
  in Login.tsx (all user-facing), Dashboard.tsx (nav cards via titleKey/
  descriptionKey), AdminNav.tsx, OfflineBanner.tsx, OfflineIndicator.tsx.
  Remaining ~200 strings across other pages NOT yet extracted — seam is in
  place, follow the same pattern (see #3 notes below).

## Verification evidence
- frontend: `npm run build` → tsc clean, vite built in ~5s, chunk list shows
  per-route splits. `npm test` → 3 files / 38 tests pass (incl. 7 new
  storage-budget). `node scripts/check-bundle.mjs` → guard passed.
- backend: `TEST_DB_USER/TEST_DB_PASSWORD` from backend/.env → jest
  kids-routes + curriculum → 51/51. (Full suite not run — local root MySQL
  denied without creds; CI runner infra/ci/run-backend-tests.sh is the correct
  entrypoint.)

## Notes / handoff
- Working tree also carries prior-session files: backend/src/controllers/
  kidsStreak.js (new), frontend TeacherAnalytics.tsx (new), ParentChildren.tsx
  rewrite — part of the inherited dispatch, not this batch.
- #3 remaining: extract student/teacher/parent screen strings into en.ts
  (gameplay.*, student.*, teacher.*, parent.* namespaces). TTS abstraction is
  complete; a locale switcher UI is the last optional piece (LOCALES array in
  i18n/index.ts is ready).
- #4 note: `reg.sync.register` is feature-detected; on browsers without
  Background Sync, online-event + periodic drain still cover reconnect.

- 2026-08-25T20:13Z FINAL: batch complete — #3 #4 #6 #11 done, #2 #1 inherited-complete. Frontend build+tests green (38/38), bundle guard ok, backend 51/51. STOP.
