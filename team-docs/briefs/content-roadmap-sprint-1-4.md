# EliteKids Content Roadmap — Sprints 1–4

**Date:** 2026-08-26
**Status:** DRAFT — awaiting review
**Scope:** Numbers, Animals, English Phonics content series
**Goal:** Complete NERDC-aligned, age-appropriate, story-driven game content from recognition through operations

---

## Current State (Sprint 0 — what exists today)

| Series | Units | Lessons | Configs | Status |
|--------|-------|---------|---------|--------|
| Jolly Phonics Adventure | 10 | ~30 | ~30 | Published, complete |
| Sound Match Bank | 4 | ~4 | ~4 | Published, thin |
| Number Sense Gym | 4 | 4 | 4 | Published, counting only |
| Animal World Discovery | 4 | 4 | 4 | Published, thin |
| Animals — Nigerian Farm & Wild | 8 | ~24 | ~24 | Published, good coverage |

**Gaps:**
- Numbers: U1-U4 only, no operations, no real images, Creche/Nursery too complex
- Animals: U1-U4 only, no aquatic, uses emojis not images, scientific jargon for kids
- No Science/Health/Social Studies series
- No assessment-aligned content (NERDC end-of-term expectations not mapped)

---

## Design Principles (apply to ALL sprints)

### Age-Appropriate Difficulty
| Level | Numbers | Animals | Phonics |
|-------|---------|---------|---------|
| **Creche** (2-3) | Recognize 1-3, tap the number | Match animal to picture, simple sounds | Letter sounds |
| **Nursery** (3-4) | Recognize 1-5, count objects 1-3 | Animal sounds, baby animals | Letter-sound matching |
| **KG1** (4-5) | Count 1-10, number words | Habitats, simple diets | Blending CVC |
| **KG2** (5-6) | Count 1-20, simple patterns | Food chains, classifications | Digraphs, simple reading |
| **Primary** (6-9) | Operations, word problems | Ecosystems, conservation | Fluency, comprehension |

### Simple Words for Young Kids
- ❌ "Carnivore" → ✅ "Meat eater"
- ❌ "Herbivore" → ✅ "Plant eater"
- ❌ "Omnivore" → ✅ "Eats everything"
- ❌ "Habitat" → ✅ "Where it lives"
- ❌ "Prey" → ✅ "What it eats"
- Use Nigerian names: Kemi, Tunde, Emeka, Bola, Amara, Ngozi, Chidi, Ada

### Real Images (not emojis)
- Open-source animal photos: Wikimedia Commons, Unsplash, Pexels
- Host on B2 bucket (`*.elitekids.com.ng`) for offline caching
- Config field: `image` (URL string) alongside `emoji` for fallback
- Frontend already supports `image` → `CachedImg` → offline IndexedDB

### Story-Driven Games
- Each unit tells a story with named characters
- Animals introduce themselves, talk about their lives
- Numbers are counted in real contexts (mangoes, market, school)
- Quiz questions are mini-stories, not isolated facts

---

## Sprint 1: Foundation (Current Seed Content)

**Status:** Seed files written, pending review + deploy
**Duration:** Already in progress
**Deliverable:** Basic recognition and counting content for Numbers + Animals

### S1-1: Numbers U1-U10 — Counting 1-100
Each unit covers 10 numbers with 3 games:
- U1 (1-10): "Kemi Counts Her Mangoes" — recognition, matching, counting
- U2 (11-20): "Tunde at the Market" — number words, ordering
- U3 (21-30): "The Class Party Count" — grouping, tens
- U4 (31-40): "Grandpa's Farm Chickens" — counting objects
- U5 (41-50): "Ngozi's Bead Necklace" — patterns in numbers
- U6 (51-60): "Grandma's Market Stew" — counting ingredients
- U7 (61-70): "Walking to School" — counting steps, objects
- U8 (71-80): "The Fruit Basket" — grouping by tens
- U9 (81-90): "Market Day Counting" — real-world counting
- U10 (91-100): "The Hundred Celebration" — reaching 100

**Games per unit:**
- Game 1 (matching): Number ↔ word/object pairs, 10 items
- Game 2 (drag-sort/tap-recognition): Ordering or finding numbers, 6-8 items
- Game 3 (quiz): Story-based questions, 5 questions

**Age progression:** Creche → Nursery → KG1 per unit

**Content limits (Sprint 1):**
- No addition/subtraction
- No missing numbers (too hard for Creche/Nursery)
- Focus on recognition, counting, ordering

### S1-2: Animals U1-U10 — Wild, Farm, Aquatic
Each unit focuses on a category with story narrative:

**Wild Animals (U1-U2, U3-U4, U5-U6, U7-U8):**
- U1: "Meet the Family" — introductions (Kola the Lion hosts)
- U2: "Our Sounds" — what each animal says
- U3: "Parents and Babies" — baby names (cub, calf, foal)
- U4: "Our Special Skills" — unique abilities
- U5: "Where We Live" — savanna, forest, river habitats
- U6: "Our Shelters" — nests, dens, burrows
- U7: "What We Eat" — meat eater, plant eater, eats everything
- U8: "Food Chains" — who eats what (simple)

**Farm Animals (U2-U4 pattern, already have Nigerian Farm & Wild U1-U8):**
- Integrate with existing `eb386a93` series
- Add missing farm animal stories

**Aquatic Animals (U9):**
- U9: "Under the Water" — Nemo the Fish, Shelly the Turtle, Octo the Octopus

**Grand Review (U10):**
- U10: "Animal Festival" — mixed review across all categories

**Games per unit:**
- Game 1 (matching): Animal ↔ fact/sound/food pairs, 6 items
- Game 2 (tap-recognition): "Which animal says...?" with story prompt, 5 items
- Game 3 (quiz): Story-based questions with character names, 5 questions

### S1-3: Seed Infrastructure
- `team-docs/tools/content/` directory structure (done)
- `seed.js` loader with `--dry-run`, `--series` flags (done)
- Real image URLs in config `image` fields (pending)
- B2 upload pipeline for open-source assets (pending)

### S1-4: Deploy & Verify
- Run seed on prod with `--dry-run` first
- Verify GET /kids/curriculum returns all units
- Verify frontend renders images correctly
- Smoke: login → curriculum shows 10 units per series → games load

---

## Sprint 2: Operations & Interactive Games

**Duration:** 1-2 weeks after Sprint 1
**Goal:** Numbers operations (addition, subtraction), interactive game types, real images

### S2-1: Numbers — Addition & Subtraction (U11-U20)
New series: "Number Operations Gym"

| Unit | Topic | Story | Operations |
|------|-------|-------|------------|
| U11 | Adding 1-5 | "Kemi Adds Mangoes" | +1, +2, +3, +4, +5 (within 10) |
| U12 | Subtracting 1-5 | "Tunde Shares Mangoes" | -1, -2, -3, -4, -5 (within 10) |
| U13 | Adding to 10 | "The Class Party" | Any single digit + to make 10 |
| U14 | Subtracting from 10 | "Grandma's Stew" | 10 - single digit |
| U15 | Adding 10-20 | "Market Day" | Teen numbers + single digit |
| U16 | Subtracting 10-20 | "The Fruit Shop" | Teen numbers - single digit |
| U17 | Adding two digits | "Building Blocks" | No carry (12+3, 15+4) |
| U18 | Subtracting two digits | "The Toy Shop" | No borrow (18-5, 20-7) |
| U19 | Mixed addition & subtraction | "Sports Day" | Choose + or - |
| U20 | Word problems | "Shopping with Mama" | Real-world stories |

**New game types for Sprint 2:**
- **fill-in-blank**: "3 + 2 = ___" with number pad input
- **tap-recognition**: "Tap the answer: 5 + 3 = ?" with 4 options
- **memory-pairs**: Match "3 + 2" card to "5" card (flip to match)
- **puzzle-split**: Image split into pieces, solve math to unlock

**Age progression:** KG1 → KG2 → Primary (operations need more cognitive development)

### S2-2: Animals — Ecosystems & Conservation (U11-U20)
New series: "Animal World Advanced"

| Unit | Topic | Story |
|------|-------|-------|
| U11 | Animal Groups | "Kola's Science Class" — mammals, birds, fish, reptiles |
| U12 | Life Cycles | "From Egg to Butterfly" — metamorphosis |
| U13 | Animal Families | "The Animal Family Reunion" — groups, herds, flocks |
| U14 | Weather and Animals | "Rainy Season on the Farm" — how animals adapt |
| U15 | Nigerian Wildlife | "Exploring Yankari Game Reserve" — local species |
| U16 | Endangered Animals | "Helping the Elephant" — conservation intro |
| U17 | Animal Sounds of Nigeria | "The Village Market Sounds" — local context |
| U18 | Farm to Table | "From Farm to Our Table" — food journey |
| U19 | Animal Helpers | "Working Animals" — dogs, horses, bees |
| U20 | Animal Review Festival | "The Great Animal Show" — mixed review |

**New game types for Sprint 2:**
- **timeline排序**: Order life cycle stages (egg → caterpillar → butterfly)
- **cause-and-effect**: "What happens if it rains?" → animals seek shelter
- **story-builder**: Arrange story tiles in correct order

### S2-3: Real Image Pipeline
- Source open-source animal photos (Wikimedia Commons, Unsplash)
- Upload to B2 bucket via existing `/media/save-opensource-batch` endpoint
- Update seed JSONs: add `image` field to all items
- Test: CachedImg renders correctly offline
- Fallback: emoji → image → text (existing frontend logic)

### S2-4: Interactive Game Enhancements
- **drag-sort with images**: Update frontend to show images on draggable cards (currently text-only)
- **tap-recognition with sound**: Add `audio` field for animal sounds
- **score animation**: XP celebration on correct answer
- **hint system**: Progressive hints for struggling kids

---

## Sprint 3: Assessment-Aligned Content

**Duration:** 2-3 weeks after Sprint 2
**Goal:** Content mapped to NERDC end-of-term expectations, not just topic coverage

### S3-1: NERDC Curriculum Mapping
Scrap the current "Phase D content factory" approach. Build proper curriculum alignment:

**Numbers — NERDC Math Curriculum:**
| Level | NERDC Expectation | Current Coverage | Gap |
|-------|-------------------|------------------|-----|
| Nursery | Recognize 1-5, count objects | U1-U4 (thin) | Need real object counting |
| KG1 | Count 1-10, simple patterns | U5-U6 | Need pattern games |
| KG2 | Count 1-20, add/sub within 10 | U7-U10 | Need operations |
| Primary | Add/sub within 100, basic fractions | None | Full gap |

**Animals — NERDC Science Curriculum:**
| Level | NERDC Expectation | Current Coverage | Gap |
|-------|-------------------|------------------|-----|
| Nursery | Identify common animals | U1-U2 | Need local animals |
| KG1 | Animal homes, food | U3-U6 | Good coverage |
| KG2 | Animal groups, life cycles | U7-U10 | Need life cycles |
| Primary | Ecosystems, conservation | None | Full gap |

### S3-2: Assessment Question Bank
- 50+ questions per NERDC topic
- Mixed difficulty within each topic
- Tagged by: topic, difficulty, question_type, nerdc_code
- Randomized selection per game session

### S3-3: Progress Tracking per NERDC Standard
- Track mastery per NERDC standard (not just per game)
- Dashboard shows: "Kemi has mastered 8/12 Math standards for KG1"
- Adaptive difficulty adjusts per standard

### S3-4: Teacher Assessment Tools
- Print-friendly assessment sheets per NERDC standard
- Class progress heatmap
- Individual student gap analysis

---

## Sprint 4: Advanced Content & Gamification

**Duration:** 3-4 weeks after Sprint 3
**Goal:** Advanced operations, gamification, multi-subject coverage

### S4-1: Numbers — Advanced Operations (U21-U30)
New series: "Number Masters"

| Unit | Topic | Story |
|------|-------|-------|
| U21 | Multiplication intro | "The Arrays Garden" — groups of objects |
| U22 | Multiplication tables 2-5 | "Grandma's Egg Trays" — arrays of 2, 3, 4, 5 |
| U23 | Division intro | "Sharing equally" — dividing snacks |
| U24 | Fractions intro | "Cutting the Cake" — halves, quarters |
| U25 | Money | "At the Market" — naira, kobo, making change |
| U26 | Time | "My School Day" — o'clock, half past |
| U27 | Measurement | "How Tall Am I?" — length, weight |
| U28 | Shapes in Real Life | "Building a House" — 2D, 3D shapes |
| U29 | Data & Charts | "Our Class Survey" — pictographs, bar charts |
| U30 | Problem Solving | "The Math Fair" — mixed word problems |

### S4-2: Animals — Environmental Science (U21-U30)
New series: "Our Living World"

| Unit | Topic |
|------|-------|
| U21 | Plants and Animals Together |
| U22 | Water Cycle |
| U23 | Weather Patterns |
| U24 | Soil and Growth |
| U25 | Air and Breathing |
| U26 | Light and Shadow |
| U27 | Sound and Vibrations |
| U28 | Force and Motion |
| U29 | Energy Sources |
| U30 | Environmental Review |

### S4-3: New Subject Series
- **Health & Hygiene** (8 units): Hand washing, nutrition, dental care, exercise
- **Social Studies** (8 units): Family, community, Nigeria, Africa
- **Creative Arts** (8 units): Colors, shapes, music, dance

### S4-4: Gamification Enhancements
- Achievement badges per subject
- Streak rewards (7-day login)
- Leaderboard (class-based, not competitive)
- Boss battles for review (existing BossBattleOverlay)
- Spaced repetition integration (existing backend)

---

## Team Work Allocation

### Role: Content Architect (You/Lead)
- **Sprint 1:** Design unit structure, write seed JSONs, define story narratives
- **Sprint 2:** Design new game types, write operations content
- **Sprint 3:** NERDC curriculum mapping, assessment question design
- **Sprint 4:** Advanced content design, new subject series
- **All Sprints:** Review all content before deploy

### Role: Content Writer (Freebuff Agent)
- **Sprint 1:** Write animal stories, quiz questions, character dialogue
- **Sprint 2:** Write operations word problems, ecosystem stories
- **Sprint 3:** Write assessment questions, NERDC-aligned content
- **Sprint 4:** Write advanced content, new subject content
- **All Sprints:** Copy pass, age-appropriate language review

### Role: Image Curator (New Role)
- **Sprint 1:** Source open-source animal photos, upload to B2
- **Sprint 2:** Source operation-themed images, life cycle diagrams
- **Sprint 3:** Create assessment templates, progress charts
- **Sprint 4:** Source environmental science images, create diagrams

### Role: QA Tester (Freebuff Agent)
- **Sprint 1:** Verify seed loads correctly, games render, images display
- **Sprint 2:** Test new game types, verify difficulty progression
- **Sprint 3:** Test assessment tracking, verify NERDC alignment
- **Sprint 4:** Full regression, multi-subject testing

### Role: Backend Engineer (Phase D)
- **Sprint 1:** Seed infrastructure, B2 upload pipeline
- **Sprint 2:** New game type support (memory-pairs, puzzle-split)
- **Sprint 3:** Assessment tracking API, progress dashboard
- **Sprint 4:** Multi-subject support, advanced gamification

### Role: Frontend Engineer (Phase B2)
- **Sprint 1:** Image rendering in drag-sort, offline caching
- **Sprint 2:** New game type UIs, sound integration
- **Sprint 3:** Assessment dashboard, teacher tools
- **Sprint 4:** Achievement system, leaderboard UI

---

## Sprint Dependencies

```
Sprint 1 (Foundation)
  ├─ S1-1: Numbers U1-U10 (seed JSONs) ← DONE
  ├─ S1-2: Animals U1-U10 (seed JSONs) ← DONE
  ├─ S1-3: Seed infrastructure ← IN PROGRESS
  └─ S1-4: Deploy & verify ← BLOCKED on S1-3
        │
Sprint 2 (Operations) ← BLOCKED on Sprint 1 deploy
  ├─ S2-1: Numbers U11-U20 (operations)
  ├─ S2-2: Animals U11-U20 (ecosystems)
  ├─ S2-3: Real image pipeline
  └─ S2-4: Interactive game enhancements
        │
Sprint 3 (Assessment) ← BLOCKED on Sprint 2 content
  ├─ S3-1: NERDC curriculum mapping
  ├─ S3-2: Assessment question bank
  ├─ S3-3: Progress tracking per standard
  └─ S3-4: Teacher assessment tools
        │
Sprint 4 (Advanced) ← BLOCKED on Sprint 3 framework
  ├─ S4-1: Numbers U21-U30 (advanced)
  ├─ S4-2: Animals U21-U30 (environmental)
  ├─ S4-3: New subject series
  └─ S4-4: Gamification enhancements
```

---

## Success Metrics

| Metric | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 |
|--------|----------|----------|----------|----------|
| Total units | 20 (10+10) | 40 (20+20) | 40 | 60+ |
| Total games | 60 | 120 | 120 | 180+ |
| Real images | 0% | 50% | 80% | 95% |
| NERDC alignment | None | Partial | Full | Full |
| Age-appropriate | Fixed | Verified | Verified | Verified |
| Assessment tracking | None | None | Per-standard | Per-standard |

---

## Immediate Next Steps

1. **Review this plan** — approve or adjust scope
2. **Fix Sprint 1 content** — address feedback:
   - Simple words for young kids (meat eater, not carnivore)
   - Age-appropriate difficulty (Creche = recognition only)
   - Real image URLs (not emojis)
3. **Deploy Sprint 1** — seed on prod, verify
4. **Draft Sprint 2 brief** — detailed tasks, dependencies
5. **Assign roles** — who does what in each sprint

---

*This document is a living plan. Update as sprints complete.*
