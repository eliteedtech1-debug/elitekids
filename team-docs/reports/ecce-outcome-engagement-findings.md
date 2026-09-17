# EliteKids ECCE-to-Outcome and Child-Engagement Findings

**Date:** 2026-09-04  
**Status:** Product requirements baseline  
**Audience:** ECCE reviewers, curriculum authors, backend/frontend engineers, QA and lower-tier implementation agents

## 1. Purpose

EliteKids must close two gaps at the same time:

1. The gap between a professional teacher's intention and a standard, observable learning outcome.
2. The gap between a correct educational activity and a child's desire to return, participate and learn.

The product must therefore connect:

```text
Curriculum standard
→ weekly learning cell
→ real-world ECCE experience
→ game or game-chain
→ observable evidence
→ teacher interpretation
→ next teaching step
```

A game score is only one signal. It is never the complete assessment of a young child.

## 2. Operating constraints

These constraints apply to every implementation phase.

### 2.1 Zero-funding startup constraint

The first version must work without paid infrastructure or specialist vendors:

- Reuse the current React, TypeScript, Vite, Express, Sequelize, JSON Schema and IndexedDB stack.
- Use existing API, game templates, offline cache, local sound/TTS and current progress tables before adding new services.
- Prefer curated content and teacher-authored content over on-demand AI generation.
- Treat AI as an optional drafting assistant, never as the authority that decides whether a child has mastered an outcome.
- Use SVG, CSS, emoji and approved local assets as fallbacks before commissioning animation, video or paid media.
- Store new kids-domain data only in the dedicated kids database; never add new tables to the shared school database.
- Make new columns nullable or defaulted and use additive boot-time reconciliation only.
- Batch reads and writes; do not create a paid analytics dependency or an N+1 request pattern.
- Support low-bandwidth and offline play as a product requirement, not a premium feature.

### 2.2 ECCE safety and inclusion constraint

- Concrete, social, sensory and movement experiences precede abstract digital representation.
- Crèche and Playgroup activities are exposure and adult-observation experiences, not forced tests.
- Children may demonstrate learning by pointing, touching, moving, speaking, signing, using home language, drawing, marking or AAC.
- No child-facing shame, harsh failure, speed-only assessment, public ranking or diagnostic label.
- Scores and engagement patterns are relative to the child's own history, never a comparison to other children.
- A teacher's observation remains part of the evidence bundle even when a game is completed successfully.

## 3. Findings and product implications

### F01 — Standards are too broad until translated into child actions

**Finding:** Statements such as "understands numbers", "knows hygiene" or "learns animals" are not directly teachable or assessable.

**Required translation:**

```text
Broad outcome: Child represents small quantities.
Observable objective: Child gives one object for each counting word and matches the total to a numeral.
Evidence: Child touches each object once, says/gestures the total, and matches the numeral independently or with a prompt.
Next step: Revisit the quantity with a new object or representation.
```

**Product implication:** Every lesson must store one primary objective, 2–4 micro-objectives, success evidence and a next-step suggestion.

### F02 — Professional teaching has a concrete-to-abstract sequence

**Finding:** A game should follow the child's learning journey rather than jump directly to a symbolic answer.

**Required sequence:**

```text
real object/body action
→ picture or quantity
→ spoken name
→ numeral/word/symbol
→ child choice or production
→ transfer to a new context
```

**Product implication:** Lesson plans need a concrete warm-up, teacher model, guided play, game bridge and transfer activity. Game configs need representation metadata when a new representation reinforces an earlier lesson.

### F03 — Representation follow-up is a meaningful form of reinforcement

**Finding:** Repeating the same game with new colours is weak reinforcement. Changing the representation can deepen understanding.

**Example:**

```text
5 apples
→ five objects counted one-to-one
→ five counting marks: |||||
→ one structured bundle of five
→ numeral 5
→ spoken number name "five"
```

For larger quantities, the child should see structure rather than count an exhausting row of loose marks:

```text
40 = 8 groups of 5
45 = 9 groups of 5
50 = 10 groups of 5
```

**Product implication:** Support `followUpType`, `reinforcementOf`, `representationSequence`, `grouping` and `itemRange`. The 5–10 rule counts playable learning items, not the quantity represented inside one item.

### F04 — One objective may need several game mechanics

**Finding:** A lesson may require matching, construction, recognition, sorting and application. The current game-chain exists for this purpose.

**Product implication:**

- A standalone component is one game type with 5–10 logical playable items.
- A `game-chain` is one lesson/unit container containing 2–10 ordered complete components.
- Components run in teacher-authored pedagogical order and are never shuffled.
- Each component independently follows the 5–10 item rule.
- `puzzle-split` is a valid component; nested `game-chain` is not.
- A chain may be split into smaller lesson modules when its duration or cognitive load is too high.

### F05 — Curriculum coverage must be visible and auditable

**Finding:** A school needs to know which subject, week and outcome were planned, taught, played, observed and reviewed.

**Product implication:** The annual matrix remains the coverage source: 3 terms, exact display names `First Term`, `Second Term`, `Third Term`, 10 weeks per term, 9 canonical domains and at least one game per subject per week. A planned game is not delivered coverage until it is schema-valid, safety-reviewed, ECE-reviewed and published.

### F06 — Digital evidence is not the same as developmental evidence

**Finding:** A score cannot explain whether a child misunderstood the concept, mis-tapped, lacked language access, tired, needed more time or already demonstrated the skill offline.

**Product implication:** Preserve two evidence streams:

1. **Game evidence:** item responses, mode, score, time, retries, representation and component completion.
2. **Teacher evidence:** observation context, evidence level, response route, prompt level, note, work sample reference where consent exists and next step.

The system must present both together without converting them into a diagnosis or one composite score.

### F07 — Young children need low-pressure agency and predictable interaction

**Finding:** Engagement comes from feeling safe, capable and curious, not from pressure.

**Product implication:**

- Short sessions with natural stopping points.
- Large targets, simple screen layout, repeatable interaction patterns and pause/stop controls.
- Hints after errors, gentle feedback and retry without loss of progress.
- Child choice of companion, theme, sticker or route where available; customization is participation-based, not performance-gated.
- No forced speech, reading, speed or fine-motor precision when another valid response route exists.

### F08 — Story and purpose make a game memorable

**Finding:** A child is more likely to persist when the activity has a small problem, helper character and visible purpose.

**Product implication:** Use the existing story scene model:

```text
intro → teach/model → game checkpoint → reinforce → recap/home link
```

Story is not decoration. It must express the same objective as the game. A story about counting must lead to counting, not an unrelated quiz.

### F09 — Real visuals and structured representations improve transfer

**Finding:** Children need to see the concept represented, not only read a prompt about it.

**Product implication:** Prefer real or approved illustrations, SVG graphics and structured visual groups. Existing and planned examples include:

- objects → counting marks/tally bundles → numeral;
- real diagram → hotspot labels;
- analog clock graphics → ordered time progression;
- plant/lifecycle frames → ordered stage sequence.

Emoji and text are fallbacks, not substitutes when a real graphic is necessary to teach the concept.

### F10 — The app must respect the teacher's professional role

**Finding:** A teacher knows the child's context, language, wellbeing and offline performance better than a game score does.

**Product implication:** The teacher needs editable objectives, low-cost activity alternatives, observation notes, differentiation controls, a next-step prompt and a review queue. The app should reduce planning work without replacing professional judgement.

### F11 — Families and communities are learning environments

**Finding:** Early learning becomes stronger when the child can repeat a safe activity at home or in the community without purchasing materials.

**Product implication:** Each weekly learning cell needs a no-cost home connection using familiar objects, conversation, song, movement or observation. The app should not assume continuous internet, expensive toys or English-only interaction.

### F12 — Adaptive learning should adapt support, not label the child

**Finding:** A child may need fewer choices, more wait time, another representation, audio, movement or a concrete example. That does not justify a fixed ability label.

**Product implication:** Use neutral states such as `introduced`, `practising`, `demonstrated with prompt`, `demonstrated independently` and `ready to extend`. Recommendations must be based on the child's own history and current evidence.

### F13 — Access and reliability are part of pedagogy

**Finding:** A lost session, inaccessible target or broken asset can create false evidence and disengagement.

**Product implication:** Save/resume after interactions, offline cache and sync, approved asset fallbacks, TTS/audio replay, reduced motion, colour-safe cues and a clear recovery path are required learning infrastructure.

### F14 — Content quality needs a repeatable review gate

**Finding:** AI or manual authoring can produce technically valid but pedagogically weak content.

**Product implication:** A game cannot publish until the content pipeline checks schema, item load, age fit, safety, story/objective alignment, concrete warm-up, inclusive response routes and human review state.

## 4. Minimum professional-to-child bridge

Every published lesson should be explainable using this record:

```text
What standard/outcome is addressed?
What one action should the child demonstrate?
What did the teacher do with real materials?
What did the child see/hear/do in the game?
What evidence was collected digitally?
What did the teacher observe offline?
What support or representation was needed?
What should happen next?
```

## 5. Engagement principles from the child's point of view

If I were the child, I would want:

1. A friendly helper who remembers me but does not shame me.
2. A short story that tells me why I am helping.
3. Big, clear things to touch, drag or choose.
4. To hear the instruction again and use pictures, movement or my own language.
5. A chance to try again without losing everything.
6. A visible garden, character or collection that grows because I participated.
7. Small choices about colours, companions, sounds or the next safe activity.
8. Surprises that come from learning progress—new scenes, sounds or adventures—not from gambling or purchases.
9. A clear finish and celebration so I know when I can rest.
10. To see familiar people, places, foods, animals and objects respectfully represented.

## 6. Product north star

> **EliteKids is a low-cost ECCE teaching companion that turns curriculum outcomes into real activities, joyful game experiences, observable evidence and an appropriate next teaching step.**

It is not merely a game catalogue and it is not a diagnostic instrument.
