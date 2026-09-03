# BRIEF — L2-FE: Frontend Experience (G1–G7 frontend half)

**Dispatched:** 2026-09-03 · **Agent:** opencode worker (tmux `phaseG2`) · **Lane:** L2-FE
**Source specs (read first):**
- `team-docs/TECH-SPEC-STORY-GAMES-100PCT.md` (Phases A–D frontend tasks)
- `team-docs/TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.md` (Phases 2–3 frontend tasks)
- `team-docs/TECH-SPEC-LEARNING-PATH.md` (Phase 2 frontend tasks)
- `team-docs/EXECUTION-PLAN-BRIDGE-ALL-GAPS.md` (lane/file ownership)
**Compliance:** C5/C7. You own `frontend/src/**` (and `frontend/vite.config.ts`) — do NOT
touch `backend/**`, `game-engine/**` (L1-BE owns them), `docs/**`. Progress file:
`team-docs/reports/fe-progress.md`.

## RUN-RULES (mandatory)
1. CHECKPOINT every step (UTC timestamp + done-what) to `team-docs/reports/fe-progress.md`.
   Session may die ~30–60 min — resume from last checkpoint.
2. Small tool calls; no blocking wait >60s.
3. **NEVER git commit or push.** MASTER merges.
4. `tsc --noEmit` clean + `npm run build` OK before declaring any phase done; vitest green.
5. i18n: every new string gets an `en.ts` key AND matching `ha.json` entry (i18n gate test
   enforces parity — run `npm test` i18n file).

## Phase 1 — Registry parity + wizard cards (align with L1-BE Phase 1–2)
- `frontend/src/lib/utils/constants.ts` `GAME_TEMPLATES`: add `memory-pairs` (missing today)
  + `label-diagram` + `stage-sequence`.
- `frontend/src/lib/types/game.ts`: `GAME_INTERACTIONS` entries (label-diagram prompt
  text/image/audio → response image/text; stage-sequence prompt image/audio → response text).
- `GameCreator.tsx`: two TEMPLATES cards (icon/label/desc, distinct colors) + starter configs
  in `getConfigTemplate()` matching the schema shapes in TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.
- NOTE (MASTER product decision 2026-09-03): no standalone `clock-reading` template. Clock
  learning = a **`stage-sequence`** lesson (ordered AnalogClock frames 1:00→3:15→3:45, simple
  → complex, closing analog-clock checks).
- **Exit:** wizard shows 9 templates; starter JSON valid.

## Phase 2 — AnalogClock + LabelDiagram + StageSequence renderers
- `frontend/src/components/AnalogClock.tsx` (pure SVG: numerals 1–12, 60 ticks, hour/min
  hands from `time`, `animate` sweep, `highlight`; props size/showNumerals/face color) — the
  clock graphic used by stage-sequence steps/checks and quiz `visual`.
- `frontend/src/components/LabelDiagram.tsx`: diagram image (CachedImg) + hotspot hit zones
  (% x/y/r), `label-to-part` / `part-to-label` / `mixed` modes, label banner + TTS feedback,
  generous tap targets per age tier.
- `frontend/src/components/StageSequence.tsx` (or GamePlay branch): plays `steps[]` IN ORDER
  (graphic kind image | analog-clock | emoji, narration TTS, auto-advance per durationSec,
  tap to pause/advance, never shuffled) then closing `assessment[]` checks with feedback.
  Assessment kinds: text | analog-clock | image (chip choice) AND `label-diagram`
  (tap-the-part on a real diagram — reuse LabelDiagram hotspot hit-testing; MASTER decision
  2026-09-03: label-diagram stays a standalone template too, and stage-sequence can embed
  diagram challenges, e.g. plant growth sequence ends with "tap the parts of the grown plant").
- GamePlay renderer branches (`pages/Student/GamePlay.tsx:4408-4432` + round counts at
  :3451-3457) for label-diagram + stage-sequence.
- **Exit:** vitest for hand math (3:00/3:15/3:30/3:45/12:00), hotspot correct/incorrect taps,
  mode switch, sequence order preservation (never random); build clean.

## Phase 3 — Story scene visual layer (illustrated stories)
- `frontend/src/lib/utils/scenes.ts` + test: `normalizeSceneScript()` legacy `{id,text,type}`
  → v2 (adds background/image/characters/transition/durationSec defaults; emoji fallback chain).
- `SceneEditor.tsx` v2 fields per card: image URL, background picker, character picker
  (from `/kids/scene-library`), transition select, duration input, type dropdown incl.
  `game_checkpoint` + `recap`; Easy/JSON sync emits canonical v2.
- GamePlay intro: `SceneRenderer` — background layer (palette/art) → characters at position →
  scene image → text card → narration (narrationAudio else TTS) → auto-advance on
  durationSec (pause on tap) → transitions; `game_checkpoint` scene embeds a game (preview
  semantics — NO progress write) then resumes scenes.
- `StoryTemplatePicker.tsx`: load `/kids/story-templates`, apply scaffolds to SceneEditor.
- **Exit:** old text-only scene lessons still play (normalizer); illustrated story plays in
  Test Play + Preview; vitest for renderer + normalizer.

## Phase 4 — Learning Path dashboard + goals
- `frontend/src/components/LearningPath.tsx`: vertical snake path from
  `GET /kids/learning-path` — unit phase nodes w/ lesson dots, state colors (✅ passed, ⭐
  completed, 🔒 locked + reason, pulsing current), ↪ spill-over segment, avatar current
  marker; locked nodes not clickable.
- `frontend/src/components/GoalCard.tsx`: weekly goal banner + child goal setter
  (`POST /kids/goals`), auto state from `GET /kids/goals`.
- `StudentHome.tsx`: **Learning Path becomes the default first view** replacing the flat
  All-Games grid as primary; keep Festival/Trophy tabs; subject tabs become an in-band
  secondary filter only (never widen age band). Remove the `classFiltered = lessons`
  fallback (client side) — path data is already band-capped by backend.
- `endpoints.ts`: `LEARNING_PATH`, `GOALS.GET/POST`; i18n keys `student.path.*`.
- Offline: path renders from `offlineContent` catalog + cached progress when offline.
- **Exit:** a KG1 fixture child sees only ≤KG1 path nodes; locked/spillover/goal render
  correctly offline + online; vitest for path states.

## Finish
Append FINAL status line to `team-docs/reports/fe-progress.md` (per-phase shipped/remaining)
and STOP — MASTER polls.
