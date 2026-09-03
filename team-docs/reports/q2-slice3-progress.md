# Q2 speech slice 3 — in-engine speech lessons + team dispatch (Buffy, 2026-09-03)

Brief (MASTER): "continue implementing Q2; add opencode to the team; give him less dependency work."

## Dispatch (QUEUE.md + briefs)
- **Q24** (Buffy/worker): in-engine speech lessons — SpeechGame embedded mode + GamePlay bridge. RUNNING → IMPLEMENTED this session (uncommitted, awaiting MASTER order).
- **Q25** (opencode): Pronunciation Coach + ReadingTracker FE over LIVE /kids/speech endpoints — zero cross-lane deps.
- **Q26** (opencode): DrawingCanvas + TracingGuide + DrawingFeedback (Q2-G, pure canvas — no TF.js/backend).
- **Q27** (opencode, held until Q24 MERGED): speech-story/count template registration.
- Briefs: `team-docs/briefs/q2-opencode-lowdep.md` (Q25+Q26, out-of-scope rules), `team-docs/briefs/q2-slice3-engine-speech-brief.md` (Q24).

**Dependency logic:** opencode gets leaf tasks consuming only what is ALREADY live (speech assess/progress
endpoints, canvas APIs) so he can never block. Worker keeps the integration-heavy slice (GamePlay engine).

## Implementation (Q24)
**Problem:** speech-letter/word/sentence lessons are teacher-creatable (slice 2) but unplayable —
GamePlay has no speech-template branch → `/student/game/:lessonId` dead-ends for them. Only the
standalone `/student/speech` practice page worked.

**Payload verified:** teacher speech configs = `items:[{id, expected_text, mode}]` (GameCreator
templates); `validateManualConfig` passes speech via the ungated path; lesson-game endpoint returns
config unchanged → `config.items` carries expected_text.

**Changes:**
1. `frontend/src/components/SpeechGame.tsx`
   - New `embedded?: boolean` prop — when hosted in GamePlay, finishing does NOT toast/navigate('/student') (host owns chrome + phase flow). Backwards-compatible (SpeechPractice unaffected).
   - `onAttempt` enriched → `SpeechAttemptResult = AssessResult & { transcript, expected_text, question_id }` so the engine can build review answers + SRE grading + failed-item records.
2. `frontend/src/pages/Student/GamePlay.tsx`
   - Import SpeechGame; `GameConfig.items[]` element type + `expected_text?/mode?`.
   - New `SpeechLessonGame` adapter: maps items → SpeechItem[] (mode from item or template suffix), renders `<SpeechGame embedded …>`, bridges attempts → `onAnswer({correct: passed, expected, given: transcript, question_id, lesson_id})`, completion → `onComplete(passedCount*10)` (10 pts/item, same pacing as other templates). Empty-items fallback card — never hangs.
   - Play-phase dispatch branch: `config.template?.startsWith('speech-')` → adapter (covers future story/count templates automatically).
   - `totalPossible` speech case (count of items with expected_text).
3. i18n: `game.speech.noItems` added to en.ts + locales/en.json + locales/ha.json (integrity test enforced it).

No backend changes. Reuses existing completion/award/SRE/offline flow untouched.

## Verify
- `tsc --noEmit` clean · vitest **117/117** · `vite build` OK (chunk-size warning pre-existing).
- (vite build regenerated frontend/dist — deploy artifact, harmless.)

## CHECKPOINTS
- 2026-09-03 22:41: Q2 scope + dependency map done; QUEUE rows Q24–Q27 appended (opencode low-dep Q25/Q26/Q27-held, worker Q24); briefs written.
- 2026-09-03 22:45: SpeechGame embedded mode + enriched attempt payload implemented.
- 2026-09-03 22:47: GamePlay SpeechLessonGame adapter + dispatch + totalPossible implemented; tsc clean.
- 2026-09-03 22:49: i18n `game.speech.noItems` added EN/HA; vitest 117/117.
- 2026-09-03 22:50: vite build OK.

**FINAL STATUS:** Q24 IMPLEMENTED (uncommitted — awaiting MASTER commit/push order; auto-deploy fires on push).
Q25–Q27 queued for opencode. IDLE: worker lane has no further QUEUED rows (next real chunk = Q2-C drawing
engine or Q2-E portfolio — both need MASTER sequencing decision).