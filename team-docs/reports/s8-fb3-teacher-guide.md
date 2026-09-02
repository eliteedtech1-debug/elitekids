# S8-FB3 — Teacher Guide Update (spaced repetition docs)

**Status:** DONE 2026-09-02
**Role:** fb-review (read-only)
**Scope:** Update `docs/teacher-game-maker-guide.md` to (a) reflect the new visual Easy-mode editor + SceneEditor GUI, and (b) document the spaced-repetition Review Zone.

## What changed
Edited `docs/teacher-game-maker-guide.md` only (doc-only, no code).

1. **Header/intro + 5-step table** — now says "no JSON needed", notes the visual form (Easy mode) + optional Advanced tab. Step 3 → "visual form per template", Step 4 → "scene cards".
2. **Scene scripts paragraph** — now describes building scene cards in Easy mode; keeps the underlying wrapper shape for reference.
3. **New "Filling in the forms" section** — covers Step 3 Config form (item rows, tap-the-correct-answer picker, emoji 😊, Library, word-bank chips, Reset to template, green ✓ Valid) and Step 4 Scene cards (Add scene, narration, type, ⭡⭣ reorder, ✕ delete), plus the Advanced (JSON) tab + auto fallback on invalid JSON.
4. **Copy-paste starters** — retitled to "(for the Advanced tab)".
5. **New "Spaced repetition & the Review Zone" section** — documents the 4 stat tiles (Due Today, Reviewed, Day Streak, Accuracy), the `?mode=practice` low-stakes replay, and the adaptive scheduling (7-day accuracy, difficulty, `next_review_at`). Teacher needs no action; low accuracy = reteach signal.
6. **Known rough edges + guided tour** — marked D-OBS-02 (JSON invisible) and D-OBS-09 (JSON-only editing) as resolved by the 2026-09-02 GUI; tour steps 4-5 now reference Easy mode and the form/Add-scene flows; added a Review Zone tour note.

## Grounding (verified against source)
- `frontend/src/components/SceneEditor.tsx` — Easy/Advanced tabs, scene types `intro|teach|reinforce|match`, add/reorder/remove, wrapper shape `[{scenes:[{id,text,type}]}]`.
- `frontend/src/components/GameConfigEditor.tsx` — per-template form controls, `Reset to template`, Advanced JSON two-way bound, invalid-JSON fallback.
- `frontend/src/components/ReviewZone.tsx` — tiles Due Today / Reviewed / Day Streak / Accuracy; due list; `navigate('/student/game/:id?mode=practice')`.
- `frontend/src/lib/api/endpoints.ts` — `REVIEWS.DUE` (`/kids/adaptive/due-reviews`), `REVIEWS.STATS`.

## Not changed (out of scope)
- No code edits; guide remains prose + markdown tables.
- Left `team-docs/templates/*` JSON references intact (all still valid for the Advanced tab).

## Notes for supervisor
- Guide now matches the shipped visual editor (verified live 2026-09-02).
- The Review Zone depends on the adaptive review scheduler having data; it renders an empty state gracefully when there are no due reviews.
