# Game Size and Series/Module Standard

## 1. Mandatory game size

Every published EliteKids game must contain **not fewer than 5 primary playable items** and **not more
than 10 — except the Primary band, which may use up to 15** (user directive 2026-09-10: the Primary
band is one entity class for all Basic/Primary 1-6 classes, runs TWO games per subject per week, and
may exceed the 10-item ceiling to 15 question items per lesson).

```text
5 ≤ playableItemsPerGame ≤ 10  (all early-years bands)
5 ≤ playableItemsPerGame ≤ 15  (Primary band, one-class-fits-all ladder)
```

“Playable item” means the learner's assessable content unit for the template:

| Template | Item count used for the rule |
|---|---|
| `tap-recognition` | `assets.objects` / target objects in the game |
| `matching` | logical pairs in `assets.items` (not the two visual sides of one pair) |
| `memory-pairs` | logical pairs; the cards may be 2× the pair count |
| `drag-sort` | sortable items in `assets.items` |
| `quiz` | questions in `questions` |
| `fill-in-blank` | blanks/assessable responses in `blanks` |
| `label-diagram` | assessable hotspots in `hotspots` |
| `stage-sequence` | assessed stages/steps; normally 5–10 steps for a standard module |
| `game-chain` | a lesson/unit container of 2–10 complete game-type components; each component follows this rule independently |

A game may have 5–10 items even when it presents them in several rounds. Decorative characters,
backgrounds, feedback messages, distractor options and duplicate memory cards do not increase the
learning-item count.

### Developmental application

The 5–10 rule applies to every publishable game, including Crèche and Playgroup. For the youngest
children, the five items should be familiar, repeated, sensory or adult-led exposures; they are not five
forced test questions. A Crèche/Playgroup game may hide Test mode and use adult observation, but it still
contains at least five meaningful playable rounds/items.

A `game-chain` may contain 2–10 ordered complete game-type components. It exists because one lesson/unit
objective may need more than one mechanic—for example `matching → puzzle-split → tap-recognition →
drag-sort → quiz`. Each component is independently a valid game and contains 5–10 playable items. Do
**not** add the component counts together and reject the chain for exceeding ten: the chain is a lesson
container, not one homogeneous game. If the combined session is too long for the age group, split the
lesson into smaller lesson modules or units, preserving the intended progression and prerequisite lock.

**`puzzle-split` IS a valid chain round (implemented rule, 2026-09-10).** The chain validator
(`CHAIN_ROUND_TEMPLATES` in `backend/src/services/gameConfigRules.js` and the `game-chain` JSON schema
enum) accepts `puzzle-split` as a round; its canonical playable-item count is the piece count of a
difficulty level, validated independently like any other round (5–10, or 5–15 for Primary).

A diagram may have more than ten visible labels, but one game/module may assess no more than ten
hotspots. Split the diagram into logical views or modules, with each view containing at least five
assessable hotspots where possible.

Do not solve an item-count violation by adding meaningless distractors. Distractors are options, not
learning items, and must remain developmentally appropriate.

## 2. Oversized topic rule

If a curriculum topic or lesson has more than ten assessable items **of one game type**, split that
game into a series/module. A single lesson/unit may still use a `game-chain` with multiple game types when
each component has a distinct role in delivering the same lesson objective. Each component remains within
the 5–10 item game limit.

Use this decision rule:

```text
items ≤ 10       → one game/module
items > 10       → ordered series with as many logical units/modules as needed; 5–10 items per game
items > 100      → series + term/year scope; keep each unit/module within the age-appropriate load
```

The unit count is calculated after choosing the age-appropriate item load and meaningful concept
boundaries. A planning estimate is:

```text
moduleCount = ceiling(totalItems ÷ chosenItemsPerModule)
unitCount   = smallest number that groups those modules without overloading a unit or term
```

`chosenItemsPerModule` must remain between 5 and 10. Use a lower count for new or abstract content and a
higher count for familiar review or an older class. The formula is a planning aid, not permission to
split a concept in the middle of a meaningful sequence.

There is **no fixed number of units**. Do not force every topic into five units, ten units or any other
preset count. Split on meaningful pedagogical boundaries and the smallest sensible cognitive load for
the class, term and timetable. Good boundaries include number ranges, sound groups, vocabulary themes,
story stages, habitats, shape families or real-world contexts. A unit may contain one game or several
5–10-item modules; a large unit is acceptable only when its modules are clearly sequenced and individually
manageable.

## 3. Series and unit contract

Every oversized topic must define:

```json
{
  "seriesId": "series-numeracy-counting-1-100",
  "seriesName": "Counting 1–100",
  "subjectId": "numeracy",
  "classLabel": "Kindergarten",
  "ageLevel": "KG2",
  "termName": "First Term",
  "unitCount": "calculated after age, timetable, concept boundaries and cognitive-load review",
  "units": [
    {
      "unitId": "unit-counting-01",
      "unitNumber": 1,
      "title": "First manageable number range",
      "itemRange": "defined after age-band review",
      "moduleCount": "one or more",
      "prerequisiteUnitId": null,
      "unlockRule": "first unit is open; later units require every required game in the previous unit to pass"
    }
  ]
}
```

A unit is a curriculum container. Since one game cannot exceed ten items, a unit with more than ten
numbers must contain multiple 5–10-item games/modules. The number of units is selected after checking
age, prerequisite knowledge, lesson frequency, term length and review time. For example, Counting 1–100
might use 10-number modules and several units for a younger class, or larger meaningful ranges for an
older class; it must not be forced into five units if that overloads learners.

```text
Counting 1–100
├── Unit 1: first age-appropriate range
│   ├── Module/Game 1: 5–10 numbers
│   └── Module/Game 2: 5–10 numbers, if required
├── Unit 2: next age-appropriate range
│   ├── Module/Game 1: 5–10 numbers
│   └── ...
└── Continue until 1–100 is covered; unit count is flexible
```

## 4. Unlock and completion rule

**Unit N+1 must not open until Unit N is passed.** “Passed” means:

1. every required game/module in Unit N is completed;
2. each required game has a passing Test result where Test mode applies;
3. the score meets that class/category's configured threshold;
4. the prerequisite is evaluated for the same child, series and class variant;
5. failed or incomplete games remain replayable but do not unlock the next unit.

The first unit in a series has no prerequisite and is open according to normal assignment rules. Later
units must store `prerequisite_unit_id` referencing the previous unit in the same series. The learner
must not bypass the unit by opening a direct lesson URL.

For Crèche/Playgroup, use `assessment: "adult observation"`. A teacher records the unit as passed when
all required exposure/practice activities have been observed at the configured evidence level; do not
force a child-facing Test.

### Unit completion pseudocode

```text
unitPassed(child, unit):
  for each requiredGame in unit:
    if ageBand is Creche and exposureOnly:
      require adult observation record
    else:
      require passing test score >= successThresholdPct
  return true only when every required game passes

unitUnlocked(child, unit):
  if unit.prerequisite_unit_id is null: return true
  return unitPassed(child, prerequisiteUnit)
```

Use a cumulative chain, not “any previous unit passed”. If Unit 1 is incomplete, Units 2–5 remain
locked. If a prerequisite unit is edited after a child started it, recalculate completion against the
current required game list and preserve the child’s history.

## 5. Module metadata requirements

Every module/game in a series must carry:

- `series_id`;
- `unit_number`;
- `module_number` (or an equivalent stable module ID);
- `item_range` or explicit item IDs;
- `prerequisite_unit_id` at unit level;
- `prerequisite_module_id` when modules inside a unit must be sequential;
- `termName`: `First Term`, `Second Term` or `Third Term`;
- `week`: 1–10;
- `followUpType` and `reinforcementOf` when this module transforms a previously taught representation;
- `representationSequence` and grouping metadata when the module uses objects, bundles or tally marks;
- `subjectId`, class/age band and category;
- 5–10 playable items;
- concrete activity, success evidence, asset plan and approved game template.

Do not use only a title such as “Counting 1–100” without recording the unit/module boundaries.

## 6. Authoring examples

### Counting 1–100

- Series: `Counting 1–100`.
- Do not prescribe five units. Select the number of units after an age-band and timetable review.
- Divide each unit into 5–10-item games/modules. A 20-number range may require two or more modules;
  a younger class may need smaller ranges and more units, while an older class may handle the upper end
  of the 5–10 game-item range.
- Unit 1 modules may be scheduled in First Term Weeks 1–2; later units follow the school's ten-week
  scheme and may continue in Second/Third Term.
- Unit 2 is locked until every required Unit 1 game/module is passed. Passing only one module is insufficient.
- Each game uses objects, ten-frames, fingers, movement or groups before numeral recall.

### Age-scaled item load

Use the upper end of the allowed range only when the class is ready. This is a planning guide, not a
reason to add meaningless items. These are typical new-game loads, not fixed requirements for every
lesson:

| Class | Typical new-game item load | Review/game-load guidance |
|---|---:|---|
| Crèche | 5 familiar exposures | repeat familiar items; adult-led observation rather than a child-facing test |
| Playgroup | 5–6 | use two/three choices and repeat in a new context |
| Nursery 1 | 6–7 | increase only after recognition is secure |
| Nursery 2 | 7–8 | use 3–5 choices and concrete-to-symbolic progression |
| Kindergarten | 8–10 | use 5–10 only when children can model/explain; never add speed pressure |
| Primary | 8–15 | one-class-fits-all ladder; two games per subject per week; up to 15 items for familiar content; split abstract/new content into smaller modules |

A review game may combine previously mastered items toward the class maximum. The active objective,
not the item count, determines whether the game is educationally valid.

### Jolly Phonics sound groups

- Split by meaningful sound groups rather than putting all 42 sounds into one game.
- Each game should contain 5–10 sounds/items and retain the prerequisite sound progression.
- A later group stays locked until the prior required unit's games pass.

### Plant growth

- A five-to-ten-item stage sequence can be one module.
- If the complete topic includes seed, roots, stem, leaves, flower, fruit, pollination and harvest plus
  vocabulary, split the process into logical modules; do not create an 18-step game.

## 7. Engineering and validator implications

The content validator and save-time schema gate must measure the canonical playable collection for each
template against the shared range `5..10` (early-years) or `5..15` (Primary band exception). Existing
structural schemas may retain wider legacy bounds while migration is in progress, but production
publishing must reject a config outside this standard.
The validator must also:

- distinguish logical pairs from duplicate memory cards;
- distinguish quiz choices from quiz questions;
- accept larger mathematical quantities represented by bundles/tally groups;
- require `series_id`/`unit_number`/module metadata for oversized topics;
- prevent direct access to a locked unit, not just hide its curriculum card;
- evaluate all required games in the prerequisite unit, not only one passing game.

Any legacy seed that has fewer than five items must be reviewed and either expanded with meaningful
content or clearly marked as a non-publishable legacy fixture. Do not add artificial distractors solely
to satisfy the count.

## 8. Review gates

Reject or return a game/module when:

- it has fewer than five or more than ten playable items;
- an oversized single-mechanic topic is not split into units/modules, or a lesson chain is overloaded instead of being split into smaller lesson modules;
- a unit has no stable number/ID or prerequisite link;
- Unit 2 can be opened without Unit 1 passing;
- only one component/game in a multi-game unit is required for unlock;
- the item range does not match the actual config;
- the module has no concrete warm-up or observation evidence;
- it uses speed, unsupported reading or harsh failure as its mastery requirement.
