# EliteKids — ECCE Roadmap to Top-Tier Global Status
> Research only — no code, no git. Ranked by **impact ÷ effort**. Max 20 items.
> Stack: React/Vite + Express/Sequelize + MySQL (elite_db / elite_content / elite_bot), 7 game templates, IndexedDB offline, BullMQ/B2 media, Jolly Phonics 5-unit seed.

---

## How to read
Each item: **Title | 2–3 line description | Impact H/M/L | Effort S/M/L | Builds on (existing module/file)**
Impact = learning outcome or reach. Effort: S ≤1 wk, M 2–4 wks, L >4 wks or cross-org. Rank = impact/effort ratio, with Supervisor Priorities weighted highest.

---

### #1 — NERDC Curriculum Code Layer on Lessons & Curriculum Points
Add `nerdc_code`, `nerdc_strand`, `nerdc_sub_strand` to `KidLesson` + `KidCurriculumPoint` and backfill the 15 Jolly Phonics games (and future categories) with official NERDC Early Childhood Care & Education codes. Enables filtering/reporting by NERDC strand, Ministry inspections, and cross-school comparability without changing pedagogy. Map: 42 Jolly Phonics sounds across 7 groups → NERDC Communication/Language & Literacy: phonological awareness, print awareness, oral language; Numeracy strand reserved for Shapes/Numbers category. Propose format `NERDC-ECC-LIT-PA-U{unit}-{soundGroup}` + `NERDC-ECC-LIT-PRINT` and store on `KidCurriculumPoint.mapped_item_ids` linkage.
| Impact **H** | Effort **S** | Builds on `backend/src/models/KidCurriculumPoint.js`, `KidLesson.js`, `KidGameConfig.js` (item_id/tier/category), `backend/src/seeders/jollyPhonicsSeriesSeed.js` (5 units × 3 games, 42 sounds, Creche→Primary), `01-PLANNING/15-CURRICULUM-MAPPING-*.md`, `KidLibraryGame`/`KidClassGameVariant` |

### #2 — Fix & Harden Offline Progress Reconciliation (submitProgress swallowing bug)
`frontend/src/pages/Student/GamePlay.tsx:2444` does `apiClient.post(...).catch(()=>{})` — failures silently vanish, no queue, no retry, no user signal. Fix to route failures through `frontend/lib/offline/sync.ts` + `frontend/lib/offline/db.ts` (IndexedDB `syncQueue`) with idempotency key already on `KidProgress` (`uq_kids_progress_dedupe`). Add server-side `POST /kids/sync/batch` reconciliation: deduplicate by `(child_admission_no, lesson_id, game_config_id, idempotency_key)`, return per-item `created|duplicate|error`, preserve order, surface `failed` count to OfflineBanner. Prevents rural data loss = trust loss.
| Impact **H** | Effort **S** | Builds on `frontend/src/pages/Student/GamePlay.tsx:2432` submitProgress, `frontend/lib/offline/sync.ts` (drainNow/batch), `frontend/lib/offline/db.ts`, `frontend/lib/offline/api.ts`, `backend/src/controllers/kids.js:recordGameComplete`, `backend/src/models/KidProgress.js` |

### #3 — i18n-Readiness Prep: String Externalization + DOM Label Dedup + TTS Abstraction
No full multilingual rollout — prep only. (a) Extract ~200 hardcoded strings from `GamePlay.tsx`, `GardenScene.tsx`, `Login.tsx` etc. into `frontend/src/lib/i18n/strings.en.json` with keys like `game.matching.instruction`; (b) audit/fix DOM label duplication: identical `aria-label`+visible text double-read by screen readers, `role="img" aria-label` on emoji spans that duplicate adjacent `<span>` label — establish rule `aria-hidden` on decorative emoji when text present; (c) define `TTSProvider` interface (`speak(text, opts:{lang, rate, voice})`) wrapping `frontend/src/lib/utils/sound.ts:speak()` so `en-US`/`en-NG` hardcodes become `locale` param, ready for Hausa/Yoruba/Igbo without touching call sites later.
| Impact **H** | Effort **S** | Builds on `frontend/src/lib/utils/sound.ts:128 speak()`, `frontend/src/lib/utils/speech-store.ts`, `frontend/src/pages/Student/GamePlay.tsx` (stripEmoji/speakOrPlay), `frontend/src/lib/utils/emojiData.ts` labels, `frontend/src/components/A11ySettings.tsx` / `SpeechSettings.tsx` |

### #4 — Service-Worker & Sync Hardening for Rural Flaky Networks
Current `frontend/sw.js` (v1, static/api/asset caches) + `frontend/lib/offline/sync.ts` lack: cache versioning migration, background-sync fallback for browsers without `SyncManager`, exponential backoff capped at 3 retries with silent drop, no conflict resolution beyond last-write-wins comment. Harden: versioned cache bust on deploy, `MAX_API_CACHE_AGE` tuning for cheap tablets, periodic `startPeriodicDrain(30s)` as default (not opt-in), SW `queueRequest` → `offlineDB.enqueueSync` unification (today two separate queues: SW IndexedDB `elitekids-offline/syncQueue` vs app `offlineDB`), and add `navigator.connection` aware prefetch throttling.
| Impact **H** | Effort **S** | Builds on `frontend/sw.js`, `frontend/lib/offline/sync.ts`, `frontend/lib/offline/db.ts`, `frontend/lib/offline/content.ts` (prefetchLesson/prefetchAll), `frontend/src/components/OfflineBanner.tsx` |

### #5 — SVG Asset Bundle Replacing Emoji-Only Visuals (with Emoji Fallback)
`frontend/src/lib/utils/emojiData.ts` (57k, 200+ entries) + `getItemVisual` + `CachedImg` fallback chain renders emoji if image fails — but emoji rendering is OS-dependent (missing glyphs on low-end Android, inconsistent color). Bundle ~150 core SVGs (Twemoji-style via `codepoint` already stored) via Vite `?raw` or sprite sheet, serve from `ASSET_CACHE` in SW, keep emoji as last fallback. Guarantees crisp visuals at 1×–3× dpi, offline, no CDN. Unlocks NERDC-aligned illustrations (e.g., Nigerian contexts: `p` not 🐷 Pig default).
| Impact **H** | Effort **M** | Builds on `frontend/src/lib/utils/emojiData.ts`, `frontend/src/lib/utils/icons.ts` (getItemVisual), `frontend/src/components/CachedImg.tsx`, `frontend/sw.js` (isMediaAsset/cacheFirst), `frontend/vite.config.ts`, `backend/src/media/asset-saver.js` (already saves open-source assets to B2) |

### #6 — Storage Budget & Quota Management for IndexedDB + CacheStorage
No quota handling today: `offlineContent.prefetchAll` can OOM cheap 8 GB tablets; `offlineDB` + CacheStorage share same origin quota. Add: `navigator.storage.estimate()` guard before prefetch, LRU eviction by `cachedAt`+TTL (24h already in `content.ts`), per-school cap (e.g., 50 MB), user-visible `getCacheStats()` in settings, and `clearStore` on quota-exceeded. Prevents "app stops working offline" in rural field.
| Impact **H** | Effort **S** | Builds on `frontend/lib/offline/content.ts:getCacheStats`, `frontend/lib/offline/db.ts:clearStore/clearAll`, `frontend/sw.js` (caches.open), `frontend/src/components/OfflineIndicator.tsx` |

### #7 — Adaptive Difficulty via KidMasteryProgress (Comparison Choice)
Use existing `KidMasteryProgress` (`student_id,item_id,tier,attempts_to_mastery,last_regression_flag_at`) to auto-tune distractor count (3→4→6) and tier unlocking per child, vs static thresholds today (`successThresholdPct` in seed). **Option A (recommended, S):** rule engine — 2 consecutive passes at tier → unlock next tier; 2 fails → hold + reduce distractors to 3; regression flag writes `last_regression_flag_at`. **Option B (M):** Bayesian mastery (BKT-lite) with decay; more accurate but needs more data and calibration. Start A, log data for B later. Distinct from Retry — this is proactive scaffolding, not failure routing.
| Impact **H** | Effort **S** (A) / **M** (B) | Builds on `backend/src/models/KidMasteryProgress.js`, `backend/src/models/KidGameConfig.js` (tier/category), `backend/src/controllers/kidsRetry.js` (adjacent), `frontend/src/pages/Student/GamePlay.tsx` (distractor sizing), `01-PLANNING/12-ASSOCIATION-LADDER.md` (3/4-5/6 distractor dial) |

### #8 — Spaced Repetition via KidReviewSchedule (Comparison Choice)
`KidReviewSchedule` already has `next_review_at, interval_stage, last_result` but no scheduler UI or SM-2 loop wired to session. **Option A (S):** fixed intervals 3d→1w→3w→6w (Doc 16 spec), single Practice-mode question folded into next session start, `fail` resets to stage 1 without alarming child. **Option B (M):** adaptive intervals based on `attempts_to_mastery` + response time. Recommendation: ship A (low cognitive load for 3–5y), instrument `last_result` for B later. Garden bloom refresh on successful review (Doc 17) makes review feel rewarding.
| Impact **H** | Effort **S** (A) / **M** (B) | Builds on `backend/src/models/KidReviewSchedule.js`, `backend/src/models/KidEngagementSnapshot.js`, `frontend/src/components/GardenScene.tsx` (bloom), `01-PLANNING/16-GAMIFICATION-DEPTH.md §2` |

### #9 — Audio-First Phonics Scaffolding (Compare: TTS vs Teacher Audio vs Hybrid)
Jolly Phonics demands sound-before-shape. Today `sound.ts` does browser `speechSynthesis` with `en-US` default + `playTone` beeps, no phoneme-accurate Nigerian English phonics. **Option A Hybrid (recommended, M):** keep `speakOrPlay(audioUrl, fallbackText)` pattern in `GamePlay.tsx:182` — teacher-recorded `audio` URL plays first, TTS is fallback; add locale-aware voice picker (`en-NG` preferred, `rate 0.85, pitch 1.1` already) and per-sound phoneme clips (`/assets/phonics/s-ssss.mp3`) bundled in SW. **B Pure TTS (S):** cheapest but mispronounces digraphs (`sh/ch/th`). **C Studio audio only (L):** highest quality, not scalable to 42 sounds × languages. Hybrid wins for ECCE credibility + offline.
| Impact **H** | Effort **M** (Hybrid) | Builds on `frontend/src/lib/utils/sound.ts` (speak, speakOrPlay, getCtx), `frontend/src/lib/utils/speech-store.ts`, `backend/src/media/media.service.js` (B2 audio storage), `frontend/sw.js` (media cache), `jollyPhonicsSeriesSeed.js` (promptMode=audio / responseMode) |

### #10 — Teacher Analytics Dashboard: Pattern-Tracking Digest (Compare: Digest vs Raw Charts)
Backend has `KidGameItemResponse`, `KidEngagementSnapshot`, `KidMasteryProgress`, `KidTestAttempt`, `KidReviewSchedule` but no teacher-facing dashboard; `01-PLANNING/14` forbids composite scores/IQ. **Option A Digest-first (S, recommended):** plain-language sentence feed per class — "5 children strong in Tier 1 Animals, 2 slower in Letters — worth a look" (Doc 14 presentation rules), with charts one tap deeper. **Option B Charts-first (M):** dashboards of bars/heatmaps; visually richer but risks misinterpretation and needs more UX. Ship A to stay ECCE-safe, add B as power-user tab later. Proprietor view stays anonymized aggregate only.
| Impact **H** | Effort **M** | Builds on `backend/src/controllers/kidsTracking.js`, `backend/src/models/KidGameItemResponse.js`, `KidEngagementSnapshot.js`, `KidMasteryProgress.js`, `KidTestAttempt.js`, `frontend/src/pages/Teacher/*` (GameCreator, TeacherLessons), `02-ELITE-INTEGRATION/03-API-CONTRACT.md` |

### #11 — Performance Budget <3s on Cheap Android Tablets (Compare: Lazy vs Preload)
No budget enforced; `frontend/package.json` pulls `phaser@3.90`, `framer-motion`, full `emojiData.ts` (57k) eagerly. Target: <3s first paint on Tecno Pop / Itel 2 GB RAM, 3G. **Option A Lazy (S, recommended):** route-split `GamePlay.tsx` (`.tsx` ~100k lines, 7 templates), lazy-load `phaser` only on game routes, tree-shake `lucide-react`, code-split `emojiData` by category, Vite `manualChunks`. **Option B Aggressive preload (M):** SW precache all lessons; faster second visit, slower first + quota risk. Measure with Lighthouse + `vite build --report`, enforce budget in CI. SW `STATIC_CACHE` already does app-shell caching — expand to include SVG bundle from #5.
| Impact **H** | Effort **S** | Builds on `frontend/vite.config.ts`, `frontend/sw.js` (STATIC_CACHE/install), `frontend/src/App.tsx` (router), `frontend/src/pages/Student/GamePlay.tsx`, `frontend/src/lib/offline/content.ts` |

### #12 — Locale-Aware TTS Abstraction Interface (i18n Prep Companion to #3)
Extract `speak()` hardcodes (`lang='en-US'`, `femaleNames` list, `rate 0.85`) into `TTSProvider` with `getVoicesForLocale(locale)`, `pickVoice(locale, prefs)`, `speak(text, {locale, rate, pitch, voiceName})`. No new languages shipped — seam only. Allows future `locale='ha-NG'|'yo-NG'|'ig-NG'` without touching 40+ `speakAnimal/speakNumber/speakColor` call sites. Store `locale` in `speech-store` (today only `rate/voiceName/pitch`). Fixes `MediaLibrary.tsx:320` `u.lang='en-US'` hardcode as part of same pass.
| Impact **M** | Effort **S** | Builds on `frontend/src/lib/utils/sound.ts`, `frontend/src/lib/utils/speech-store.ts`, `frontend/src/components/SpeechSettings.tsx`, `frontend/src/components/MediaLibrary.tsx` |

### #13 — Accessibility for Special Needs: Switch Access + Dyslexia-Friendly Typography
Existing `accessibility.ts` + `a11y-store.ts` cover colorblind palette, focus rings, reduced-motion, large text, but not: (a) switch/keyboard-only access (1–2 switch scanning for motor impairments — add `tabIndex`, roving focus, `Enter/Space` activation, scan interval setting), (b) dyslexia-friendly font option (OpenDyslexic / Lexie Readable via `@font-face` toggle, letter spacing + line height presets), (c) consistent `aria-live` for feedback. Effort stays S because infrastructure (store, `FOCUS_RING_GAME`, `prefersReducedMotion`) already exists. Test with ChromeVox + external switch.
| Impact **H** | Effort **S** | Builds on `frontend/src/lib/utils/accessibility.ts`, `frontend/src/lib/utils/a11y-store.ts`, `frontend/src/components/A11ySettings.tsx`, `frontend/src/pages/Student/GamePlay.tsx` (all game templates), `frontend/src/components/SpeechInput.tsx` |

### #14 — Parent Engagement Loops (Compare: Weekly Digest vs Real-Time Push)
`KidParentalControl`, `KidProgress`, `KidGardenState` exist but parent app (`frontend/pages/Parent/ParentChildren.tsx`, `ParentActivities.tsx`) is read-only list. **Option A Weekly digest (S, recommended):** automated plain-language email/in-app digest reusing tracking digest copy — "Aisha practiced 4×, mastered s/a/t, garden grew 2 flowers" + one suggested home activity (NERDC-aligned). Builds habit, low noise. **Option B Real-time push (M):** push on every completion; higher engagement short-term, fatigue + privacy concerns, needs push infra. Start A, let parents opt into B later. Ties to reward equity — participation-based, not speed.
| Impact **H** | Effort **M** | Builds on `backend/src/controllers/kidsParental.js`, `backend/src/controllers/kidsGarden.js`, `backend/src/models/KidParentalControl.js`, `KidProgress.js`, `KidEngagementSnapshot.js`, `frontend/pages/Parent/*`, `backend/src/models/KidChild.js` (parent_user_id) |

### #15 — Reward Economy Depth with Equity Guardrails (Compare: Garden-Only vs Sticker+Badge)
Garden (`KidGardenState`) + stickers/emoji already in `emojiData.ts` but economy is shallow. **Option A Garden-centric + participation unlocks (S, recommended):** every session/revisit unlocks decoration (Doc 16 §3 equity: not tied to speed/correctness), mastery badges are additive celebration only, fully offline. **Option B Competitive leaderboard (M):** ranks children; boosts short-term retention but violates ECCE "no discouragement" + Doc 14 "no cross-child comparison" and widens equity gap on slow devices. Depth means more garden types (seasonal events, cultural festivals) + companion customization, not points inflation. Never regress garden on failure (Doc 17).
| Impact **M** | Effort **S** (A) / **M** (B) | Builds on `backend/src/models/KidGardenState.js`, `KidCompanionState.js`, `frontend/src/components/GardenScene.tsx`, `frontend/src/lib/utils/emojiData.ts`, `backend/src/models/KidEngagementSnapshot.js`, `frontend/src/components/CompanionSelect.tsx` |

### #16 — Save/Resume & Session Recovery Hardening
`KidSessionState` (`session_id, student_id, current_item_id, current_tier, saved_state`) + `frontend/lib/offline/api.ts:saveSessionOffline` exist but `GamePlay.tsx` only auto-saves on `game-complete`, not per-question. Harden: debounce save after each answer to `offlineDB` (`STORES.sessionState`) + opportunistic `POST /kids/session/save`, crash recovery modal on relaunch ("Continue where you left off?"), and undo window for mis-taps (Doc 17 §4) so accidental tap ≠ `KidGameItemResponse(correct:false)` poisoning mastery signals. Critical for low-end tablets where app kills are frequent.
| Impact **M** | Effort **S** | Builds on `backend/src/models/KidSessionState.js`, `frontend/lib/offline/api.ts:saveSessionOffline/resumeSessionOffline`, `frontend/lib/offline/db.ts`, `frontend/src/pages/Student/GamePlay.tsx` (phase/state), `01-PLANNING/17-ENGAGEMENT-*.md §4` |

### #17 — Curriculum Completeness & Library-First Content Pipeline
Today only Jolly Phonics (Letters) is seeded; `KidLibraryGame` + `KidClassGameVariant` + `KidCurriculumPoint` are scaffolded but empty for Shapes/Animals/Numeracy. Rank by NERDC strands: next build **Shapes + Early Numeracy** (counting 1–10, comparison) because they are concrete/sensory before abstract Letters (Doc 12 macro-sequence), then Animals. Each new item needs full Tier 0→3 ladder + ECE specialist review before `published` (Content State Machine `generated→pre_screened→pending_human_review→approved→published`). Track coverage metric "12/40 NERDC points ECE-validated" on dashboard.
| Impact **M** | Effort **M** | Builds on `backend/src/models/KidLibraryGame.js`, `KidClassGameVariant.js`, `KidCurriculumPoint.js`, `backend/src/models/KidGameSeries.js`/`KidGameUnit.js`, `backend/src/services/contentGeneratorService.js` + `safetyPipeline.js` + `pedagogyValidator.js`, `01-PLANNING/15-CURRICULUM-MAPPING.md` |

### #18 — Parental Controls Enforcement Hardening (Daily Limit + Time Windows)
`KidParentalControl` (`daily_play_limit_minutes, allowed_time_start/end, set_by`) + `POST /kids/parental-controls` exist but enforcement is suggestion-only in `GamePlay.tsx` (`Session Fatigue` modal dismissible). Harden: server truth (`GET /kids/parental-controls/check`) on session start + SW-enforced block with friendly companion message when limit hit, parent-only settings route (child never sees controls), and `allowed_time` window check respecting device timezone. Align with NERDC screen-time guidance per age band.
| Impact **M** | Effort **S** | Builds on `backend/src/models/KidParentalControl.js`, `backend/src/controllers/kidsParental.js`, `frontend/src/pages/Student/GamePlay.tsx` (showBreakSuggestion), `frontend/lib/offline/db.ts` (offline enforcement fallback) |

### #19 — Content Safety & Pedagogy Validator Tightening (AI Generation Path)
`contentGeneratorService.js` + `safetyPipeline.js` + `pedagogyValidator.js` guard AI-generated games, but `KidLibraryGame` (ECE-validated masters) bypass some checks and `toRuntimeGameConfig` in `kids.js:598` does silent fallback for malformed configs (e.g., drag-sort buckets → ordered list). Tighten: enforce `config_json` schema validation on both generation AND library publish, fail-closed (return 422 not degraded blank), log to `kids_prescreen_log` + `kids_content_generation_audit` (elite_bot), and add NERDC-tag validation (reject publish if NERDC code missing after #1 lands). Keeps "library-first" trust intact as scale grows.
| Impact **M** | Effort **M** | Builds on `backend/src/services/contentGeneratorService.js`, `safetyPipeline.js`, `pedagogyValidator.js`, `backend/src/models/KidPrescreenLog.js`, `KidContentAuditLog.js`, `backend/src/controllers/kids.js` (toRuntimeGameConfig, approveLesson) |

### #20 — Offline-First Analytics & Telemetry (Privacy-Preserving, No PII)
Add offline telemetry queue (reuse `syncQueue` pattern) for: `sync drain latency`, `cache hit rate`, `session abandon point`, `TTS fallback rate`, `storage quota pressure` — all aggregated, no child PII, no cross-child ranking. Enables data-driven tuning of spaced-repetition intervals, distractor thresholds, and break suggestions per age band (Doc 16 §5) once real rural usage arrives. Staff sees anonymized trends only (Doc 14 rule). Small effort, unlocks every other item's iteration.
| Impact **M** | Effort **S** | Builds on `frontend/lib/offline/db.ts` (offlineAnalytics store), `frontend/lib/offline/sync.ts` (trackSyncDrain), `backend/src/models/KidEngagementSnapshot.js`, `backend/src/controllers/kidsTracking.js`, `frontend/sw.js` (queue metrics) |

---

## Rank Summary (top = do first)

| Rank | Title | Impact | Effort | Ratio | Supervisor Priority |
|------|-------|--------|--------|-------|---------------------|
| 1 | NERDC Curriculum Code Layer | H | S | ★★★ | **#1** |
| 2 | Offline Progress Reconciliation Fix | H | S | ★★★ | **#2** |
| 3 | i18n-Readiness Prep | H | S | ★★★ | **#3** |
| 4 | SW & Sync Hardening | H | S | ★★★ | **#2** |
| 5 | SVG Bundling vs Emoji | H | M | ★★☆ | **#2** |
| 6 | Storage Budget Management | H | S | ★★★ | **#2** |
| 7 | Adaptive Difficulty (KidMasteryProgress) | H | S | ★★★ | comparison |
| 8 | Spaced Repetition (KidReviewSchedule) | H | S | ★★★ | comparison |
| 9 | Audio-First Phonics Hybrid | H | M | ★★☆ | comparison |
| 10 | Teacher Analytics Digest | H | M | ★★☆ | comparison |
| 11 | Perf Budget <3s | H | S | ★★★ | comparison |
| 12 | TTS Abstraction Interface | M | S | ★★☆ | **#3** companion |
| 13 | Special-Needs Accessibility | H | S | ★★★ | comparison |
| 14 | Parent Engagement Loops | H | M | ★★☆ | comparison |
| 15 | Reward Economy Equity | M | S | ★★☆ | comparison |
| 16 | Save/Resume Hardening | M | S | ★★☆ | **#2** |
| 17 | Library-First Content Pipeline | M | M | ★★☆ | — |
| 18 | Parental Controls Enforcement | M | S | ★★☆ | — |
| 19 | Safety & Pedagogy Validator | M | M | ★☆☆ | — |
| 20 | Offline Telemetry | M | S | ★★☆ | — |

---

## Comparison Winners (so supervisor can pick)

- **Adaptive difficulty:** **A Rule-engine (S)** now → **B BKT-lite (M)** later. A ships in 1 wk, uses existing `KidMasteryProgress` + distractor dial, logs data for B.
- **Spaced repetition:** **A Fixed 3d/1w/3w/6w (S)** now → **B Adaptive (M)** later. A matches Doc 16 spec exactly, garden bloom makes review rewarding without new UI.
- **Audio-first phonics:** **Hybrid (M)** wins — teacher audio → bundled phoneme SVGs/audio → TTS fallback via `speakOrPlay`. Pure TTS mispronounces `sh/ch/th`; studio-only not scalable.
- **Teacher analytics:** **Digest-first (S)** wins for ECCE safety (no composite score, plain language). Add charts as tab 2 after validation.
- **Reward economy:** **Garden-centric participation unlocks (S)** — no leaderboard, no speed gates, never regress garden. Cultural/seasonal garden events > points inflation.
- **Parent loops:** **Weekly digest (S)** wins — habit-forming, low noise, reuses tracking copy. Real-time push as opt-in later.
- **Special needs:** Ship **switch access + dyslexia font (S)** together — both toggle-based, reuse `a11y-store` + `FOCUS_RING_GAME`.
- **Perf <3s:** **Lazy route-split + code-split emoji (S)** now → SW precache of SVG bundle after #5. Budget enforced in CI.

---

## Files Touched (for reference, no edits made)

Backend models already in schema: `KidMasteryProgress`, `KidReviewSchedule`, `KidCurriculumPoint`, `KidLesson`, `KidGameConfig`, `KidProgress` (idempotent key), `KidSessionState`, `KidParentalControl`, `KidGardenState`, `KidCompanionState`, `KidEngagementSnapshot`, `KidGameItemResponse`, `KidTestAttempt`, `KidInterfaceOnboarding`, `KidGameSeries/Unit`, `KidLibraryGame/ClassGameVariant`.

Frontend offline: `frontend/lib/offline/sync.ts`, `db.ts`, `api.ts`, `content.ts`, `frontend/sw.js`, `frontend/src/pages/Student/GamePlay.tsx:2432` (bug), `frontend/src/lib/utils/sound.ts`, `speech-store.ts`, `emojiData.ts`, `icons.ts`, `accessibility.ts`, `a11y-store.ts`, `CachedImg.tsx`, `GardenScene.tsx`, `vite.config.ts`.

---

## Top-3 I Would Personally Greenlight First (and why)

**1. #2 Offline Progress Reconciliation Fix (H/S)** — Silent `.catch(()=>{})` in `submitProgress` means every rural session with flaky signal loses mastery data with no signal to user or teacher. It poisons #7/#8/#10 downstream. One-line to route through `syncQueue` + batch reconciliation; highest trust leverage.

**2. #1 NERDC Curriculum Code Layer (H/S)** — Without NERDC codes the platform cannot pass Ministry alignment checks, cannot report by strand, and Jolly Phonics (British, 42 sounds) looks like an import rather than a Nigerian ECCE solution. Schema addition is tiny; unlocks partnerships, procurement, and every future content decision.

**3. #3 i18n-Readiness Prep (H/S)** — The cost of *not* doing this now is retrofitting 100+ hardcoded strings, duplicated `aria-label`s, and `en-US`/`en-NG` TTS hardcodes after content and UI have sprawled. String extraction + TTS abstraction is a seam that makes every later item (#9, #12, #14, NERDC contexts) cheap instead of painful.

*Honorable next: #4 SW hardening + #6 storage budget (same sprint, same offline theme) and #11 perf budget — together they make the app actually usable on the Tecno/Itel tablets the mission depends on.*
