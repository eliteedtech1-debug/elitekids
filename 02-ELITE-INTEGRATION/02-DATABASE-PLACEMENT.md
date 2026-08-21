# Elite Integration — Database Placement

Where every EliteKids table lives. **The golden rule: the shared school DB
(`elite_db` / `DB_NAME`) is never touched for new tables** — it belongs to elite-api.
Addon tables go into `elite_content` + the AI DB (the same DBs the CBT addon uses),
exactly as the user directed.

## 1. Connection topology (mirrors elite-cbt-api `src/models/index.js`)

| Sequelize instance | Database | Env var | Contents |
| --- | --- | --- | --- |
| `sequelize` (main) | `DB_NAME` | `DB_NAME` (e.g. `elite_db`) | Shared: `users`, `students`, `teachers`, `parents`, `school_setup`, `classes`, `subjects`, `school_locations`, `password_reset_tokens` — **read-only for elite-kids** |
| `content` | `elite_content` | `CONTENT_DB_NAME` | **Kids-owned content tables** (`kids_*`) — created/synced by this service |
| `ai` | AI DB | `AI_DB_NAME` | **Kids AI audit** (`kids_content_generation_audit`) — created/synced by this service. **CONFIRMED 2026-08-17: this server has `elite_bot`, not `elite_ai`** (elite-api's default; neither elite-api nor elite-cbt sets `AI_DB_*`). Default is `elite_bot`; set `AI_DB_NAME=elite_ai` only where that DB is provisioned (see DEC-002). |
| `audit` (optional) | `elite_logs` | `AUDIT_DB_NAME` | Future messaging/logging (not needed for MVP) |

`elite_api/src/config/databases.js` already connects to all four — elite-kids-api
mirrors that with the same env conventions.

## 2. Kids-owned tables — `elite_content` (prefix `kids_`)

All created via `model.sync({ force: false })` + idempotent additive column
reconcile (never alter existing tables), the elite-cbt way.

### `kids_children` — child profile (nursery student enrichment layer)
**Canonical source: `elite_db.students WHERE section = 'Nursery'`** — kids in
EliteKids are nursery students; the `section` column on the shared `students`
table is what distinguishes them from older students handled by elite-cbt.

`kids_children` is an optional enrichment profile: it adds kids-app-specific
fields (avatar, age_level for the game engine, kids-app parent linking via
`parent_user_id`) and lives in `elite_content` to keep the shared DB schema
stable. Controllers query both tables: `students` for canonical data
(admission_no, class_code, parent_id/guardian_id ownership), `kids_children`
for the enrichment.

Links to the shared `students` table by `admission_no`. One row per child.
```
id              VARCHAR(50) PK            -- uuid
admission_no    VARCHAR(50) NOT NULL      -- FK-ish → elite_db.students.admission_no
school_id       VARCHAR(20) NOT NULL
branch_id       VARCHAR(20) NOT NULL
full_name       VARCHAR(191) NOT NULL
age_level       ENUM('Creche','Nursery','KG1','KG2','Primary') NOT NULL DEFAULT 'Nursery'
class_code      VARCHAR(50) NULL          -- shared classes.class_code
avatar_url      VARCHAR(500) NULL
parent_user_id  VARCHAR(50) NULL          -- elite_db.users.id of the parent account
parent_phone    VARCHAR(20) NULL
status          ENUM('Active','Inactive') NOT NULL DEFAULT 'Active'
created_at, updated_at
KEY (school_id, branch_id), KEY (admission_no), KEY (parent_user_id)
```

### `kids_lessons` — lesson record (teacher-created, AI-enriched)
```
id              VARCHAR(50) PK
school_id       VARCHAR(20) NOT NULL
branch_id       VARCHAR(20) NOT NULL
title           VARCHAR(191) NOT NULL
subject         VARCHAR(100) NOT NULL
age_level       ENUM('Creche','Nursery','KG1','KG2','Primary') NOT NULL
lesson_text     TEXT NULL                 -- AI or teacher-written text
created_by      VARCHAR(50) NOT NULL      -- elite_db.users.id
content_state   ENUM('generated','pre_screened','pending_human_review',
                     'approved','published','recalled') NOT NULL DEFAULT 'generated'
lesson_type     ENUM('game','video','story','song','worksheet') NOT NULL DEFAULT 'game'
duration_target_sec INT NULL
published_at    DATETIME NULL
KEY (school_id, branch_id), KEY (content_state), KEY (age_level)
```
> **The state machine is the safety core.** No child-facing query may return a lesson
> whose `content_state != 'published'`. Enforced at the API layer (WHERE clause),
> never as an app convention. `recalled` instantly removes content from children.

### `kids_game_configs` — validated Game Config JSON (one per lesson/template)
```
id              VARCHAR(50) PK
lesson_id       VARCHAR(50) NOT NULL      -- FK-ish → kids_lessons.id
template        ENUM('matching','tap-recognition','drag-sort','quiz') NOT NULL
age_level       VARCHAR(20) NOT NULL
config_json     JSON NOT NULL             -- validated against game-engine/schemas/*.schema.json
schema_version  VARCHAR(10) NOT NULL DEFAULT '1.0'
content_state   ENUM('generated','pre_screened','pending_human_review',
                     'approved','published','recalled') NOT NULL DEFAULT 'generated'
model_version   VARCHAR(50) NULL          -- pinned AI provider version
created_by      VARCHAR(50) NULL
approved_by     VARCHAR(50) NULL
approved_at     DATETIME NULL
KEY (lesson_id), KEY (content_state), KEY (template)
```

### `kids_scene_scripts` — Scene Script JSON (video/animation content)
Same shape as `kids_game_configs` but for the rig-based animation scenes
(see 01-PLANNING/10-VIDEO-ANIMATION-ARCHITECTURE-REVISION.md):
```
id, lesson_id, scene_type VARCHAR(30), script_json JSON, schema_version,
content_state, model_version, created_by, approved_by, approved_at,
KEY (lesson_id), KEY (content_state)
```

### `kids_progress` — child progress (game completions, stars, XP)
```
id              VARCHAR(50) PK
school_id, branch_id
child_admission_no  VARCHAR(50) NOT NULL  -- → kids_children.admission_no
lesson_id       VARCHAR(50) NOT NULL
game_config_id  VARCHAR(50) NULL
score           INT NOT NULL DEFAULT 0
stars_earned    TINYINT NOT NULL DEFAULT 0
xp              INT NOT NULL DEFAULT 0
completed_at    DATETIME NOT NULL
idempotency_key VARCHAR(100) NULL         -- dedupe game:complete retries
UNIQUE KEY (child_admission_no, lesson_id, game_config_id, idempotency_key)
```

### `kids_content_approvals` — human review queue
```
id              VARCHAR(50) PK
school_id, branch_id
content_type    ENUM('lesson','game_config','scene_script','story','audio') NOT NULL
content_id      VARCHAR(50) NOT NULL
status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'
reviewed_by     VARCHAR(50) NULL
reviewed_at     DATETIME NULL
rejection_reason TEXT NULL
KEY (school_id, status), KEY (content_type, content_id)
```

### `kids_prescreen_log` — classifier results per generated asset
```
id, content_type, content_id, age_appropriate TINYINT, safe TINYINT,
curriculum_aligned TINYINT, score DECIMAL(5,2), passed TINYINT,
classifier_version VARCHAR(50), created_at
```

### `kids_denylist_rules` — deterministic denylist (versioned, auditable)
```
id INT AUTO_INCREMENT PK
rule TEXT NOT NULL          -- phrase / category / pattern
category VARCHAR(50) NOT NULL
active TINYINT(1) NOT NULL DEFAULT 1
added_by VARCHAR(50) NULL
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
```
Seed data ships in `backend/src/seeders/denylistSeed.js` (age-inappropriate, violent,
scary, commercial, etc. — human-curated).

### `kids_generation_jobs` — AI generation queue (optional, BullMQ-backed)
```
id VARCHAR(50) PK, lesson_id, content_type, template, status
ENUM('queued','running','succeeded','failed'), attempts INT, error TEXT,
model_version VARCHAR(50), created_at, updated_at
```

## 3. AI tables — AI DB (prefix `kids_`; `elite_bot` on this server, `elite_ai` where provisioned)

### `kids_content_generation_audit` — the permanent audit log (legal/regulatory)
Every AI generation is logged permanently — prompt, provider + pinned model version,
raw output, classifier score, denylist result, reviewer identity, approval/publish
timestamps. If a parent/school/regulator asks "why did my child see this," the answer
must be retrievable in minutes.
```
id              VARCHAR(50) PK
school_id       VARCHAR(20) NOT NULL
content_type    VARCHAR(30) NOT NULL
content_id      VARCHAR(50) NOT NULL
prompt          TEXT NOT NULL
model_provider  VARCHAR(50) NOT NULL
model_version   VARCHAR(50) NOT NULL
raw_output      MEDIUMTEXT NULL
classifier_score DECIMAL(5,2) NULL
classifier_passed TINYINT(1) NULL
denylist_result VARCHAR(20) NULL          -- 'passed' | 'blocked'
reviewer_id     VARCHAR(50) NULL
approved_at     DATETIME NULL
published_at    DATETIME NULL
created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
KEY (school_id, created_at), KEY (content_id)
```

## 4. Main DB — additive columns only (via migration runner)

The migration runner (`backend/database/migrate.js`, dry-run by default) adds:

| Table | Column | DDL | Why |
| --- | --- | --- | --- |
| `school_setup` | `kids_stand_alone` | `TINYINT(1) NOT NULL DEFAULT 0` | Module gate (mirror `cbt_stand_alone`) |
| `school_setup` | `kids_url` | `VARCHAR(50) NULL DEFAULT NULL` | Store `https://<school>.elitekids.com.ng` |

Both are **additive + default-preserving** (0 = feature off, nothing breaks for
existing schools) and backed up via `mysqldump` before apply — the elite-cbt
migration runner pattern, which the user has explicitly required (information_schema
existence checks with prepared statements; a re-run prints "column exists, skipping").

## 5. Storage (B2) — mirrors the media-service convention

| Bucket | Contents |
| --- | --- |
| `elite-kids-doc-files` | Lesson plans, worksheets, PDFs (no compression) |
| `elite-kids-media-files` | Images, audio, video, game sprites/sounds (sharp-processed) |
| `elite-kids-bot-files` | AI/agent working files (not user-facing) |

Game assets live under `games/<lessonId>/` in the media bucket. Buckets are private;
the API returns short-lived signed URLs only (reuse `elite-api`'s `s3Client.js`
pattern / the media-service in `lms-stack`).
