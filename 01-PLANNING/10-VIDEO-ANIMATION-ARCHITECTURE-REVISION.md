# Video Architecture Revision — Animation Rig System (replaces raw AI video generation)

Supersedes "AI generates video clips directly". Deliberate architecture change based on
a known, unsolved industry problem: AI video models cannot reliably keep a character
visually consistent across generated clips, and every clip is an unconstrained
generation with real cost and safety exposure. **Unchanged from the original plan**;
EliteKids stores the resulting Scene Script JSON in `kids_scene_scripts` (elite_content).

## The change
| Original approach | Revised approach |
| --- | --- |
| AI video model generates each scene's pixels directly | AI composes and animates a **fixed library of pre-built character rigs and backgrounds** |
| Character consistency depends on the video model | Character consistency is guaranteed — it's the same rig every time |
| Cost scales with video-model generation per clip | Cost scales with cheap animation rendering |
| Safety depends on the video model "behaving" | Safety is structural — a rig can only do what it's built to do |

## How it works
1. **Asset library (built once, reused forever):** 2D skeletal character rigs (Spine,
   Rive, or similar), backgrounds, object sprites — illustrated/designed by a human
   artist or licensed asset pack, not AI-generated per lesson.
2. **AI's job changes from "generate video" to "direct a scene":** the AI outputs a
   structured **Scene Script JSON** — characters, background, animations/poses/
   expressions in sequence, narration text, timing. Same principle as Game Config JSON.
3. **A rendering/animation engine assembles the final video** from rig + Scene Script
   JSON + generated narration audio (TTS/voice actor) + subtitles + music.
4. **New assets are a deliberate, reviewed content addition** — nothing visual reaches
   a child that wasn't explicitly designed and approved to exist.

## Scene Script JSON (validated before rendering — same pattern as Game Config)
```json
{
  "sceneId": "kg1-animals-scene-02",
  "lessonId": "kg1-basic-science-animals",
  "background": "farm-daytime",
  "characters": [
    { "rigId": "buddy-the-fox", "animation": "point-and-explain", "position": "left" }
  ],
  "narrationText": "Look! A cat says meow.",
  "narrationAudio": "media/kg1-animals/scene-02-narration.mp3",
  "durationSec": 8,
  "subtitles": true
}
```
Validated against `game-engine/schemas/scene-script.schema.json` before storage and
before serving. Same state machine as game configs (`kids_scene_scripts.content_state`).

## Impact on the roadmap
- Sprint 2 is **"Content Config Generator"** — same schema-validation pattern extended
  to scenes, not just games.
- A one-time task: commission/license the initial character rig + background asset
  library before any video work starts (design task, in parallel with Sprints 0–1).
- "AI video generation integration" is replaced by "animation rendering engine
  integration" — faster and cheaper to build because it assembles known assets.

## Why this gets you to convergence faster, not slower
The Final Phase doc (08) already treats video and games as sharing the same asset/
character layer. This revision makes that true by construction — the same rig used in a
video scene is the same rig used in a game template.

---

# Implementation Progress Report — Addendum (2026-08-17)

*This supplements the original Doc 10 in the first EliteKids planning package. Read the original Doc 10 above for full history; this captures what's changed since.*

## Confirmed Built (per Ishaq, in-progress verification needed against actual code)
- **GameOS core works** — Phaser 3 interpreter rendering GDL-defined games, confirmed functional.
- **Emoji chooser** — child can select emoji for character customization.
- **Animation motions** — added for game-feel/engagement.
- **Font adjustments** — readability improvements for early-years audience.
- **Text-to-speech fallback** — when a narration audio asset isn't available, TTS generates speech instead of failing silently. Reliability improvement, not originally spec'd this explicitly — worth folding back into the core architecture doc as a standing requirement.
- **User self-stickers** — child can select/apply stickers to graphical characters, personalization layer.
- **Category grouping** — Shapes, Animals, English Letters (initial set).
- **Three game modes implemented:**
  - **Learning mode** — gameplay itself, no testing.
  - **Practice mode** — child answers, correct/incorrect shown.
  - **Test mode** — timer on, no visual feedback on correct/incorrect.

## New Since Original Package (this session)
- **Doc 12 — Learning Progression & Association Ladder** — formal tier model (Exposure → Receptive Recognition → Cross-Modal Association → Expressive Recall), replacing flat category tabs as the only structure.
- **Doc 13 — Pedagogy Enforcement Layer** — GDL schema extended with `category`/`tier`/`item_id`, sequential unlock, distractor-count constraints, orphan detection. This is a required architectural addition, not optional guidance — needs implementation before more content is authored at scale, or existing content will need retrofitting.
- **Doc 14 — Pattern Tracking & Parent/Teacher Insights** — descriptive learning-pattern signals (learning style, mastery, engagement) for parents/teachers. Explicitly scoped to exclude behavioral/personality inference and developmental/psychological assessment (see doc for the reasoning) — those were considered and deliberately excluded, not overlooked.

## Gap to Resolve
The three existing game modes and category grouping were built **before** the Association Ladder (Doc 12) was formalized. Before more content is authored:
1. Confirm whether existing published games can be retrofitted with tier/distractor metadata, or need rebuilding.
2. Confirm Modality Maps for the categories already built (Shapes, Animals, Letters) match what's actually implemented, or need adjustment (draft maps are in Doc 12 — verify against real content).
3. Prioritize implementing the Pedagogy Validator (Doc 13, Rule 1–5) before authoring scales further, so new content doesn't need retrofitting too.
4. Model shift per Doc 15: pivot the primary content path from on-demand generation to a validated curriculum-mapped library, built with an ECE specialist center as the pilot/validation partner — generation and class-scoped teacher customization remain available, but are no longer the default.
5. Recommended build order per Doc 16: Interface Onboarding first (its absence corrupts all downstream pattern-tracking data), then Retry/Adaptive Difficulty, then Reward Equity tagging, then Spaced Repetition, with Multilingual Audio and Session Fatigue timed alongside the Doc 15 curriculum mapping work.
6. Doc 17 rounds out the child-facing experience to modern-ed-game standard: garden progress metaphor, companion character, offline mode, save/resume, parental controls, accessibility, feedback juice — all explicitly wired into the Doc 12/14/16 progress loops, not a bolt-on. Recommend building this alongside or immediately after the Doc 16 items, since the garden/companion give the retry/repetition/reward logic an actual visible surface.

## Next Action
Nazif: read Docs 12–14 in full, cross-check against current EliteKids codebase, update this addendum with actual (not assumed) current state before starting the Pedagogy Enforcement Layer implementation.
