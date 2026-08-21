# Final Phase — Video + Game Convergence & Additional Learning Strategies

Long-term end state: video generation and the game engine converge into one adaptive
learning experience, alongside other reinforcement strategies. Unchanged from the
original plan — this package only means the pieces plug into the EliteKids addon
backend (`kids_scene_scripts` + `kids_game_configs` + `kids_progress`).

## 1. Why converge video and games
Video introduces a concept (see → hear); games practice it (interact → repeat →
practice). Converged, the video and the game share the same generated assets,
characters and vocabulary, and the game directly follows what the video just taught.

## 2. What "using games process" means concretely
Reuse the data-driven pipeline (Game Config JSON → template → Phaser scene) as an
**embedded checkpoint inside a video lesson**:
```
Video Scene 1 (intro) → Video Scene 2 (teach) → [PAUSE: mini-game checkpoint] → Video Scene 3 (reinforce) → [Final game: full assessment]
```
- Scene Planner gains a `game_checkpoint` scene type referencing a `gameId`.
- Checkpoints reuse the same four templates — no new game code, only placement logic.
- Same characters/assets generated once, reused in both video clip and game.

## 3. Additional strategies to layer in at this phase

> **Superseded by Docs 12, 16 — Spaced repetition and adaptive difficulty are now in Doc 16 (Sprint-level)**
> 
> The strategies below are no longer deferred to Sprint 7+. Spaced repetition and
> adaptive difficulty are now part of the core gamification layer (Doc 16, §§1–2)
> and should be implemented alongside the Association Ladder (Sprint 2–3). Voice
> interaction remains a future stretch item.

| Strategy | What it adds |
| --- | --- |
| Spaced repetition | Previously-learned vocabulary/objects reappear in later lessons' games, pulled from the child's progress record (`kids_progress`) |
| Adaptive difficulty | If a child struggles on a checkpoint (low score), the next checkpoint uses an easier variant of the same template |
| Voice interaction | Child answers aloud instead of tapping — stretch item once core templates are proven |
| Story-driven continuity | Same mascot narrates across video, game and worksheet |
| Multi-sensory reinforcement | Song/rhyme paired with a rhythm-tap game variant |

## 4. Architecture impact
Additive to the Content Config Generator (`02-SYSTEM-ARCHITECTURE.md`), not a new
layer:
- Scene Planner gains `game_checkpoint` scene type (`kids_scene_scripts.scene_type`).
- Video Assembly pauses/resumes around embedded checkpoints.
- Progress Service becomes the shared source both video pacing (adaptive difficulty)
  and games read from.

## 5. Where this sits in the roadmap
**Sprint 7+ / post-pilot**, after Sprints 0–6 are complete and validated with real
pilot data.

### Sprint 7 — Convergence (do not start before Sprint 6 is signed off)
- [ ] Extend Scene Planner with `game_checkpoint` scene type
- [ ] Video Assembly: pause/resume logic around a checkpoint
- [ ] Progress Service: expose "recently learned" items for spaced repetition
- [ ] Adaptive difficulty rule: easier variant trigger on low checkpoint score
- [ ] Pilot the converged KG1 "Animals Around Us" lesson end to end
- [ ] Human QA per 07-QA-INSTRUCTIONS.md, with added check: "does the pause/resume feel
      natural, not jarring?"
