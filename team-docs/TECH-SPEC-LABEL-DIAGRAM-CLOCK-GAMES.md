# Tech Spec — Label-Diagram & Clock/Sequence Games (new template family)

**Date:** 2026-09-03 · **Owner:** opencode (worker) + freebuff (fb-review, read-only)
**Depends on:** `team-docs/TECH-SPEC-STORY-GAMES-100PCT.md` (scene visual layer Phases A–B),
`docs/teacher-game-maker-guide.md`, `backend/src/seeders/animalsNumbersExpansionSeed.js` (U10 time content)
**Compliance:** C1/C2 (additive ENUM + JSON-contained configs; no shared-DB writes),
C4 (artifacts in `team-docs/`), deploy-on-push, workers do not self-commit.

Legend: ✅ done · 🟦 in progress · ⬜ todo

---

## TL;DR — placement verdict

The two game ideas you found are **real gaps**, verified in code today:

1. **Label-diagram game (body parts, tree, plants, car, appliances)** — does NOT exist in the
   7-template registry. Closest relatives (`tap-recognition`, `matching`) tap among *separate
   image cards* or pair *label↔image* — none can tap *parts of one diagram*. → **New template
   `label-diagram`** (tap-the-part / pick-the-label on a real diagram with hotspot regions).
2. **Clock & watch learning with real analog graphics** — existing U10 "Money and Time Basics"
   (`animalsNumbersExpansionSeed.js:770`) teaches time with **text-only quiz questions**
   (`q-2`, `q-4`: "What time is it when the short hand is on 3 and long hand on 12?" → text
   options) and a **matching game using emoji clock faces** (`🕐🕕🕘🕛🕜`) — no real clock
   graphics, no :15/:30/:45 (Unicode has no minute-hand emoji). → **New `AnalogClock` SVG
   component** + **`stage-sequence` learning category** (ordered simple→complex step-graphic
   queues: clock progression, human lifecycle, plant growth, etc.), plus a fix to the U10 seed.
3. **Continuous image-queue learning** (clock 1→12 progression, plant growth, life cycles) —
   this is exactly the **illustrated scene engine + `game_checkpoint`** already specced in
   TECH-SPEC-STORY-GAMES-100PCT.md Phase A/B (auto-advance `durationSec`, narration, embedded
   quiz). → **MASTER decision (2026-09-03): adopted as first-class `stage-sequence` template** (see §5–§6).

**Design principle honored (your ranking):** story & labels first, real graphics second —
every game is framed by story scenes, labels are complete and spoken aloud, graphics are real
illustrations (SVG clock, diagram art) **not** emoji substitutes.

---

## 1. The gap, verified

| User-observed problem | Code evidence | Verdict |
|---|---|---|
| No game where a child learns parts of a diagram | Template registry: `matching`, `memory-pairs`, `tap-recognition`, `drag-sort`, `quiz`, `fill-in-blank`, `puzzle-split` — no hotspot/diagram type anywhere (`kids.js:672`, `game-engine/schemas/`) | **New template needed** |
| Time game has no analog watch graphic | `animalsNumbersExpansionSeed.js:788,796` — text-only prompts; `:807` matching pairs use emoji `🕐…🕜` | **New `AnalogClock` + template needed** |
| Minute learning (15/30/45/60) missing | U10 only teaches hour + half-hour; no :15/:45 anywhere; emoji clocks can't show minute hands | **Cover in `stage-sequence` (ordered AnalogClock frames)** |
| "Must be detailed, not half-way" | Existing U10 asks *about* clocks without *showing* one | **Renderer shows the real thing** |

---

## 2. Where the new games fit (template family map)

```
interaction ladder (01-PLANNING/12 association ladder)
 Tier 1 receptive recognition ── tap-recognition (tap correct card)
      │
      ├──► NEW label-diagram  ── tap the part ON the diagram / pick its label
      │       (same tap scoring, tapTargetPx, distractors; NEW hotspot surface)
 Tier 2 cross-modal association ── matching (label ↔ image)
      │
      ├──► NEW stage-sequence ── ORDERED step-graphic queue, simple → complex
      │       (clock 1:00→3:15→3:45, human infant→adult→old age, plant
      │        seed→harvest; NOT random; AnalogClock is a step/check kind)
 Tier 3 sequencing ── drag-sort, fill-in-blank
      │
      └──► stage-sequence also covers the narrated image queue (story scenes
              optional for framing); no standalone image-sequence template
```

Both new templates sit in the **cognitive/tap family**, accept **story scenes** (Step 4) and the
shared config envelope (`gameId, template, lessonId, ageLevel, category, tier, item_id, rewards,
successThresholdPct`, `interaction.tapTargetPx`, `promptMode/responseMode`), so they flow
through the existing game-maker wizard, approvals, preview (`?preview=1`), entitlement gate and
progress pipeline with zero new plumbing.

---

## 3. Adding a template — every registry touch point

This is the checklist ANY new template must satisfy (drift in these lists is pre-existing and
noted; fixing it is part of Phase 1):

**Backend**
| # | File | Change |
|---|---|---|
| B1 | `backend/src/controllers/kids.js:672` | add to `VALID_TEMPLATES` |
| B2 | `backend/src/models/KidGameConfig.js:14` | extend `ENUM(...)` — ⚠️ **drift: model ENUM has only 4 values** (`matching, tap-recognition, drag-sort, quiz`) while 7 are used in prod; extend to full 9 with additive (append-only) values, C2-safe |
| B3 | `game-engine/schemas/label-diagram.schema.json`, `stage-sequence.schema.json` (new) | per-template JSON Schema, `template: { const: ... }` |
| B4 | `backend/src/services/contentGeneratorService.js:487,517` | add to template list + promptMode/responseMode maps + a generator prompt |
| B5 | `backend/src/services/pedagogyValidator.js` | per-template pedagogical checks (≥5 hotspots, unique labels, mode coverage) |
| B6 | `backend/test/helpers/test-db.js:169` + `backend/test/test-db.js:163` | extend ENUM (⚠️ both missing `memory-pairs` today) + seed fixtures |
| B7 | `backend/test/helpers/game-config-invariant.js:18` | rounds key (`hotspots`/`questions`) + invariant cases |
| B8 | `backend/scripts/patch-multimodal-defaults.js`, `migrate-multimodal.js`, `deploy-multimodal.sh` | optional: default modes (`label-diagram` = text→image; `stage-sequence` = image→text) |

**Frontend**
| # | File | Change |
|---|---|---|
| F1 | `frontend/src/lib/utils/constants.ts:45` | `GAME_TEMPLATES` — ⚠️ **drift: missing `memory-pairs`**; add both new ids |
| F2 | `frontend/src/lib/types/game.ts` | `GAME_INTERACTIONS` entries |
| F3 | `frontend/src/pages/Teacher/GameCreator.tsx` | `TEMPLATES` card array (icon/label/desc i18n keys) + `getConfigTemplate()` starter configs |
| F4 | `frontend/src/pages/Student/GamePlay.tsx:3451-3457` (round count) + `:4408-4432` (renderer switch) | new branches |
| F5 | `frontend/src/components/AnalogClock.tsx` (new), `LabelDiagram.tsx` (new) | renderers |
| F6 | `frontend/src/lib/i18n/en.ts` (+`ha.json`) | `gameCreator.tpl.labelDiagram.*`, `gameCreator.tpl.stageSequence.*`, `game.clock.*` keys |

---

## 4. Spec — `label-diagram` template

**Config shape** (`game-engine/schemas/label-diagram.schema.json`):

```json
{
  "gameId": "LESSON-9-BODY-LABEL",
  "template": "label-diagram",
  "lessonId": "LESSON-9",
  "ageLevel": "Nursery", "category": "Science", "tier": 1, "item_id": "body-01",
  "rewards": { "starsOnComplete": 3, "xp": 15 }, "successThresholdPct": 70,
  "interaction": { "tapTargetPx": 72 },
  "promptMode": "text", "responseMode": "image",
  "diagram": { "image": "https://cdn.elitekids.com.ng/diagrams/human-body.png", "alt": "Human body", "background": "classroom" },
  "hotspots": [
    { "id": "head",   "label": "Head", "x": 50, "y": 18, "r": 9, "emoji": "👦" },
    { "id": "nose",   "label": "Nose", "x": 50, "y": 34, "r": 6, "emoji": "👃" },
    { "id": "ear",    "label": "Ear",  "x": 36, "y": 32, "r": 6, "emoji": "👂" },
    { "id": "hand",   "label": "Hand", "x": 74, "y": 55, "r": 8, "emoji": "✋" },
    { "id": "foot",   "label": "Foot", "x": 50, "y": 90, "r": 8, "emoji": "🦶" }
  ],
  "labelBank": ["Head", "Nose", "Ear", "Mouth", "Hand", "Foot"],   // distractors for part→label mode
  "mode": "label-to-part",           // | "part-to-label" | "mixed"
  "rounds": 5,                        // ≥5 per game-config invariant
  "inputMode": "tap"
}
```

**Runtime behavior (LabelDiagram.tsx)**
- Diagram image fills the play area (aspect-fit, `CachedImg`); hotspots are **invisible circular
  hit zones** at percent `(x, y, r)` — generous for nursery `tapTargetPx`.
- `label-to-part`: prompt card + TTS says "Tap the Nose!" → child taps the region → hotspot pulses,
  a **label banner** pins to the part, TTS repeats "Nose! 👃", next prompt. Never repeats a labeled
  part in the same round.
- `part-to-label`: a hotspot glows → 4 label chips below (1 correct + distractors from
  `labelBank`) → child taps the label → same feedback.
- `mixed`: alternates both modes across rounds (detailed, not half-way: every part gets
  **tapped AND named**).
- After all rounds: recap screen lists every labeled part with emoji; story recap scene plays
  if scenes exist (Step 4).
- **Graphics-first rule:** the diagram is real art (SVG or licensed image via
  `media/asset-saver.js` B2); emoji only as reinforcement badge + offline fallback.

**Content ladder (per association ladder Doc 12):** Creche/Nursery = 4–6 big parts (head, eyes,
nose, mouth, hands, feet) `label-to-part`; KG1/KG2 = 6–10 parts `mixed` (body, tree: trunk/
branch/leaf/root; plant: stem/flower; car: wheel/door/window/light); Primary = 10–14 parts
`part-to-label` + spelling (appliances: fridge, TV, kettle, fan…).

---

## 5. Spec — `AnalogClock` graphic + `stage-sequence` learning category

> **MASTER product decision (2026-09-03):** `clock-reading` is NOT a game type of its own.
> Clock skills — and every other staged learning (human life infant→adult→old age, plant
> seedling→harvesting, money steps, most curricula) — belong to ONE category: an **ordered
> queue of step graphics, simple → complex, never random**. Template id: `stage-sequence`.

**`frontend/src/components/AnalogClock.tsx` (new)** — pure SVG, no images:
- Round face, **numerals 1–12**, 60 minute ticks (5-strong on hours), hour + minute hands
  computed from a `time` prop (`"3:00" | "3:15" | "3:30" | "3:45" | "12:00"`).
- Props: `time`, `size`, `showNumerals`, `animate` (sweep in learn/step frames), `highlight`,
  optional face color.
- Used as: the `analog-clock` graphic kind inside stage-sequence steps + assessment, and an
  optional quiz `visual: { type: 'analog-clock', time }`.

**Config shape** (`game-engine/schemas/stage-sequence.schema.json`):

```json
{
  "gameId": "U10-CLOCK-1", "template": "stage-sequence", "lessonId": "LESSON-TIME",
  "ageLevel": "Primary", "category": "Numeracy", "tier": 3, "item_id": "time-01",
  "topic": "clock",
  "rewards": { "starsOnComplete": 3, "xp": 15 }, "successThresholdPct": 70,
  "steps": [
    { "id": "s1", "label": "One o'clock", "kind": "analog-clock", "time": "1:00", "narration": "One o'clock — the long hand points to twelve." },
    { "id": "s2", "label": "Two o'clock", "kind": "analog-clock", "time": "2:00", "narration": "Two o'clock." },
    { "id": "s3", "label": "Quarter past three", "kind": "analog-clock", "time": "3:15", "narration": "Quarter past three — the long hand is on the three." },
    { "id": "s4", "label": "Half past three", "kind": "analog-clock", "time": "3:30", "narration": "Half past three — the long hand is on the six." }
  ],
  "assessment": [
    { "id": "a1", "kind": "analog-clock", "time": "3:15", "prompt": "What time is it?", "options": ["3:00", "3:15", "3:30", "3:45"], "correctIndex": 1 }
  ]
}
```

Same shape teaches ANY staged topic — human lifecycle `steps: [baby → child → adult →
elderly]`, plant `steps: [seed → sprout → seedling → flower → fruit → harvest]` — with
`kind: "image"` frames + emoji fallbacks.

**Runtime behavior (StageSequence renderer / GamePlay branch)**
- **Steps are ALWAYS played in array order — simple → complex, never shuffled.** Each step:
  graphic (image | AnalogClock | emoji) + narration TTS; auto-advance on `durationSec`; tap
  pauses/advances; sweep animation for analog-clock frames.
- **Closing `assessment[]`** proves the sequence was learned (analog-clock → pick digital
  time; "what comes after the seedling?" → pick the next stage). Same feedback loop as quiz.
  Assessment kind `label-diagram` = tap-the-part challenge on a real diagram (MASTER decision
  2026-09-03: label-diagram remains a standalone template AND stage-sequence may embed
  diagram checks — e.g. plant sequence ends with "tap the leaf / root" on the grown plant).
- **Fix existing U10 content** (`animalsNumbersExpansionSeed.js:781-817`) per the **one-game-
  one-topic series rule** (see `docs/teacher-game-maker-guide.md` §"One game, one topic"): U10
  currently mixes money AND time in one unit — split it into a series: U10a Basic Time & Watch
  (o'clock), U10b Money — Coins, U10c Intermediate Time & Watch (:15/:30/:45), U10d Money —
  Naira Notes, U10e Advanced Watch, U10f final **story unit connecting money↔time** ("saving
  ₦X per hour, how much in N hours"). Time units = `stage-sequence` lessons (AnalogClock
  frames o'clock → :15 → :30 → :45 in order). Rewrite `q-2`/`q-4` as closing clock checks and
  replace emoji matching pairs with analog-clock frames (`3:00, 6:00, 9:00, 12:00, 1:30`).

---

## 6. Step-sequence learning — adopted as `stage-sequence` (clock, lifecycles, growth)

**MASTER decision: this IS the product.** Ordered queues of step graphics (simple → complex,
never random) are a first-class category covering clock progression, human life
infant→adult→old age, plant seedling→harvest, animal growth, money steps — "most learning
activity follows the same". Implemented as the `stage-sequence` template (§5): `steps[]`
played in order with narration + auto-advance, then closing `assessment[]`. The illustrated
scene engine (TECH-SPEC-STORY-GAMES-100PCT.md Phase A/B: scene visuals, `durationSec`, TTS,
`game_checkpoint`) remains available for richer story framing around any template, and
stage-sequence steps reuse its narration/auto-advance/TTS mechanics. A 12-frame "clock from
1 to 12" lesson = one `stage-sequence` config (`kind: "analog-clock"` per step).
No separate `image-sequence` template is needed.

---

## 7. Actionable plan

### Phase 1 — Registry + cleanup (foundation) 🟦
| # | Task | Files |
|---|---|---|
| 1.1 | Extend all ENUMs to full 9-template list (append-only, C2-safe); fix `GAME_TEMPLATES` drift (add `memory-pairs` + new ids) | B2, B6, F1 |
| 1.2 | Add both template ids to `VALID_TEMPLATES`, generator lists/modes, invariant map | B1, B4, B7 |
| 1.3 | New schema files (B3) + GameCreator cards + starter configs + i18n keys | F3, F6 |
| 1.4 | `node -c` + hermetic ENUM re-run; full suite must stay at baseline 2F/355P (C-DEBT-01/02 only) | tests |

**Exit:** no template list in the codebase is missing a template; suite green.

### Phase 2 — `label-diagram` end-to-end 🟦
| # | Task | Files |
|---|---|---|
| 2.1 | `LabelDiagram.tsx` renderer (hotspot hit-testing, label banner, TTS, both modes) | F5, F4 |
| 2.2 | pedagogy checks (≥5 hotspots, unique labels, distractor count by tier) | B5 |
| 2.3 | Seed one **Human Body** lesson + one **Tree/Plant** + one **Car** (diagram art via B2 media pipeline) | seeders |
| 2.4 | Tests: schema validation, invariant ≥5, renderer vitest (tap correct/incorrect, mode switch), preview no-write | B7, frontend tests |

**Exit:** teacher creates a body-parts game in the wizard; Test Play + admin Preview both work;
progress recorded only on real play.

### Phase 3 — `stage-sequence` + AnalogClock 🟦
| # | Task | Files |
|---|---|---|
| 3.1 | `AnalogClock.tsx` (SVG, numerals/ticks/hands, animate, highlight) | F5 |
| 3.2 | `stage-sequence` renderer (ordered steps[] w/ analog-clock/image/emoji kinds, narration, auto-advance, then closing assessment[]) | F4 |
| 3.3 | Split U10 into the Money↔Time **series** (U10a–f per one-game-one-topic rule; see §5) and rewrite each time unit to use AnalogClock incl. :15/:30/:45 | seeders |
| 3.4 | Tests: hand math (3:00, 3:15, 3:30, 3:45, 12:00), option shuffle, learn queue, series unit isolation (no unit mixes 2 topics) | frontend + backend |

**Exit:** the "Money and Time Basics" unit now shows real analog clocks; child can read
o'clock, quarter-past, half-past, quarter-to.

### Phase 4 — Story framing + live smoke 🟦
| # | Task | Files |
|---|---|---|
| 4.1 | Add worked example to `docs/teacher-game-maker-guide.md` (story → label-diagram/clock scenes) | guide |
| 4.2 | Live smoke post-deploy: teacher wizard → Test Play → submit → admin Preview → approve → child plays | manual |

**Exit:** G1–G5 of the 100PCT spec + both new game types verified on `elitekids.com.ng`.

---

## 8. Pre-existing drift found (fix as part of Phase 1)

- `frontend/src/lib/utils/constants.ts:45` — `GAME_TEMPLATES` **missing `memory-pairs`** (7 in
  prod, 6 listed).
- `backend/src/models/KidGameConfig.js:14` — model ENUM has only **4** values; prod + hermetic
  DBs have more. ENUM and model must be re-aligned additively.
- `backend/test/helpers/test-db.js:169` + `backend/test/test-db.js:163` — hermetic ENUMs
  **missing `memory-pairs`**.
- MySQL ENUM changes must be **append-only** (C2): `ALTER TABLE ... MODIFY template
  ENUM(...,'label-diagram','stage-sequence')` is backward compatible; no reordering.

## 9. Verification & rollback

- Per phase: `tsc --noEmit` clean, build OK, regression 25/25, full suite = baseline fail-set
  only, vitest incl. new renderer tests.
- Configs are JSON-contained (no new columns): rollback = revert commit + re-push; existing
  games unaffected.
- Deploy only via MASTER push; no manual restarts; workers never self-commit.

## 10. Risks

- **ENUM re-alignment** (Phase 1): append-only only; run against hermetic DB first; never
  reorder values.
- **Diagram art sourcing**: use the B2 media pipeline + SVG-first for the AnalogClock (no
  licensing issues); emoji fallback keeps the game playable offline.
- **Hotspot UX on small tablets**: percent hit-zones + `tapTargetPx` scaling per age band;
  test on 320 px width.
- **Scope**: `stage-sequence` IS the queue template (MASTER-approved 2026-09-03); scene
  engine stays available for richer story framing. AnalogClock is a graphic KIND within
  stage-sequence (+ optional quiz visual) — not a template.