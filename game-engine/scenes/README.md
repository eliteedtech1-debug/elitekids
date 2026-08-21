# Scenes

One Phaser scene class per template (Sprint 3):

| Scene | File (expected) | Reads config template |
| --- | --- | --- |
| `MatchingScene` | `MatchingScene.ts` | `matching` |
| `TapRecognitionScene` | `TapRecognitionScene.ts` | `tap-recognition` |
| `DragSortScene` | `DragSortScene.ts` | `drag-sort` |
| `QuizScene` | `QuizScene.ts` | `quiz` |
| `BootScene` (loader) | `BootScene.ts` | resolves signed URLs, then boots the right scene |

Common contract: every scene reads its validated Game Config JSON, renders from
asset keys resolved to signed URLs, and on completion calls
`this.scene.events.emit('game:complete', { score, starsEarned, xp })` — the
GameEngine wrapper POSTs it to `/kids/progress/game-complete` with an
idempotency key.

No scene may render raw AI output — only schema-validated configs.
