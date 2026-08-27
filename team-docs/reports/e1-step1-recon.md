# E1 Step 1 — Recon: Models, Seeder & Curriculum Mapping Docs

**Date:** 2026-08-24 · **Agent:** fb-review (read-only, docs-only) · **No code or schema touched.**
**Files reviewed:**
- `backend/src/models/KidLesson.js`
- `backend/src/models/KidCurriculumPoint.js`
- `backend/src/models/KidGameConfig.js`
- `backend/src/seeders/jollyPhonicsSeriesSeed.js`
- `01-PLANNING/15-CURRICULUM-MAPPING-AND-CONTENT-LIBRARY-MODEL.md`

---

## (a) Table / Column Map

### `kids_lessons` (elite_content)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | STRING(50) PK | No | e.g. `lesson-jp-u1-tap` |
| `school_id` | STRING(20) | No | `SCH-KIDS` for JP seed |
| `branch_id` | STRING(20) | No | `BR-MAIN` for JP seed |
| `title` | STRING(191) | No | e.g. "Sound Friends: s a t i p n — Tap Your Sound Friends" |
| `subject` | STRING(100) | No | `"English — Phonics"` |
| `age_level` | ENUM | No | `'Creche'\|'Nursery'\|'KG1'\|'KG2'\|'Primary'` |
| `lesson_text` | TEXT | Yes | Free-text description |
| `created_by` | STRING(50) | No | `SYSTEM` for seed |
| `content_state` | ENUM | No | `'generated'\|'pre_screened'\|'pending_human_review'\|'approved'\|'published'\|'recalled'` — seed uses `'published'` |
| `lesson_type` | ENUM | No | `'game'\|'video'\|'story'\|'song'\|'worksheet'` — seed uses `'game'` |
| `duration_target_sec` | INTEGER | Yes | Unit-level duration (120–200) |
| `is_global` | TINYINT(1) | No | Default 0; seed sets `1` |
| `published_at` | DATE | Yes | `new Date()` in seed |

**Indexes:** `(school_id, branch_id)`, `(content_state)`, `(age_level)`

### `kids_game_configs` (elite_content)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | STRING(50) PK | No | e.g. `gc-jp-u1-tap` |
| `lesson_id` | STRING(50) | No | FK → `kids_lessons.id` |
| `template` | ENUM | No | `'matching'\|'tap-recognition'\|'drag-sort'\|'quiz'` — seed uses all 4 |
| `age_level` | STRING(20) | No | Copied from unit age |
| `config_json` | JSON | No | Full runtime config (see §b) |
| `schema_version` | STRING(10) | No | Default `'1.0'` |
| `item_id` | STRING(50) | Yes | e.g. `jp-u1-tap` — **key used in `mapped_item_ids`** |
| `tier` | INTEGER | Yes | Unit tier (0–3) |
| `category` | STRING(50) | Yes | `'Letters'` for JP |
| `content_state` | ENUM | No | `'published'` in seed |
| `model_version` | STRING(50) | Yes | `'jolly-phonics-v1'` |
| `created_by` | STRING(50) | Yes | `SYSTEM` |
| `approved_by` | STRING(50) | Yes | `SYSTEM` |
| `approved_at` | DATE | Yes | `new Date()` |

**Indexes:** `(lesson_id)`, `(content_state)`, `(template)`, `(item_id)`, `(tier)`, `(category)`, unique `(item_id, tier)`

### `kids_curriculum_points` (elite_content)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | STRING(50) PK | No | e.g. `cp-jp-u1-tap` |
| `curriculum_source` | STRING(255) | Yes | `"Jolly Phonics (Lloyd, 1998) — Group order preserved"` |
| `age_band` | STRING(20) | No | Matches unit age_level |
| `learning_objective` | TEXT | No | Unit objective + domain suffix |
| `category` | STRING(50) | No | `'Letters'` |
| `mapped_item_ids` | JSON | No | **Array of `item_id` strings** — see §c |

**Indexes:** `(age_band)`, `(category)`

---

## (b) Seed Row Shape Example (one game)

**Unit 1, Game 1 (tap-recognition):**

```json
// kids_lessons row:
{
  "id": "lesson-jp-u1-tap",
  "school_id": "SCH-KIDS",
  "branch_id": "BR-MAIN",
  "title": "Sound Friends: s a t i p n — Tap Your Sound Friends",
  "subject": "English — Phonics",
  "age_level": "Creche",
  "lesson_text": "Tap Your Sound Friends (cognitive domain, Tier 0)",
  "created_by": "SYSTEM",
  "content_state": "published",
  "lesson_type": "game",
  "duration_target_sec": 120,
  "is_global": 1,
  "published_at": "2026-08-24T..."
}

// kids_game_configs row:
{
  "id": "gc-jp-u1-tap",
  "lesson_id": "lesson-jp-u1-tap",
  "template": "tap-recognition",
  "age_level": "Creche",
  "config_json": {
    "gameId": "gc-jp-u1-tap",
    "template": "tap-recognition",
    "lessonId": "lesson-jp-u1-tap",
    "ageLevel": "Creche",
    "category": "Letters",
    "tier": 0,
    "item_id": "jp-u1-tap",
    "series_id": "series-jolly-phonics",
    "unit_number": 1,
    "domain": "cognitive",
    "rewards": { "starsOnComplete": 3, "xp": 20 },
    "successThresholdPct": 50,
    "durationSec": 120,
    "prompt": "Tap the letter I say!",
    "responseMode": "text",
    "items": [
      { "label": "s", "color": "#2E8B57" },
      { "label": "a", "color": "#FF6B35" },
      { "label": "t", "color": "#4A90D9" },
      { "label": "i", "color": "#8B4513" },
      { "label": "p", "color": "#946BDE" },
      { "label": "n", "color": "#2F8F83" }
    ]
  },
  "schema_version": "1.0",
  "item_id": "jp-u1-tap",
  "tier": 0,
  "category": "Letters",
  "content_state": "published",
  "model_version": "jolly-phonics-v1",
  "approved_by": "SYSTEM",
  "approved_at": "2026-08-24T..."
}

// kids_curriculum_points row:
{
  "id": "cp-jp-u1-tap",
  "curriculum_source": "Jolly Phonics (Lloyd, 1998) — Group order preserved",
  "age_band": "Creche",
  "learning_objective": "Exposure to Group 1 letter shapes with their phonic sounds (multi-sensory, no wrong answers). Domain: cognitive.",
  "category": "Letters",
  "mapped_item_ids": ["jp-u1-tap"]
}
```

---

## (c) `mapped_item_ids` Mechanism Explained

From the seeder (step 4 in the unit loop):

```js
for (const ci of contentItems) {
  await upsert(db.KidCurriculumPoint, `cp-${ci.item_id}`, {
    curriculum_source: 'Jolly Phonics (Lloyd, 1998) — Group order preserved',
    age_band: unit.age,
    learning_objective: `${unit.objective} Domain: ${ci.domain}.`,
    category: 'Letters',
    mapped_item_ids: [ci.item_id],   // <-- JSON array
  });
}
```

**Mechanism:**
1. Each game config has an `item_id` field (e.g. `jp-u1-tap`).
2. Each curriculum point stores `mapped_item_ids` as a **JSON array of `item_id` strings**.
3. The seed creates a **1:1 mapping** — one curriculum point per game, with `mapped_item_ids: [single_item_id]`.
4. The design allows **1:N** (one curriculum point → multiple games that satisfy it) or **N:1** (multiple curriculum points → one game), but the JP seed uses strictly 1:1.
5. The `item_id` is the join key: it exists on `kids_game_configs.item_id` and is referenced inside `kids_curriculum_points.mapped_item_ids` (JSON, not a FK).
6. Per Doc 15, the intent is: a teacher browses by curriculum point → sees which library games map to it → assigns directly without generating new content.

**Note:** the mapping is JSON-based (not relational), so querying "all games mapped to curriculum point X" requires JSON containment checks (`JSON_CONTAINS` in MySQL), not a simple JOIN.

---

## (d) Unit Numbers + Sound Groups (for NERDC-ECC-LIT-PA code generation)

| Unit | ID | Number | Age | Tier | Sound Group | Letters/Sounds | Game Keys |
|---|---|---|---|---|---|---|---|
| U1 | `unit-jp-u1` | 1 | Creche | 0 | Group 1 | **s a t i p n** | tap, match, sort |
| U2 | `unit-jp-u2` | 2 | Nursery | 1 | Groups 1-2 review | **c k e h r m d** | tap, match, sort |
| U3 | `unit-jp-u3` | 3 | KG1 | 2 | Group 3 + digraph | **g o u l f b** + ai/oa | tap, quiz, sort |
| U4 | `unit-jp-u4` | 4 | KG2 | 2→3 | Groups 5-6 | **ch sh th ng oo** | fib, quiz-aff, sort-chsh |
| U5 | `unit-jp-u5` | 5 | Primary | 3 | Group 7 + recall | **qu ou oi ue er ar** | quiz-riddle, fib, sort-patterns |

### NERDC-ECC-LIT-PA Code Pattern

Based on the naming convention `NERDC-ECC-LIT-PA-U{unit}-{soundGroup}`:

| Code | Unit | soundGroup slug | Suggested value |
|---|---|---|---|
| `NERDC-ECC-LIT-PA-U1-G1` | 1 | Group 1 | `s-a-t-i-p-n` |
| `NERDC-ECC-LIT-PA-U2-G12` | 2 | Groups 1-2 review | `c-k-e-h-r-m-d` |
| `NERDC-ECC-LIT-PA-U3-G3` | 3 | Group 3 + digraph | `g-o-u-l-f-b-ai-oa` |
| `NERDC-ECC-LIT-PA-U4-G56` | 4 | Groups 5-6 | `ch-sh-th-ng-oo` |
| `NERDC-ECC-LIT-PA-U5-G7` | 5 | Group 7 + recall | `qu-ou-oi-ue-er-ar` |

**Derivation notes:**
- The `soundGroup` slug encodes the phonics group(s) from Jolly Phonics (Lloyd, 1998) Group order.
- U2 is "Groups 1-2 review" — the seed comment says review, meaning U2 covers Group 2 letters (c k e h r m d) while reinforcing Group 1 (s a t i p n). The slug could be `G12` or `G2-review`.
- U3 adds digraphs ai/oa alongside Group 3 (g o u l f b). The slug could be `G3-digraph` or just `G3`.
- U4 covers Groups 5-6 (the digraphs ch sh th ng oo). The seed skips Group 4 (j v w x y z) — confirm if intentional or if a unit is missing.
- U5 is Group 7 (qu ou oi ue er ar) with full recall/review.

### Total seed counts
- **1 series** (`series-jolly-phonics`)
- **5 units** (`unit-jp-u1` through `unit-jp-u5`), chained via `prerequisite_unit_id`
- **15 lessons** (`lesson-jp-u{1-5}-{game_key}`)
- **15 game configs** (`gc-jp-u{1-5}-{game_key}`)
- **15 curriculum points** (`cp-jp-u{1-5}-{game_key}`), each 1:1 mapped via `mapped_item_ids`

---

*Recon complete. No code or schema modified.*
