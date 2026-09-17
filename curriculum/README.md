# EliteKids Early Years Curriculum Resource Library

This directory contains the EliteKids teacher-planning and game-authoring library for five early-years
classes plus the Primary band:

| Class | Age | Platform age level | Developmental emphasis |
|---|---:|---|---|
| Crèche | 0–2 | `Creche` | sensory exploration, colours, simple sounds, attachment, movement and routines |
| Playgroup | 2–3 | `Creche` | colours, shapes, familiar animals, language, movement and social routines |
| Nursery 1 | 3–4 | `Nursery` | ABC/phonological awareness, counting 1–5, matching, self-care and communication |
| Nursery 2 | 4–5 | `KG1` | numbers to 10, emergent reading, patterns, classification and independence |
| Kindergarten | 5–6 | `KG2` | simple addition, words, short sentences, reasoning, collaboration and school readiness |
| Primary | 6+ | `Primary` | one entity class for Basic/P1–P6: reading and writing, number sense and operations, science and technology, national values, culture and creative arts, pre-vocational skills |

## Production requirement

The expanded standard is **a minimum of one playable EliteKids game per subject/domain per week** —
two per week for the Primary band (see `00-framework/game-size-and-module-standard.md`). Planning uses
**three terms of ten teaching weeks each**. The minimum annual production target is:

```text
Early years: 5 classes × 9 subjects × 3 terms × 10 weeks × 1 game = 1,350 games
Primary:     1 band    × 6 NERDC subjects × 3 terms × 10 weeks × 2 games = 360 games
Total annual pilot: 1,710 games per year
```

The Primary figures match the served catalog: 1,710 flagship lessons across six bands, plus the
long-standing global-catalog floor (`GLESSON-*`) which is seed data rather than pilot content.

This is a minimum coverage target, not a demand for long screen sessions. Crèche and Playgroup games
are short, adult-led Tier 0–1 experiences with observation-led assessment. Nursery and Kindergarten
progress from concrete play to recognition, practice and carefully gated assessment, and Primary runs a
six-level ladder across the year (see `00-framework/game-size-and-module-standard.md`).

Use `00-framework/term-format.md` for the canonical term values: `First Term`, `Second Term`, `Third Term`. IDs may use the corresponding slugs `first-term`, `second-term`, `third-term`.

Start with:

- `00-framework/year-plan-and-game-authoring-standard.md` — the full annual and game standard;
- `00-framework/annual-game-coverage-template.md` — the 3-term × 10-week coverage register;
- `00-framework/granular-lesson-plan-template.md` — the weekly lesson and game specification;
- `00-framework/subject-game-blueprint.md` — subject-by-subject patterns and class progression;
- `00-framework/number-representation-progression.md` — objects, groups, tally bundles, numerals and number names;
- each class's `subjects/`, `schemes/`, `lesson-plans/` and `lesson-notes/` folders.

## Important curriculum note

The requested class names and ages are preserved for teacher usability. EliteKids currently stores
coarser technical age levels (`Creche`, `Nursery`, `KG1`, `KG2`, `Primary`), so the mapping above is
used when publishing games. Confirm the final class-to-band mapping with the school/ECCE lead before
production release.

The content in this directory is an **original planning scaffold**, not a reproduction of a paid or
copyrighted scheme/lesson-note book. It combines:

- official Nigerian curriculum and standards references;
- the subject groupings published by NERDC's National Model School;
- NAPPS/Lagos-style scheme categories used by Nigerian schools;
- play-based, developmentally appropriate practice for early childhood education;
- EliteKids' existing progression rules: concrete/sensory experience before symbols, recognition
  before recall, one learning objective per game, and no harsh failure feedback.

Teachers must compare these drafts with the school's approved state/unified scheme, timetable, children's
needs, language context, and current NERDC/Federal Ministry guidance.

## Directory convention

Every class has the same four planning areas:

```text
<class>/
├── subjects/       # subject/domain descriptions and term coverage
├── schemes/        # term-by-term weekly scheme of work
├── lesson-plans/   # ready-to-adapt weekly lesson plan examples
└── lesson-notes/   # teacher-facing notes, activity scripts and assessment prompts
```

`subjects/` intentionally includes developmental domains as well as school subjects. For Crèche and
Playgroup, care, sensory play, communication, movement, social-emotional development and health
routines are not optional extras; they are the curriculum.

## Standard lesson-plan format

Each lesson plan uses this sequence:

1. Class / age and subject
2. Term and week (10 teaching weeks per term)
3. Game seed ID and primary objective
4. Learning objective(s)
5. Materials
6. Key vocabulary or sounds
7. Warm-up / welcome routine
8. Play-based teaching steps
9. Guided practice
10. Required weekly game bridge
11. Observation/assessment
12. Differentiation and inclusion
13. Home connection
14. Safety and safeguarding check
15. Teacher reflection

For children under three, an observation record is preferred to a worksheet. For Kindergarten, short
oral, practical and mark-making evidence may be added, but formal written testing should not replace
play, talk, movement and manipulation.

## Standard scheme format

Each scheme includes three terms and **10 teaching weeks per term**. Week 1 is settling/review; Weeks
2–8 build and spiral; Week 9 applies/transfers; Week 10 consolidates and observes. Every subject row in
every week must link to at least one game seed.

## Recommended use in EliteKids

- Convert each weekly subject objective into at least one narrow game.
- For Numeracy, deliberately schedule follow-up representation games: objects → groups/bundles → tally marks → numerals → number names.
- When numbers become large, show structured bundles of five or ten rather than forcing children to count crowded loose marks.
- Use `Tier 0` exposure before asking a child to select or name an item.
- Use large targets and optional audio; do not require reading from Crèche/Playgroup.
- Keep digital sessions short: approximately 3–7 minutes for younger children and 5–10 minutes for
  Nursery/Kindergarten, with adult supervision and movement breaks.
- Prefer familiar Nigerian contexts and names, locally available objects, songs and home languages.
- Record what the child can do independently, with prompting, or not yet; do not label a young child
  by a single unsuccessful attempt.
- Do not count a scene, worksheet or story as the weekly game unless it contains a validated playable
  game configuration.

## Sources consulted

1. **NERDC — Special Programme Centre Major Achievements**
   - https://nerdc.gov.ng/content_manager/spc_achievements.html
   - Confirms the National Early Childhood Curriculum for ages 0–5, IECD policy, National Minimum
     Standard for Early Childhood Centres, caregiver manuals, toy-making manual and the approved
     one-year pre-primary curriculum.
2. **NERDC — National Model School, Nursery and Primary**
   - https://nerdc.gov.ng/content_manager/nursery_primary.html
   - Lists Nursery subjects: English Skill, Writing Skill, Mathematics Skill, Science, Social Habits,
     Health Habits, Cultural and Creative Arts, Rhymes and Poems.
3. **Federal Ministry of Education — Senior School Education / ECCDE mandate**
   - https://education.gov.ng/senior-school-education/
   - Describes the Federal Ministry's ECCDE responsibilities for ages 0–5, minimum standards,
     caregiver capacity building and monitoring.
4. **NERDC — Curriculum portal**
   - https://nerdc.gov.ng/content_manager/curriculum.html
   - Official curriculum portal and national curriculum navigation point.
5. **UNESCO — Enhancing ECCDE in Nigeria: play-based curriculum and capacity-building approach**
   - https://www.unesco.org/en/early-childhood-education/enhancing-eccde-in-nigeria-play-based-curriculum-and-capacity
   - Supports learning through play, active/imaginative learning, culturally appropriate low-cost
     materials and improved teacher pedagogy.
6. **NAPPS scheme summary (secondary planning reference, not a government standard)**
   - https://syllabus.ng/pre-nursery/
7. **ClassBasic nursery/KG planning hub (secondary reference)**
   - https://classbasic.com/nursery-and-kindergarten-plan-lesson-notes-for-age-3-age-4-age-5/
8. **Edu Delight Tutors first-term hub (secondary reference)**
   - https://edudelighttutors.com/first-term-lesson-notes/

### Source caution

Some useful lesson-note and scheme websites are commercial or secondary aggregators. Use them for
planning ideas only. The authoritative approval source remains the school's current state/unified
scheme and official NERDC/Federal Ministry publications. Do not assume that an online page is the
latest approved edition merely because it says "updated".

## Review checklist before publishing

- [ ] Objective is suitable for the stated age and does not exceed the class description.
- [ ] The subject/week has at least one game seed and playable validated game.
- [ ] Term and week use the 10-week term structure.
- [ ] Activity is play-based, active and short enough for the class.
- [ ] No frightening, violent, shaming or culturally insensitive content.
- [ ] Language is simple; home-language support is available where useful.
- [ ] Materials are safe, large enough, washable where appropriate and locally available.
- [ ] Assessment is observation-led for Crèche/Playgroup and low-stakes for all classes.
- [ ] Digital game follows EliteKids' pedagogy validator and child-safety state machine.
- [ ] Teacher has an inclusion/differentiation option for children who need more time, movement,
      visual support, audio support or adult prompting.
- [ ] Local school/ECCE reviewer has approved the scheme before it is treated as official.
