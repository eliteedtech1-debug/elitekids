# Story-Based Game + Preview Gap Analysis

- Date: 2026-09-02
- Author: opencode (slave agent, S8 phase)
- Status: ANALYSIS (read-only). No code changes applied. Awaiting supervisor decisions below.

## Why this analysis

User requested a **guide so teachers create a story based on game type, converting learning objectives
into scenes** — and made clear my first test game ("Counting Fruits 1-5", a bare matching game) does
NOT demonstrate whether the system can turn a story into a tangible, educative game. User also wants
**preview** so admins + teachers can play-test a game before submit and before approval.

This is a feature brief. This report captures (1) what exists, (2) what is missing, (3) the design
decisions the supervisor must make before code.

## Part 1 — Scene/Story engine: what actually works today

### Scene types
- SceneEditor (manual GUI) exposes 4 types: `intro`, `teach`, `reinforce`, `match`.
- Backend schema (`game-engine/schemas/scene-script.schema.json`) also has `game_checkpoint`
  (embed a live game mid-scene) — NOT exposed in the GUI, NOT implemented at runtime.
- Scenes serialize to runtime wrapper `[{ scenes: [{ id, text, type }] }]`.

### Teach→Play pipeline (GamePlay.tsx intro phase)
- If scenes exist + no mode pre-selected → phase = `intro` ("Story Time").
- Renders scenes as **text cards** with staggered entrance animation, scene counter.
- Narration: browser SpeechSynthesis TTS via `speakScene()` (two-tone transition + speech).
- Mode picker (Learning/Practice/Test) skips to play; "Skip Story" bypasses scenes.
- After intro → game component by `template`: MatchingGame, TapGame, DragSortGame, QuizGame,
  FillBlankGame, MemoryPairsGame, PuzzleSplitGame.

### Template configs (GameCreator getConfigTemplate)
| Template | Data fields |
|---|---|
| matching | pairs[] {a,b,audio?,image?} |
| memory-pairs | assets.background, assets.items[] {id,image,matches} |
| tap-recognition | prompt, items[] {id,image,text,context}, correctId |
| drag-sort | assets.buckets[], assets.items[] {id,image,bucketId} |
| quiz | question, options[] {id,label,image}, correctId |
| fill-in-blank | sentence (___), blanks[], wordBank[] |
| puzzle-split | originalImageUrl, difficulties{easy,medium,hard,expert} |

Common optional: `characters[] {name,image?,emoji?,personality?}`, `scenario`, `hint`,
`feedbackCorrect/Wrong`, `speechText`, `inputMode tap|speak|both`.

### Working vs Missing (story visual layer)

| Capability | Backend | Frontend renderer |
|---|---|---|
| scene types | yes | yes (text cards only) |
| narration TTS | yes | yes |
| **background images** (schema `background`) | field exists | **NOT rendered** |
| **character illustrations** (rigId/animation/position) | field exists | **static badge only** — no animation |
| scene image field in SceneEditor | — | **no field** |
| narration audio files (`narrationAudio`) | field exists | **not used** — TTS only |
| auto-advance (`durationSec`) | field exists | **not enforced** — click only |
| scene transitions | — | **none** |
| `game_checkpoint` mid-scene embed | type exists | **not implemented** |
| story/recap scene types | — | **no dedicated story/recap type** |

### Verdict
The system CAN already produce a linear story via scenes (text + TTS) framing any game template.
What blocks a visually "tangible" story game is the **missing visual layer** (scene images,
backgrounds, animated characters, transitions). Emoji + game item images partially compensate.

## Part 2 — Preview/play-test: what's missing

**No preview exists anywhere.** Teachers submit blind (JSON `<pre>` only), admins approve blind
(content type + description only).

### Backend gaps
- `GET /kids/lessons/:id/game` (getPublishedGame) hard-filters `content_state:'published'` → 404
  for pending/rejected configs. No staff endpoint serves non-published configs for preview.

### Frontend gaps
- No `/teacher/preview/:lessonId` route (only student `/student/game/:lessonId`).
- No preview button in GameCreator (Step 4 review or Step 5 success), TeacherApprovals, TeacherLessons.
- GamePlay only fetches config by `lessonId`, always records progress (would need `?preview=1` to
  skip `recordGameComplete`, adaptive-profile fetch, review-mixing; default practice mode; back button).

## Part 3 — Design decisions needed from supervisor

User asked a concrete question; I paused for decisions. Pick per item:

### D1 — Scene images (biggest driver of "tangible story")
- **A (fast):** add `image` URL field to SceneEditor; teacher pastes asset-library URLs. Quick.
- **B (richer):** curated background library (farm, classroom, garden, kitchen) select-by-name.
  Requires asset sourcing/creation.
- **C (minimal now):** no scene images; emoji-heavy text + game images. Fastest to ship, least visual.
- *Recommend keeping C for the short-term preview, plan B as a follow-up.*

### D2 — Guide depth
- **A (light):** per-step hint text in GameCreator ("Scene 1: introduce character + setting…").
- **B (full):** dedicated "How to Create Story Games" page with examples + walkthrough.
- **C (template-first):** pre-built story templates per game type; teacher fills blanks
  (character name, setting, etc.). *Recommend C — fastest path to a real, repeatable story game.*

### D3 — Preview format
- **A (text sim):** scene text sequence + play the game (uses existing renderer).
- **B (visual):** scenes with images/backgrounds + play game (needs D1).
- **C (both):** text sim now, visual as follow-up. *Recommend C.*

### D4 — Preview surfaces (independent of D1–D3)
Add preview buttons to: GameCreator Step 4 (pre-submit, in-memory config render) + Step 5
(post-submit), TeacherApprovals cards, TeacherLessons cards. Backend: staff-only preview endpoint
serving any content_state. *This is unambiguous — will implement once D1–D3 settle.*

## Next step (blocked)
Await supervisor decisions (D1–D4), then implement guide + preview per choices.

## Checkpoint
- 2026-09-02: story-game + preview gap analysis saved (this file). No code changes (analysis brief).

## Post-analysis: implementation (2026-09-02, "needs both")
Supervisor chose **both** guide AND preview. Implemented:

### Backend
- `GET /kids/lessons/:id/game/preview` — staff-only (`auth + requireStaff`), serves latest game
  config **regardless of content_state** + scenes, via `getGamePreview` controller
  (`controllers/kids.js`) and route (`routes/kids.js`).
- `listApprovals` now enriches `game_config` approvals with `lesson_id` so the frontend can
  resolve the lesson to preview (`content_id` for a game_config is the config id, not lesson id).

### Frontend
- `GamePlay` preview mode: `?preview=1` OR an in-memory `initialConfig` prop → skips progress
  recording, adaptive/mode-lock/suggested-mode/review-mixing fetches, offline caching, and offline
  queue; shows an indigo banner + back-to-teacher button; always plays the story intro.
- Routes: `/teacher/preview/:lessonId` and `/teacher/preview-draft` (in-memory, pre-submit).
- Preview buttons: GameCreator Step 4 **Test Play** (in-memory) + Step 5 **Preview Game**;
  TeacherApprovals **Preview per card**; TeacherLessons **Preview** per lesson card.
- i18n keys: `game.previewMode`, `game.backToTeacher`, `gameCreator.testPlay`,
  `gameCreator.previewGame`, `teacher.lessons.preview`.

### Guide
- `docs/teacher-game-maker-guide.md`: new section "Turning a learning objective into a story game" —
  objective → character/place/problem → template-mapped story glue → 3–5 scene cards (with a worked
  "Counting Fruits 1–5" example) → test before submit.
- Updated "After publishing — check your work" to point at the new Preview button.

### Verification
- `tsc --noEmit` clean; `npm run build` OK; vitest 48/48 (incl. i18n 10/10).
- `node --check` clean on controllers/kids.js + routes/kids.js.
- Not yet live-deployed; deploy happens on push to origin/main.
