# Q2 speech slice 3 — in-engine speech lessons (Buffy, Q24)

**Goal:** teacher-created speech lessons (`speech-letter` / `speech-word` / `speech-sentence`,
registered in Q2 slice 2) finally PLAY inside the game engine. Today a kid opening one at
`/student/game/:lessonId?mode=…` hits GamePlay, which has no speech-template branch → dead end.
`/student/speech` practice page remains for standalone packs.

**Payload shape (verified):** teacher speech configs store `items: [{ id, expected_text, mode }]`
(`frontend/src/pages/Teacher/GameCreator.tsx` templates map). The lesson-game endpoint returns
config via `toRuntimeGameConfig` unchanged → GamePlay's `config.items` carries `expected_text`.
`gameConfigRules.validateManualConfig` passes speech templates through the ungated path (no schema gate).

## Changes

1. **`frontend/src/components/SpeechGame.tsx`** — additive, backwards-compatible:
   - New prop `embedded?: boolean` (default false). When true: finish does NOT `navigate('/student')`
     and suppresses its success toast (GamePlay owns chrome + phase flow).
   - Enrich `onAttempt` payload → `{ …AssessResult, transcript, expected_text, question_id }`
     (needed for GamePlay's `answers[]` result review + SRE grading + failed-item recording).

2. **`frontend/src/pages/Student/GamePlay.tsx`**:
   - Import `SpeechGame`.
   - Extend `GameConfig.items[]` element type with `expected_text?: string; mode?: string`.
   - New local adapter `SpeechLessonGame` (same props contract as other template games):
     maps `config.items` → `SpeechItem[]` (mode from item or template suffix: letter/word/sentence),
     renders `<SpeechGame embedded items onAttempt→onAnswer({correct: passed, expected, given: transcript,
     question_id, lesson_id}) onComplete={passedCount → onComplete(passedCount*10)} />`.
     Empty-items fallback card (never hang).
   - Add dispatch branch in the play-phase game area:
     `{config.template?.startsWith('speech-') && <SpeechLessonGame … />}`.
   - Add speech case to `totalPossible` useMemo → count of items with `expected_text`.

No backend changes. Reuses existing completion/award/SRE/offline flow untouched.

## Verify
- `cd frontend && npx tsc --noEmit` clean · `npx vitest run` green (117 baseline) · build OK.
- Manual-ish smoke path (teacher-created speech lesson published → child opens practice/test →
  SpeechGame renders in-engine, score/star submit + result screen appear).

## DONE when
- Q24 QUEUE row marked DONE with commit; progress checkpoint appended; speech lessons play in-engine.
