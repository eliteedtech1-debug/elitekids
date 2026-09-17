# Game-Ready Curriculum Contract

This is the bridge between a teacher's year-long scheme and a publishable EliteKids lesson/game.
Every weekly scheme row is a **lesson seed**, not an automatic published game. A teacher or content
editor expands the row into the fields below, then the normal schema, pedagogy and child-safety gates
run before publication.

## 1. Canonical lesson-seed fields

```json
{
  "lessonSeedId": "kg2-first-term-w03-add-01",
  "classLabel": "Kindergarten",
  "ageYears": "5-6",
  "gameAgeLevel": "KG2",
  "term": "First Term",
  "week": 3,
  "subject": "Mathematics Skill",
  "category": "Numeracy",
  "strand": "Number and operations",
  "subStrand": "Joining groups",
  "objective": "Join two groups and tell the total within 5.",
  "successEvidence": ["models joining", "counts each object once", "selects or says the total"],
  "vocabulary": ["add", "more", "altogether"],
  "concreteExperience": "Join 2 mango counters and 1 mango counter.",
  "gamePlan": {
    "learning": {"template": "matching", "tier": 1, "choices": 3},
    "practice": {"template": "tap-recognition", "tier": 2, "choices": 3},
    "test": {"template": "quiz", "tier": 2, "choices": 4}
  },
  "assetPlan": {"items": ["mango-1", "mango-2", "mango-3"], "background": "market"},
  "scenePlan": ["intro", "teach", "game_checkpoint", "reinforce", "recap"],
  "homeConnection": "Join two groups of safe household objects.",
  "assessment": "Practical observation; do not grade speed.",
  "followUpType": "new-representation",
  "reinforcementOf": ["kg2-first-term-w02-numeracy-count-01"],
  "representationSequence": ["objects", "group-of-five", "tally-bundle", "numeral", "number-name"],
  "grouping": {"bundleSize": 5, "showBundleBoundaries": true, "allowRemainders": true},
  "targetItemCount": 8,
  "itemRange": "40–47"
}
```

## 2. Required game config rules

All generated configs must use the existing JSON schemas in `game-engine/schemas/` and carry:

- `gameId`, `template`, `lessonId`, `ageLevel`, `category`, `tier`, `item_id`;
- 5–10 logical playable items per standalone game component; in `memory-pairs`, 10–20 cards represent 5–10 logical pairs; a `game-chain` is a lesson/unit container and its component counts are not summed into one 5–10 cap;
- `series_id`, `unit_number` and `module_number` when part of a sequence;
- `termName` using `First Term`, `Second Term` or `Third Term`, and `week` from 1–10;
- `itemRange` or explicit item IDs when a module covers a bounded range;
- `targetItemCount` / playable-item count between 5 and 10;
- `followUpType`, `reinforcementOf` and `representationSequence` when a lesson reinforces an earlier lesson through a new representation;
- `durationTargetSec` within the template's limit;
- `rewards` and `successThresholdPct`;
- `scenario`, `characters`, `hint`, `feedbackCorrect`, `feedbackWrong` and `speechText` where the
  template supports them;
- approved images/audio or a documented emoji/text fallback;
- no external unreviewed media URL in a production config.The compact seed files use `templatePlan` and `choiceCount`; the content generator must expand these into the exact schema shape. Term values must use the exact display names `First Term`, `Second Term` or `Third Term`; week values are 1–10. Every standard game must contain 5–10 playable items; split larger topics into ordered series units/modules as defined in `game-size-and-module-standard.md`.

 The generator expands the seed into the exact schema shape (`assets.objects`, `assets.items`, `questions`, `steps`, `hotspots`, etc.). A `game-chain` is manually authored as an ordered set of complete component configs so one unit can satisfy one lesson plan objective with multiple mechanics.

## 3. Developmental game ladder

| Class | GameAgeLevel | Learning mode | Practice mode | Test/assessment | Item-count rule |
|---|---|---|---|---|
| Crèche | `Creche` | Tier 0 exposure, tap/reveal, no wrong state | optional adult-led matching | no child-facing test | 5–10 familiar exposure items |
| Playgroup | `Creche` | Tier 0–1, tap/matching, 2–3 choices | matching/memory, 2–3 choices | adult observation, not a quiz score | 5–10 familiar items |
| Nursery 1 | `Nursery` | Tier 1 recognition, 3 choices | matching/tap/drag, 3–4 choices | optional picture choice after practice | 5–10 |
| Nursery 2 | `KG1` | Tier 1–2, image-to-label | matching/tap/drag/stage, 3–5 choices | simple quiz only after practice | 5–10 |
| Kindergarten | `KG2` | Tier 1–2, concrete-to-symbolic | quiz/fill/stage/label, 3–5 choices | Tier 2/3 assessment; no surprise abstract jump | 5–10 |

`durationTargetSec` is a planning target, not a timer requirement. Learning mode has no time pressure.
For Crèche and Playgroup, adult observation is the assessment and `test` should not be surfaced.

## 4. Template selection by learning action

| Learning action | Preferred template | Exact config content |
|---|---|---|
| expose a colour, sound, object or word | `tap-recognition` or scene | `assets.objects`, 5–10 primary items, optional prompt audio |
| pair two related things | `matching` | 5–10 logical pairs; mutual `assets.items[].matches` links |
| remember where pairs are | `memory-pairs` | 5–10 logical pairs (10–20 cards); mutual matches |
| sort/order objects or steps | `drag-sort` | 5–10 `assets.items` + `assets.buckets`; use flat numeric ordering only when sequencing |
| choose an answer | `quiz` | 5–10 questions; every question has 2–4 image-backed options and `correctIndex` |
| complete a supported sentence/sequence | `fill-in-blank` | 5–10 blanks/items across one or more short sentences; use Kindergarten or carefully supported Nursery 2 only |
| order a lifecycle/routine/progression | `stage-sequence` | 5–10 assessed ordered steps per module; split longer progressions into units/modules |
| identify parts of a whole | `label-diagram` | real diagram, at least 5 generous hotspots, label bank |
| deliver one objective through several game types | `game-chain` | 2–10 complete components in simple→complex order; each component has 5–10 items; `puzzle-split` is allowed; no nested chain |

## 5. Category registration requirement

The current pedagogy validator has modality maps for `Animals`, `Letters` and `Shapes`. This library
also plans `Colours`, `Numeracy`, `Science`, `SocialHabits`, `HealthHabits`, `Movement` and
`CreativeArts`. Before publishing those categories, engineering must register their modality maps in
the validator and add tests for their maximum valid tier.

Suggested maps:

| Category | Tier 0 | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Colours | colour + object exposure | choose named colour | object→colour word | colour word recall (KG only) |
| Numeracy | quantity/object exposure | choose matching quantity | quantity→numeral | numeral/equation recall (KG only) |
| Science | real object/phenomenon | choose matching picture | picture→word/function | explain/classify (KG only) |
| SocialHabits | model routine/story | choose safe/social action | sequence routine | explain choice orally; no forced text |
| HealthHabits | demonstrate routine | choose item/step | sequence and label | recall safety rule with support |
| Movement | demonstrate movement | choose movement picture | sequence movement | verbal planning/reflection |
| CreativeArts | listen/watch/create | choose sound/colour/pattern | match symbol/action | describe or compose pattern |

## 6. Scene-card standard

A normal story wrapper is:

1. `intro`: character, place and one child-sized problem;
2. `teach`: demonstrate the concrete skill and one worked example;
3. `game_checkpoint`: optional embedded game, linked to a real `gameId`;
4. `reinforce`: name the skill and praise effort;
5. `recap`: one short recall or home connection.

Each card has 3–60 seconds, subtitles by default, TTS or reviewed narration audio, and an approved
background/character asset. Scene text is short enough to hear once.

## 7. Assessment and mastery evidence

- Crèche/Playgroup: observation only (`independent`, `with prompt`, `emerging`, `not yet observed`).
- Nursery 1: practical/oral evidence plus optional picture choice.
- Nursery 2: practical, oral, mark-making and optional low-stakes game evidence.
- Kindergarten: practical model + oral explanation + optional symbolic check.

A game score never replaces the teacher's observation. Never publish a lesson seed whose only success
evidence is speed, handwriting neatness or reading aloud under pressure.
