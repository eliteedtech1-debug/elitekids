# GameEngine (Phaser 3 wrapper)

Mounts/unmounts a Phaser instance cleanly inside React. Data-driven: it fetches a
published Game Config JSON (`GET /kids/lessons/:id/game`), resolves signed asset URLs,
boots the scene matching `config.template`, and emits `game:complete` on finish.

## Scenes to implement (Sprint 3)
| Template | Scene class | Schema |
| --- | --- | --- |
| `matching` | `MatchingScene` | `game-engine/schemas/matching.schema.json` |
| `tap-recognition` | `TapRecognitionScene` | `game-engine/schemas/tap-recognition.schema.json` |
| `drag-sort` | `DragSortScene` | `game-engine/schemas/drag-sort.schema.json` |
| `quiz` | `QuizScene` | `game-engine/schemas/quiz.schema.json` |

## Contract
```ts
interface GameCompleteEvent {
  lessonId: string;
  gameConfigId: string;
  score: number;        // 0–100
  starsEarned: number;  // 0–3
  xp: number;
  idempotencyKey: string; // client-generated, dedupes retries
}
```
POST to `/kids/progress/game-complete` (idempotent on the backend).

## Rules
- Never render a config that failed schema validation (the API only returns
  `published` + validated configs, but validate client-side too with ajv).
- Destroy the Phaser instance on unmount (no leaked listeners) — covered by a
  React Testing Library test.
