# EliteKids Granular Year Plan and Game-Authoring Standard

This document turns the existing curriculum spine into a production-ready planning system. It is the
common contract for a year-long scheme, weekly lesson plans, teacher notes, observation evidence and
game content. It is intentionally more granular than a textbook contents page: every week is divided
into teachable micro-objectives, observable evidence, concrete experiences and a safe digital option.

## 1. Non-negotiable production requirement

**Every subject/domain must have at least one game per week.** The minimum annual delivery unit is:

- 5 early-years classes, plus the **Primary band** (one entity class for Basic/P1–P6);
- 9 canonical subjects/domains per early-years class, **6 NERDC subjects** for Primary;
- 3 terms;
- 10 teaching weeks per term;
- **1 game minimum per subject per week**, and **2 games per subject per week for Primary**.

This gives a minimum of **1,710 game lessons per school year**:

```text
Early years: 5 classes × 9 subjects × 3 terms × 10 weeks × 1 game    = 1,350 games
Primary:     1 band    × 6 subjects × 3 terms × 10 weeks × 2 games   =   360 games
                                                                  total 1,710 games
```

This is a floor, not a ceiling. A subject may have a second game where the objective needs a separate
concrete/practice experience, but never split one narrow objective into repetitive cosmetic games just
to increase the count. Each game contains 5–10 playable items — **up to 15 for the Primary band**; the
mathematical quantity or represented
range inside one item may be much larger when structured bundles/tallies make it accessible. For Crèche and Playgroup, “game” means a very short adult-led interactive
experience and may be Tier 0; it must still be observable, safe and optional for the child.

The curriculum team may approve a class-specific subject exception only when the school timetable does
not teach that domain in a particular week. The exception must be recorded explicitly as `deferred`,
with a replacement week, and must not silently reduce coverage.

## 2. Planning unit: the weekly learning cell

A weekly learning cell is the smallest unit that a teacher can plan, observe and convert into one or
more EliteKids lessons. One cell must contain:

```text
cellId:
class / age / technical age band:
termName / week (1–10): termName is `First Term`, `Second Term` or `Third Term`
subjectId / display subject:
strand / sub-strand:
weekly focus:
prerequisite or review:
objective (one child action):
micro-objectives (2–4 observable steps):
key vocabulary / home-language equivalents:
concrete experience:
guided play:
independent choice:
creative or movement connection:
success evidence:
observation code:
differentiation:
home connection:
gameId(s) / gamePlan:
asset plan:
scene plan:
safety / safeguarding:
teacher reflection:
```

A cell is not a worksheet and does not imply that a screen activity must be long. One weekly focus may
produce several short real-world activities, but it must produce at least one narrow game objective.

## 3. Annual architecture: 10 weeks per term

Each class uses **3 terms × 10 teaching weeks = 30 teaching weeks per subject/domain**. Week 1 settles,
connects and diagnoses; Weeks 2–8 build and spiral; Week 9 applies and transfers; Week 10 consolidates,
observes and celebrates. If the school's calendar includes a separate examination or closing week, keep
that outside the ten teaching weeks or label it `review/portfolio`, not as a new content week.

Every subject/domain must have exactly a minimum of ten game seeds per term:

| Term week | Teacher purpose | Minimum digital deliverable |
|---:|---|---|
| 1 | connect, settle, diagnose and activate prior experience | 1 welcome/review game |
| 2 | introduce the term's first micro-skill | 1 new-skill game |
| 3 | build through concrete play | 1 new-skill game |
| 4 | revisit in a second familiar context | 1 spiral game |
| 5 | add a related micro-skill | 1 new-skill game |
| 6 | guided application | 1 practice game |
| 7 | transfer to home/community/nature context | 1 transfer game |
| 8 | integrate vocabulary, movement or creative expression | 1 integration game |
| 9 | explain, sequence, classify or solve | 1 application game |
| 10 | consolidation and low-stakes observation | 1 review/celebration game |

**Term minimum:** 10 games × 9 subjects = 90 games per class. **Year minimum:** 270 games per class.

### Game count rules

1. One game has one primary objective and one canonical `lessonSeedId`.
2. A `game-chain` may bundle concrete→practice→application, but it counts as one game and must not be
   used to hide missing weekly coverage.
3. A scene, worksheet, story, video or teacher activity does not count as the required game unless it
   contains a validated playable game config.
4. A duplicate game with only new colours or background art does not count as a new objective.
5. A review game may revisit earlier items, but its seed must list the reviewed weeks and evidence.
6. The game must be assigned to the same class, subject, term and week as its learning cell.
7. A game can be reused across classes only when the class variant changes the objective, language,
   choice count, tier or evidence; copy reuse must be marked and reviewed.
8. Item load may increase with age and familiarity within the 5–10 range; do not overload younger learners
   or add artificial items.
9. A range too large for the selected age load must be split into logical modules/units; the number of
   units is flexible and decided by cognitive load, prerequisite structure and term timetable.

## 4. Required annual coverage matrix

Use this matrix before authoring. Each cell must contain at least one seed ID. The canonical subject
IDs are defined in Section 5.

```text
classLabel × termName(First Term | Second Term | Third Term) × week(1..10) × subjectId
```

Example IDs:

```text
kg2-first-term-w01-comm-literacy-01
kg2-first-term-w01-writing-01
kg2-first-term-w01-numeracy-01
...
kg2-third-term-w10-creative-arts-01
kg2-third-term-w10-digital-01
```

The content review dashboard should report:

- planned cells;
- games authored;
- games schema-valid;
- games safety-reviewed;
- games ECE-approved;
- published games;
- missing cells;
- deferred cells and approved replacement week.

A class is not year-complete while any required cell is missing a playable game or approved deferral.

## 5. Class-specific annual progression

The nine subject/domain rows below are the canonical minimum for **every class**. They are deliberately
broad enough to preserve the whole-child curriculum. For Crèche and Playgroup, academic labels mean
sensory/developmental experiences, not formal instruction.

| ID | Display name | Core strands |
|---|---|---|
| `comm-literacy` | Communication and Early Literacy | listening, vocabulary, rhyme, phonological awareness, stories, emergent reading |
| `writing` | Pre-writing / Writing Skill | mark-making, motor patterns, letter/word formation, purposeful writing |
| `numeracy` | Numeracy / Mathematics Skill | quantity, counting, number, operations, shape, pattern, measure, position |
| `science-nature` | Pre-science and Nature | observation, living things, materials, weather, health inquiry |
| `social-habits` | Social-Emotional Learning / Social Habits | identity, relationships, routines, feelings, cooperation, citizenship, safety |
| `health-selfcare` | Health, Safety and Self-care | hygiene, nutrition, body care, boundaries, rest, trusted adults |
| `movement` | Physical Development and Movement | locomotor, balance, coordination, fine motor, rhythm, outdoor safety |
| `creative-arts` | Creative Arts, Music, Rhymes and Pretend Play | visual art, music, drama, dance, craft, cultural expression |
| `digital` | Digital Readiness | device routines, listening, tapping, dragging, accessibility and stopping |

Every subject/domain must be represented in the annual matrix and must have a game each teaching week.
Where a school timetable integrates subjects, retain separate seed IDs so coverage remains auditable.

### Crèche (0–2, technical band `Creche`)

- First Term: secure attachment, sensory noticing, name response, grasp/release, simple care routines.
- Second Term: repeated actions, object permanence, early choice-making, imitation, movement confidence and
  familiar nature experiences.
- Third Term: participation in routines, simple turn-taking, intentional communication, concept words and
  increasing independence while maintaining sensory concreteness.
- New load: one new object, sound, gesture or routine step at a time; no formal academic target.
- Game surface: adult-led Tier 0 reveal only, usually 3–5 minutes, no score and no wrong state.

### Playgroup (2–3, technical band `Creche`)

- First Term: names, colours, identical matching, 1–3 action counting, routine language and basic shapes.
- Second Term: familiar animal/community vocabulary, two-step routines, feelings, simple patterns and safe
  movement.
- Third Term: classification, short story sequence, more/fewer, shape construction, self-care and turn-
  taking in group play.
- New load: two or three choices; repeat vocabulary across songs, stories, objects and movement.
- Game surface: Tier 0–1 tap/matching with adult observation, never a child-facing test.

### Nursery 1 (3–4, technical band `Nursery`)

- First Term: oral language, rhyme, listening, letters A–G as meaningful sound/story exposure, counting 1–5,
  colours/shapes and routines.
- Second Term: broader sound/letter exposure, quantity comparison, AB patterns, body/animals/plants and
  cooperative self-care.
- Third Term: picture-to-word recognition, numeral-to-quantity matching, short retell, safety, community and
  practical independence.
- New load: one sound/letter, one concept and a small vocabulary set at a time; oral evidence comes first.
- Game surface: Tier 1 recognition, 3–4 large choices, audio replay, no unsupported reading.

### Nursery 2 (4–5, technical band `KG1`)

- First Term: numbers 1–10, emergent blending, familiar labels, AB/ABB patterns, living things and routines.
- Second Term: number comparison/composition, simple CVC words, shape/position/measurement, classification,
  prediction and community problem-solving.
- Third Term: shared reading and retell, practical recording, number order, materials/weather/health and
  independence for school readiness.
- New load: use concrete objects before numerals/words; accept oral, pointing, drawing and dictation.
- Game surface: Tier 1–2 image-to-label, matching, sort and short sequence; simple quiz only after practice.

### Kindergarten (5–6, technical band `KG2`)

- First Term: oral sentence construction, familiar reading/writing, joining groups within 5, patterns,
  community and classroom independence.
- Second Term: sentence meaning/punctuation, number bonds and addition within 5, shapes/measurement, nature
  investigations, cooperation and safety.
- Third Term: transfer to short reading/writing tasks, addition toward 10 only when secure, reasoning,
  explanation, school readiness and portfolio reflection.
- New load: one symbolic step after a concrete model; no timed arithmetic or public ranking.
- Game surface: Tier 1–3 matching, sort, quiz, fill-blank, sequence or labelled diagram after physical
  learning; Test mode follows the existing Practice→Test gate.

## 6. Subject/domain planning rules

For every weekly subject cell, author the following minimum fields:

| Field | Requirement |
|---|---|
| Strand | one strand from the subject map |
| Sub-strand | one narrow teachable concept |
| Objective | one child action, observable in under 10 minutes |
| Micro-objectives | 2–4 steps from exposure to application |
| Concrete experience | real object, body action, story, song, outdoor or role play |
| Vocabulary | 3–8 words/sounds, with home-language support |
| Evidence | 2–4 behaviours plus I/P/E/N code |
| Game | at least one template-ready seed |
| Asset plan | approved image/audio/fallback list |
| Differentiation | reduce load, add access, or extend reasoning |
| Home link | safe no-cost practice |
| Safety | material, supervision, consent and safeguarding checks |

## 7. Lesson-plan specification

Every detailed lesson plan should use this order:

1. **Identity:** class, age, subject ID, term/week, cell ID, game seed ID, duration and group size.
2. **Prior experience:** what children have already handled, heard, seen or practised.
3. **Objective:** one action, e.g. “match a group of three objects to numeral 3.”
4. **Success evidence:** 2–4 behaviours, not a score; include independent/prompted/emerging/not yet.
5. **Vocabulary:** English, pronunciation/audio, and local-language support where relevant.
6. **Materials:** safe, large, washable, locally available alternatives.
7. **Welcome:** song, movement, sensory regulation or relationship cue.
8. **Model:** adult demonstrates slowly and narrates the thinking/action.
9. **Guided play:** child tries with adult prompts, peers or a puppet/story context.
10. **Choice/application:** child chooses materials, movement, drawing, role play or a challenge.
11. **Game bridge:** describe the required weekly game and its Learn → Practice → Test status.
12. **Observation:** record context, prompt level, language mode and next step.
13. **Differentiation:** reduce choices/load, increase wait time, offer tactile/audio/visual/movement/AAC
    route, or extend through explanation rather than speed.
14. **Home connection:** safe household or community activity requiring no purchase or internet.
15. **Safety/safeguarding:** choking, water, hygiene, allergies, mobility, boundaries, supervision and
    consent checks.
16. **Reflection:** what engaged children, what confused them, and what the next cell should revisit.

## 8. EliteKids game conversion standard

### Game ladder by age

| Class | Learn | Practice | Test/record |
|---|---|---|---|
| Crèche | reveal one object/sound/colour | adult matching optional | no child-facing test |
| Playgroup | reveal or identify with 2 choices | matching/memory with 2–3 choices | teacher observation only |
| Nursery 1 | tap/match with 3 choices | drag-sort or memory with 3–4 | picture choice after practice |
| Nursery 2 | image-to-label with 3–4 | matching, drag-sort, stage-sequence | low-stakes 3–5 choice check |
| Kindergarten | model + recognition | quiz/fill/chain/diagram after concrete play | optional symbolic check after gate |
| Primary | model → representation → application | quiz/sort/sequence with structured number ranges | symbolic check after practice and prerequisite gate |

### Template mapping

| Instructional action | Template | Good annual examples |
|---|---|---|
| expose or identify one item | `tap-recognition` | colour, animal, body part, numeral, letter sound |
| pair related items | `matching` | animal/home, numeral/quantity, word/picture, tool/use |
| practise recall of pairs | `memory-pairs` | sound/letter, shape/name, number/group |
| classify or order | `drag-sort` | living/nonliving, healthy/not for every day, big/small |
| choose from picture-supported options | `quiz` | story meaning, safety action, pattern continuation |
| complete a supported sentence/pattern | `fill-in-blank` | KG2 only by default; familiar words and oral read-aloud |
| learn an ordered process | `stage-sequence` | handwashing, plant growth, story order, clock progression |
| identify parts on a whole | `label-diagram` | body, face, plant, classroom object; KG2/older by default |
| combine concrete→recognition→application | `game-chain` | sort→match→quiz or count→match→choose; no nested chain |

### Required seed metadata

Use the canonical fields in `game-ready-curriculum-contract.md`. In addition, each production seed must
include `lessonSeedId`, `classLabel`, `termName` (`First Term` | `Second Term` | `Third Term`), `week`, `subjectId`, `strand`, `subStrand`, `objective`,
`successEvidence`, `concreteExperience`, `gamePlan`, `assetPlan`, `scenePlan`, `homeConnection` and
`assessment`. The generator then adds `gameId`, `lessonId`, `ageLevel`, `category`, `tier`, rewards,
threshold and template-specific collections.

### Minimum game-plan fields

```json
{
  "lessonSeedId": "kg2-first-term-w03-numeracy-01",
  "gamePlan": {
    "minimumGames": 1,
    "itemsPerGame": "5–10 logical playable items, selected for age and cognitive load",
    "seriesSplit": "required when the topic exceeds the selected item load",
    "unitUnlock": "cumulative: every required game in the previous unit must pass",
    "learning": { "template": "matching", "tier": 1, "choices": 3 },
    "practice": { "template": "tap-recognition", "tier": 2, "choices": 3 },
    "test": { "template": "quiz", "tier": 2, "choices": 4, "requiredAfterPractice": true }
  }
}
```

For Crèche/Playgroup, set `test: null` and use `assessment: "adult observation"`. For Nursery 1, a test
is optional and picture-based. For Nursery 2/KG2, use the normal Practice→Test gate only after the
concrete experience and learning/practice modes have been completed.

### Asset and scene rules

- Use real, familiar and culturally respectful art; retain an approved emoji/text fallback only for
  offline or unavailable media.
- Use one recurring helper character per lesson when a story wrapper helps, not decorative overload.
- Scene cards follow `intro → teach → game_checkpoint → reinforce → recap`; each is 3–60 seconds,
  subtitle-supported and narratable.
- Do not use frightening villains, shame, violence, unsafe objects or stereotypes.
- The game must never be the only evidence of mastery.

## 9. Assessment and reporting

### Term evidence bundle

For each child and subject, retain at least: two dated observations, one practical work sample or photo
with consent, one child explanation/gesture/audio note where appropriate, and a next-step statement.
Crèche/Playgroup should use observation and caregiver dialogue; Nursery 1–2 may add drawings/marks; KG2
may add short oral/mark-making checks.

### Mastery language

Use: `introduced`, `practising`, `repeated in context`, `demonstrated with prompt`, `demonstrated
independently`, `ready to extend`. Avoid “failed”, “slow”, “weak” and percentage-only judgements.

### Review cadence

- Daily: brief anecdotal notes for focus children and safety/wellbeing.
- Weekly: update the learning cell and identify children needing a smaller or richer next step.
- Mid-term: review strands and language/access needs.
- End-term: portfolio and family conference.
- End-year: transition summary based on repeated evidence, not one test.

## 10. Inclusion, language and safeguarding gate

Before publishing a plan or game ask: Can the child respond by pointing, moving, speaking, signing,
drawing or using AAC? Can the task be completed with reduced choices and extra time? Is the home
language valued? Are sensory, mobility, vision, hearing, neurodiversity, medical and emotional needs
considered? Is an adult present? Are media consents and safeguarding procedures followed?

A plan is not ready if it depends on speed, unsupported reading, fine-motor precision, one language,
continuous internet, expensive materials, or a single correct mode of expression.
