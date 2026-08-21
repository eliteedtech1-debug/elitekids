# EliteKids — Engagement & Accessibility Layer
*Rounds out EliteKids to modern-ed-game standard: a visual progress metaphor, companion character, offline resilience, parental controls, accessibility, and feedback "juice" — all wired explicitly into the child progress loops already defined (Docs 12, 14, 16), not floating separately from them.*

## 1. Visual Progress Metaphor (Non-Numeric, Child-Facing)
Progress must be *felt*, not scored — no numbers, charts, or "you're behind" ever shown to a child (Doc 14's rule holds absolutely).

**Design: "The Growing Garden"** (or equivalent age-appropriate metaphor — final choice with ECE center input per Doc 15).
- Each mastered item/tier plants or grows something in the child's own garden scene — a flower for each animal learned, a tree that grows taller as letter tiers are completed.
- **Wired to real progress loops, not decorative:**
  - Completing a Tier 0→3 ladder for an item → a new garden element appears (ties to Doc 12's tier completion).
  - A successful spaced-repetition review (Doc 16, §2) → the corresponding garden element gets a small visual refresh (e.g., a flower blooms again) — this is what makes review feel rewarding rather than repetitive.
  - Test-mode struggle routed to Practice (Doc 16, §1) → no garden regression, ever. The garden only ever grows or stays — this protects the "no discouragement" principle while still being honest (a struggling child's garden just grows a bit slower, never visibly shrinks).
- The garden is visible on login as part of the "welcome back" moment (already described for the week-6 dashboard) — this is literally what fills that screen now, rather than a blank welcome.

## 2. Companion Character (Persistent, Reactive)
A consistent mascot with light personality and continuity across sessions — proven engagement driver in successful ed games.

- **One companion per child** (chosen or assigned at first login, part of Interface Onboarding, Doc 16 §6), not per-game — this is what makes the relationship feel continuous.
- **Reacts to real events in the progress loops**, not generic praise: celebrates a new tier ladder completed, gently encourages during a Practice retry ("let's try again together!"), acknowledges a returning child after time away (ties into the spaced-repetition re-engagement moment).
- Companion appearance can use the existing emoji/sticker customization system (already built) — same reward-equity rule applies (Doc 16 §3): companion customization unlocks by participation, not performance.

## 3. Offline / Low-Bandwidth Mode
Genuinely important given inconnectivity is common in the deployment context.

- **Core gameplay (Learning/Practice/Test modes, Tier 0–3 content already downloaded) must function fully offline** — no network dependency mid-session.
- **Sync-on-reconnect model:** all progress (test_attempts, review_schedule, garden state, companion state) is written locally first, synced to the server opportunistically. This directly protects the integrity of the progress loops — a child's session shouldn't be lost or feel broken because connectivity dropped mid-play.
- Content library items are pre-downloaded per class/school (ties to Doc 15's library model — a curated set, not an infinite on-demand catalog, makes this genuinely feasible to cache).
- New/updated library content and curriculum mapping updates sync when connectivity is available, not required for daily play.

## 4. Save / Resume & Error Recovery
- Every game session auto-saves state after each question/interaction, not just at session end — a closed app or dropped session resumes exactly where the child left off, not from the start of that item's ladder.
- **Undo affordance for accidental taps** — young children mis-tap often; a brief "are you sure" or short undo window before a Practice/Test answer is finalized prevents a genuine misclick from being logged as an incorrect answer and feeding a false pattern into Doc 14's tracking or Doc 16's retry logic.
- Crash/force-close recovery: on relaunch, the child returns to their last saved point automatically, no lost progress, no manual restart needed.

## 5. Parental Controls (Beyond the Session-Fatigue Suggestion)
Doc 16 §5 only suggests a break — this adds actual controllable limits, parent-facing:

- **Daily play-time limit**, settable by parent/teacher (default: sensible age-appropriate ceiling, confirmed with ECE center) — enforced, not just suggested, once reached.
- **Time-of-day windows** (e.g., no play during typical school/sleep hours) — optional, parent-configurable.
- Controls live in the Parent Dashboard (same app ecosystem as EliteFees' parent-facing patterns — consistent UX language across Elite products) — never accessible or visible to the child.

## 6. Accessibility (Beyond Font Size & TTS)
- **Large, well-spaced tap targets** — accommodates developing fine motor control, not just visual accessibility.
- **Colorblind-safe palette** for any correct/incorrect or category-differentiation visuals — verified against standard colorblind simulation, not assumed.
- **Reduced-motion option** — some children (including some with attention or sensory differences) benefit from calmer transitions; animation intensity should be adjustable, not fixed.
- **Consistent, predictable interaction patterns** across all game templates (matching, tap-recognition, drag-sort, quiz) — reduces cognitive load for children with attention differences, ties directly back into why Interface Onboarding (Doc 16 §6) matters so much.

## 7. Feedback "Juice" (Tactile & Audio Satisfaction)
- **Haptic feedback** (on supported devices) for correct taps — a genuine driver of the "satisfying" feel that makes a child want to keep playing.
- **Sound design tiers**, distinct and consistent: gentle/neutral for Learning mode (never a harsh "wrong" sound — ties to the no-discouragement principle), warmer celebratory sound for Practice-mode correct answers, calm and neutral (no feedback sound at all) for Test mode, consistent with the "no visual feedback in Test mode" rule already established.
- Companion character (§2) can be the source of audio feedback — reinforces the persistent-relationship design rather than generic system sounds.

## How This Closes the Full Progress Loop
Putting it together, a returning child's session now flows as one coherent experience, not disconnected systems:

```
Login → Companion greets child by name → Garden/progress view shown
    → Spaced-repetition review surfaces first (light, folded into play, Doc 16 §2)
    → Companion reacts to the outcome
    → Child continues from saved position in current item's tier ladder (Doc 12)
    → Any Test-mode struggle routed gently to Practice (Doc 16 §1), no garden regression
    → New tier/item completions grow the garden, celebrated by companion
    → Reward/customization unlocks shown, tied to participation (Doc 16 §3)
    → Session ends at a natural fatigue-aware break point (Doc 16 §5), or parent-set limit (§5 here)
    → All progress synced when connectivity allows (§3), nothing lost if offline (§4)
```

Every loop element referenced above (Docs 12, 14, 16) is now explicitly wired to a visible, felt, child-facing experience — not just backend logic with no surface expression.

## QA Requirement
Add tests: (a) full offline session completes and syncs correctly on reconnect; (b) force-close mid-session resumes at the correct saved point; (c) garden state never regresses on a Test-mode failure; (d) daily play-limit enforcement actually blocks further play once reached, not just a soft warning; (e) colorblind-safe palette verified against simulation for all correct/incorrect visual cues.
