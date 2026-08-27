# E3 Content Plan — SCI-ANIMALS Series Inventory & Gap Analysis

> **Read-only recon — no inserts executed, no src files modified.**
> **Date:** 2026-08-24 | **DB:** elite_content (read-only SELECTs)

---

## 1. Series Inventory

### Series A: `d945a82c` — Animal World Discovery

| Field | Value |
|---|---|
| `id` | `d945a82c-8e9d-4e01-8abb-0f5bde98f27d` |
| `name` | Animal World Discovery |
| `category` | Animals |
| `subject_code` | SCI-ANIMALS |
| `term_hint` | term2 |
| `description` | Phase D content factory — NERDC-aligned, Jolly Phonics ladder |

**Units:** 4 (U1–U4), but content_items reference UUIDs (`4dd05770...`, `930221ad...`, `8b4189a4...`, `6ac1cb1a...`) that match **zero** configs in `kids_game_configs`. **ORPHAN — dangling references, no playable content.**

| Unit | Title | content_items | Status |
|---|---|---|---|
| U1 | Match Mother and Baby Animals | 1 UUID → no config | ❌ ORPHAN |
| U2 | Farm or Forest? Sort the Animals | 1 UUID → no config | ❌ ORPHAN |
| U3 | Puzzle: Sunny Farm Picture | 1 UUID → no config | ❌ ORPHAN |
| U4 | Animal Homes Quiz | 1 UUID → no config | ❌ ORPHAN |

### Series B: `eb386a93` — Animals — Nigerian Farm & Wild

| Field | Value |
|---|---|
| `id` | `eb386a93-6843-4928-9b75-59a1d17d613a` |
| `name` | Animals — Nigerian Farm & Wild |
| `category` | Animals |
| `subject_code` | SCI-ANIMALS |
| `term_hint` | term2 |
| `description` | 8-unit game series for Nigerian schools |

**Units:** 8 (U1–U8), content_items use string item_ids (`cow`, `lion`, `barn`, etc.) — **none** match any config in `kids_game_configs`. **ORPHAN — rich curriculum ladder but no playable games.**

| Unit | Title | Items | Topic Mapping |
|---|---|---|---|
| U1 | Farm Animals — Identity & Sound | 5 (cow, goat, chicken, sheep, dog) | Names intro |
| U2 | Wild Animals — Identity & Sound | 5 (lion, elephant, monkey, hyena, python) | Extended names |
| U3 | Animal Homes — Habitats | 5 (barn, forest, pond, burrow, nest) | Habitats |
| U4 | Animal Babies — Parent & Offspring | 5 (cow-calf, hen-chick, goat-kid, dog-puppy, sheep-lamb) | Babies |
| U5 | Animal Movement | 5 (walk, hop, fly, swim, slither) | Movement |
| U6 | Diet & Classification | 3 (herbivore, carnivore, omnivore) | Diet |
| U7 | Advanced Animal Sounds — Spelling | 5 (moo, baa, woof, neigh, cluck) | Sounds |
| U8 | Capstone — Animal World | 1 (review) | Review |

---

## 2. Actual Animals Content (Independent of Both Series)

112 game configs + 112 lessons exist with `category = "Animals"` / `subject = "Animals"`, but **none are linked** to either series via `content_items`. They follow the naming pattern `animals-u{N}-{template}-{age_level}`.

### 2.1 Configs Per Unit × Age Level

| Unit | Topic | Total | Creche (T0) | Nursery (T1) | KG1+KG2 (T2) | Primary (T3) |
|---|---|---|---|---|---|---|
| **U1** | Farm Animals (names) | **20** ✅ | 4 | 4 | 8 | 4 |
| **U2** | Wild Animals (names) | **20** ✅ | 4 | 4 | 8 | 4 |
| **U3** | Habitats | **20** ✅ | 4 | 4 | 8 | 4 |
| **U4** | Animal Babies | **15** ⚠️ | 3 | 3 | 6 | 3 |
| **U5** | Animal Movement | **10** ⚠️ | 2 | 2 | 4 | 2 |
| **U6** | Diet & Classification | **6** 🔴 | 0 | 0 | 3 | 3 |
| **U7** | Sounds/Spelling | **1** 🔴 | 0 | 0 | 0 | 1 |
| **U8** | Capstone | **20** ✅ | 4 | 4 | 8 | 4 |
| **TOTAL** | | **112** | **21** | **21** | **45** | **25** |

### 2.2 Templates Per Unit

| Unit | matching | tap-recognition | drag-sort | fill-in-blank | quiz | puzzle-split |
|---|---|---|---|---|---|---|
| U1 | ✅ (5) | ✅ (5) | ✅ (5) | ✅ (5) | — | — |
| U2 | ✅ (5) | ✅ (5) | ✅ (5) | ✅ (5) | — | — |
| U3 | ✅ (5) | ✅ (5) | ✅ (5) | — | ✅ (5) | — |
| U4 | ✅ (5) | ✅ (5) | ✅ (5) | — | — | — |
| U5 | — | ✅ (5) | ✅ (5) | — | — | — |
| U6 | — | — | ✅ (2) | ✅ (2) | ✅ (2) | — |
| U7 | — | — | — | ✅ (1) | — | — |
| U8 | ✅ (5) | — | ✅ (5) | — | ✅ (5) | ✅ (5) |

Legend: ✅ (N) = present with N configs total across all age levels. — = absent.

### 2.3 Item Counts Per Config (content pieces within each game)

| Template | Item field | Min | Max | Avg | Gold Standard (≥5) |
|---|---|---|---|---|---|
| matching | `pairs[]` | 1 | 4 | 3.4 | ⚠️ 5 configs have 1 pair |
| tap-recognition | `items[]` | 4 | 4 | 4.0 | ⚠️ all 25 have 4 items |
| drag-sort | `items[]` | 1 | 5 | 4.25 | ⚠️ 5 configs have 1 item |
| fill-in-blank | `blanks[]` / `sentences[]` | 1 | 1 | 1.0 | 🔴 all have 1 blank |
| quiz | `question` + `options[]` | single question | single question | 1 | 🔴 all single-question |
| puzzle-split | `grid` + `difficulties` | puzzle only | puzzle only | — | ⚠️ `questions[]` is undefined |

---

## 3. Gap Analysis vs Gold Standard

**Gold standard (from brief):** 1 game per academic week per subject, min 5 items each.

The brief asks for a **4-unit term ladder:**
- **U1:** Names intro (farm animals)
- **U2:** Animals and babies
- **U3:** Habitats
- **U4:** Story about the animals

### 3.1 Critical Gaps

| Gap | Severity | Detail |
|---|---|---|
| **Neither series links to real configs** | 🔴 CRITICAL | Both `d945a82c` and `eb386a93` have content_items pointing to non-existent UUIDs/string keys. Students see empty lesson lists. |
| **U7 nearly empty** | 🔴 CRITICAL | Only 1 config (primary FIB). Zero creche/nursery/kg coverage. |
| **U5/U6 severely thin** | 🔴 HIGH | U5: 10 configs (missing matching, FIB, quiz). U6: 6 configs (missing creche, nursery entirely). |
| **Fill-in-blank configs: 1 blank each** | 🔴 HIGH | Every FIB has exactly 1 sentence — well below the min-5-items gold standard. |
| **Quiz configs: single question** | 🔴 HIGH | Every quiz has 1 question + options, not a multi-question deck — below gold standard. |
| **Tap-recognition: 4 items each** | ⚠️ MEDIUM | All tap-recognition configs have 4 items — 1 short of the 5-item gold standard. |
| **Matching: some have 1 pair** | ⚠️ MEDIUM | 5 matching configs have only 1 pair — below gold standard. |
| **U4 missing quiz/FIB** | ⚠️ MEDIUM | U4 (Babies) has only 3 templates vs U1-U3's 4. Missing quiz + FIB. |
| **d945a82c series content_items use wrong IDs** | ⚠️ MEDIUM | UUIDs (`4dd05770...`) don't correspond to any config — likely copy-paste from a different database state. |

### 3.2 Coverage Heatmap (configs per age level, target = 4 per unit)

```
        U1  U2  U3  U4  U5  U6  U7  U8
Créche: 4   4   4   3   2   0   0   4   ← 5 holes
Nurs:   4   4   4   3   2   0   0   4   ← 5 holes
KG:     8   8   8   6   4   3   0   8   ← 13 holes
Prim:   4   4   4   3   2   3   1   4   ← 6 holes
```

**Total missing configs to reach full coverage:** ~29 configs (each = 1 lesson + 1 game_config row).

---

## 4. Seed Payloads — Ready-to-Run SQL

> **DO NOT EXECUTE** — advisory draft per brief constraint.
> Each seed = 1 row in `kids_lessons` + 1 row in `kids_game_configs`.
> Item IDs follow existing pattern: `animals-u{unit}-{template}-{age_level}`.
> UUIDs below are **placeholders** — replace with `UUID()` at execution time.

### 4.1 Recommended Template Set Per Unit (Gold Standard)

Per the 4-week ladder, each unit should have at minimum:

| Template | Rationale | Min items |
|---|---|---|
| `tap-recognition` | Core identity game — tap to identify | 5 items |
| `matching` | Pair animal↔sound/name | 5 pairs |
| `drag-sort` | Sort/classify animals | 5 items |
| `fill-in-blank` | Complete animal sentences | 5 blanks |
| `quiz` | Multi-question review | 5 questions |

### 4.2 Missing Configs — Priority Order

#### Priority 1: U7 (Sounds/Spelling) — 19 missing configs

```sql
-- U7: Advanced Animal Sounds — need ALL age levels × ALL templates
-- Topic: animal sounds/spelling (moo, baa, woof, neigh, cluck, oink, meow, chirp, hiss, roar)

-- Helper: each entry needs a kids_lessons row first, then a kids_game_configs row.
-- Pattern: title = "U7 {TemplateName} — {age_level}"

-- ===== U7 tap-recognition (4 configs: créche, nursery, kg1, kg2, primary) =====
-- Créche:
INSERT INTO kids_lessons (id, title, subject, age_level, lesson_type, content_state, created_by, createdAt, updatedAt)
VALUES (UUID(), 'U7 Animal Sounds — créche tap-recognition', 'Animals', 'creche', 'game', 'generated', 'e3-seed', NOW(), NOW());
INSERT INTO kids_game_configs (id, lesson_id, template, item_id, category, tier, content_state, config_json, created_by, createdAt, updatedAt)
VALUES (UUID(), LAST_INSERT_ID(), 'tap-recognition', 'animals-u7-tap-recognition-creche', 'Animals', 0, 'generated', '{
  "tier": 0, "unit": 7, "topic": "Animals",
  "items": [
    {"id": "moo", "emoji": "🐄", "label": "Moo"},
    {"id": "baa", "emoji": "🐑", "label": "Baa"},
    {"id": "woof", "emoji": "🐕", "label": "Woof"},
    {"id": "neigh", "emoji": "🐴", "label": "Neigh"},
    {"id": "cluck", "emoji": "🐔", "label": "Cluck"}
  ],
  "gameId": "animals-u7-tap-recognition-creche",
  "prompt": "Tap the Moo!", "ageBand": "creche",
  "rewards": {"xp": 15, "starsOnComplete": 3},
  "template": "tap-recognition",
  "affective": {"retryPenalty": false, "celebrationOnAttempt": true,
    "encouragementVoiceLines": ["Try again, friend!", "You are doing great!"]},
  "correctId": "moo", "promptMode": "text",
  "interaction": {"tapTargetPx": 96, "timedOptional": false, "dragSnapRadiusPx": 60},
  "responseMode": "image", "durationTargetSec": 90, "successThresholdPct": 60
}', 'e3-seed', NOW(), NOW());
```

**Note:** The above is one example row. The full U7 seed requires 19 configs (5 templates × ~4 age levels, minus the existing 1 FIB). For brevity, the pattern is identical per age level — change `tier`, `ageBand`, `gameId` suffix, and optionally vary the prompt/correctId.

#### Priority 2: U6 (Diet & Classification) — 14 missing configs

```sql
-- U6: Diet & Classification (herbivore, carnivore, omnivore, plant, meat, fruits, leaves, prey)
-- Missing: all créche + nursery (0 configs), missing matching/tap-recognition for kg/primary
-- Need: tap-recognition, matching, fill-in-blank for créche/nursery/kg1/kg2/primary
```

**Item pool for U6:** herbivore 🌿, carnivore 🥩, omnivore 🍽️, plant 🌱, meat 🥩, fruits 🍎, leaves 🌿, prey 🐇

#### Priority 3: U5 (Animal Movement) — 10 missing configs

```sql
-- U5: Animal Movement (walk, hop, fly, swim, slither, run, crawl, climb, waddle, gallop)
-- Missing: matching, fill-in-blank, quiz for all age levels
-- Currently has: tap-recognition (5) + drag-sort (5)
```

**Item pool for U5:** walk 🚶, hop 🦘, fly 🦅, swim 🏊, slither 🐍, run 🏃, crawl 🐛, climb 🧗, waddle 🦆, gallop 🐎

#### Priority 4: U4 (Animal Babies) — 5 missing configs

```sql
-- U4: Animal Babies — Parent & Offspring
-- Missing: quiz + fill-in-blank for créche/nursery/kg1/kg2/primary
-- Currently has: matching (5) + tap-recognition (5) + drag-sort (5)
```

**Item pool for U4:** cow→calf 🐮, hen→chick 🐤, goat→kid 🧒, dog→puppy 🐶, sheep→lamb 🐏, cat→kitten 🐱, duck→duckling 🦆, lion→cub 🦁

#### Priority 5: Expand thin existing configs

```sql
-- Per brief gold standard: min 5 items per game
-- U1-U3 tap-recognition: upgrade from 4 items → 5 items
-- U1-U3 matching: verify all have ≥5 pairs
-- ALL fill-in-blank: upgrade from 1 blank → 5 blanks per config
-- ALL quiz: upgrade from single question → 5-question deck
```

### 4.3 Config JSON Shape Reference (from DB audit)

**tap-recognition:**
```json
{
  "tier": 0, "unit": 1, "topic": "Animals",
  "items": [{"id": "cow", "emoji": "🐄", "label": "Cow"}],  // MIN 5
  "gameId": "animals-u1-tap-recognition-creche",
  "prompt": "Tap the Cow!", "ageBand": "creche",
  "rewards": {"xp": 15, "starsOnComplete": 3},
  "template": "tap-recognition",
  "affective": {"retryPenalty": false, "celebrationOnAttempt": true,
    "encouragementVoiceLines": ["Try again, friend!", "You are doing great!"]},
  "correctId": "cow", "promptMode": "text",
  "interaction": {"tapTargetPx": 96, "timedOptional": false, "dragSnapRadiusPx": 60},
  "responseMode": "image", "durationTargetSec": 90, "successThresholdPct": 60
}
```

**matching:**
```json
{
  "tier": 0, "unit": 1,
  "pairs": [{"a": "🐄 Cow", "b": "Moo", "id": "cow"}],  // MIN 5 pairs
  "topic": "Animals", "gameId": "animals-u1-matching-creche",
  "ageBand": "creche",
  "rewards": {"xp": 15, "starsOnComplete": 3},
  "template": "matching",
  "affective": {"retryPenalty": false, "celebrationOnAttempt": true,
    "encouragementVoiceLines": ["Try again, friend!", "You are doing great!"]},
  "promptMode": "text",
  "interaction": {"tapTargetPx": 96, "timedOptional": false, "dragSnapRadiusPx": 60},
  "responseMode": "image", "durationTargetSec": 90, "successThresholdPct": 60
}
```

**drag-sort:**
```json
{
  "tier": 0, "unit": 1,
  "items": [{"id": "cow", "num": 1, "emoji": "🐄", "label": "Cow"}],  // MIN 5
  "topic": "Animals", "gameId": "animals-u1-drag-sort-creche",
  "ageBand": "creche",
  "rewards": {"xp": 15, "starsOnComplete": 3},
  "template": "drag-sort",
  "affective": {"retryPenalty": false, "celebrationOnAttempt": true,
    "encouragementVoiceLines": ["Try again, friend!", "You are doing great!"]},
  "promptMode": "text",
  "interaction": {"tapTargetPx": 96, "timedOptional": false, "dragSnapRadiusPx": 60},
  "responseMode": "image", "durationTargetSec": 90, "successThresholdPct": 60,
  "pieces": []
}
```

**fill-in-blank:**
```json
{
  "tier": 0, "unit": 1, "topic": "Animals",
  "blanks": [{"id": 0, "answer": "moo"}],  // MIN 5 blanks
  "gameId": "animals-u1-fill-in-blank-creche",
  "ageBand": "creche",
  "rewards": {"xp": 15, "starsOnComplete": 3},
  "sentence": "The cow says ___.",
  "template": "fill-in-blank",
  "wordBank": ["moo", "bleat", "cluck", "baa", "bark"],
  "affective": {"retryPenalty": false, "celebrationOnAttempt": true,
    "encouragementVoiceLines": ["Try again, friend!", "You are doing great!"]},
  "promptMode": "text",
  "interaction": {"tapTargetPx": 96, "timedOptional": false, "dragSnapRadiusPx": 60},
  "responseMode": "text", "durationTargetSec": 90, "successThresholdPct": 60,
  "sentences": [{"id": 0, "answer": "moo"}]
}
```

**quiz (needs restructure):**
```json
{
  "tier": 0, "unit": 3, "topic": "Animals",
  "options": [{"id": "barn", "emoji": "🏠", "label": "Barn"}],
  "question": "Which animal says Barn?",
  "template": "quiz",
  "correctId": "barn",
  "questions": [],  // ← SHOULD BE 5 questions with same structure
  "ageBand": "creche",
  "rewards": {"xp": 15, "starsOnComplete": 3}
}
```

**puzzle-split:**
```json
{
  "grid": {"cols": 2, "rows": 2},
  "tier": 0, "unit": 8, "topic": "Animals",
  "template": "puzzle-split",
  "rewardOnly": true,
  "difficulties": {
    "easy": {"grid": {"cols": 2, "rows": 2}, "emoji": "⭐", "label": "Easy", "minAge": "Creche"},
    "medium": {"grid": {"cols": 3, "rows": 3}, "emoji": "⭐⭐", "label": "Medium", "minAge": "Nursery"},
    "hard": {"grid": {"cols": 4, "rows": 4}, "emoji": "⭐⭐⭐", "label": "Hard", "minAge": "KG1"},
    "expert": {"grid": {"cols": 5, "rows": 5}, "emoji": "🏆", "label": "Expert", "minAge": "KG2"}
  },
  "originalImageUrl": "https://upload.wikimedia.org/..."  // ← from b2-asset-baseline: BROKEN
}
```

---

## 5. Linking Content to Series

**Recommended approach:** Link the 112 existing (and new) configs to `eb386a93` (the 8-unit Nigerian Farm & Wild series) by rewriting its `content_items` JSON to reference the actual config item_ids.

### 5.1 eb386a93 content_items rewrite plan

Current (broken):
```json
{"emoji": "🐄", "label": "Cow", "item_id": "cow"}  // doesn't match any config
```

Target (linked):
```json
{
  "item_id": "animals-u1-tap-recognition-creche",
  "lesson_id": "<uuid-from-kids_lessons>",
  "template": "tap-recognition",
  "title": "U1 Farm Animals — créche tap-recognition",
  "domain": "cognitive",
  "tier": 0
}
```

Each unit's `content_items` should be an array of `{item_id, lesson_id, template, title, domain, tier}` objects — one per config in that unit.

### 5.2 d945a82c: Deprecation recommended

The `d945a82c` (Animal World Discovery) series has only 4 units with broken UUID references. It overlaps thematically with `eb386a93`'s U1-U4. **Recommendation:** leave it orphaned (or mark `content_state = 'deprecated'`) and consolidate all content under `eb386a93`.

---

## 6. Summary Counts

| Metric | Current | Target (Gold Std) | Delta |
|---|---|---|---|
| Total configs | 112 | ~160 (8 units × 5 templates × 4 age levels) | +48 |
| Total lessons | 112 | ~160 | +48 |
| Units with full coverage (all ages) | 3 (U1, U2, U3) | 8 | +5 |
| Items per config (min) | 1 (FIB) | 5 | +4 avg |
| Series ↔ config linkage | 0 configs linked | 160 configs linked | +160 |

### Priority execution order:
1. **U7:** Create 19 new configs (tap/match/sort/quiz for créche/nursery/kg/primary)
2. **U6:** Create 14 new configs (tap/match/fib for créche/nursery/kg/primary)
3. **U5:** Create 10 new configs (match/fib/quiz for créche/nursery/kg/primary)
4. **U4:** Create 5 new configs (quiz/fib for créche/nursery/kg/primary)
5. **Upgrade existing:** Expand all FIB to 5 blanks, all quiz to 5 questions, all tap-recognition to 5 items
6. **Link to series:** Rewrite `eb386a93` content_items to reference real config item_ids

---

*Report generated by E3 read-only recon. No inserts executed. No schema changes.*
