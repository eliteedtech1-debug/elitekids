# Game Engine Integration Plan

The original plan from `EliteKids.zip` stands as-is — this package only changes *where*
the engine lives and how it gets its content (see 02-ELITE-INTEGRATION). Summary for a
fresh reader:

## 1. Why
Interactive learning for nursery-age children: drag-and-drop, matching, picture
recognition, games, rewards and progress — moving children from passive video to
active play. That requires a real game engine, not just video/animation.

## 2. Engine choice: Phaser 3 (TypeScript)
- 2D, canvas/WebGL, runs in any web view → works inside the existing React web app
  (`frontend/`) and can be wrapped for mobile (Capacitor) later without a rewrite.
- Built-in scene manager, physics, tweening, audio, input handling — covers every MVP
  game type.
- MIT-licensed, no per-seat cost.
- Alternative considered: PixiJS (lighter but no scene/physics/input framework) —
  rejected for MVP.

## 3. Core principle: data-driven games, not hand-coded games
The AI Content Engine generates a full lesson package; it also generates a **Game
Config JSON** describing which mini-game to render and with what content — not custom
code per lesson.

```
Lesson request → AI Content Engine → Game Config JSON (validated) → Phaser Loader → Rendered mini-game
```

We build a small, fixed set of **game templates** once; every new topic reuses them by
swapping data.

## 4. MVP game templates

> **Superseded by Doc 12 — Flat template list now governed by Association Ladder tier model**
> 
> The four templates below remain valid as Phaser Scene classes, but each template
> is now subject to tier-based progression (Tier 0→1→2→3) and distractor-count
> constraints defined in Doc 12. See Doc 13 for enforcement rules at the
> authoring/generation step.

| Template | Interaction | Example use |
| --- | --- | --- |
| `matching` | Drag item to its matching pair | Match animal to its sound |
| `tap-recognition` | Tap the correct object among distractors | "Tap the red apple" |
| `drag-sort` | Drag items into correct category bucket | Sort animals: farm vs wild |
| `quiz` | Multiple-choice with animated feedback | 5-question lesson assessment |

Each template = one Phaser Scene class + one JSON schema in `game-engine/schemas/`.

## 5. Game Config JSON (contract between AI engine and game engine)
See `02-ELITE-INTEGRATION/03-API-CONTRACT.md` for the exact resolved shape. Validated
against a JSON Schema **before** it is ever stored, and again before it is served to a
client — malformed AI output must fail closed, never crash the game.

## 6. Asset pipeline
- Generated images/audio are sharp-processed and uploaded to the
  `elite-kids-media-files` B2 bucket under `games/<lessonId>/`.
- Game Config JSON stores relative asset keys only; the frontend resolves them to
  short-lived signed URLs at load time.
- Large assets go through the BullMQ media queue; small game asset sets can process
  synchronously.

## 7. Rewards & progress
Stars/XP/badges are engine-agnostic: the Phaser scene emits a `game:complete` event
with `{ score, starsEarned, xp }`; the backend Progress Service persists it against the
child + lesson record (`kids_progress`, idempotent). The game engine itself is
stateless about long-term progress.

## 8. Where this sits in the wider architecture
The Game Engine is a rendering module inside the elite-kids SPA
(`frontend/src/components/GameEngine/`), fed by the elite-kids-api content pipeline.
It does not require a new infrastructure layer — only a new content type
(`gameConfig`) alongside video/story/image.

## 9. Explicit non-goals for MVP
- No multiplayer.
- No voice-interaction games yet (later stretch item).
- No native mobile build — web-first, wrapped later.
