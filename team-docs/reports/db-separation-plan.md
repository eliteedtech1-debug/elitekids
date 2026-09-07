# DB Separation Plan — Elite Suite Apps

**Date:** 2026-09-07  
**Status:** 📋 PLANNING PHASE  
**Owner:** Buffy (AI Agent)  
**Master:** team lead via SSH dispatch

---

## Target Architecture (Clean Setup)

Each app gets its own dedicated DB + optional shared content DB + read-only access to elite_db.

### Final Database Layout

| Database | Purpose | Access |
|----------|---------|--------|
| `elite_db` | **Shared** — SMS core tables (users, students, school_setup, subjects, classes, etc.) | READ-ONLY for addon APIs |
| `elite_cbt` | **CBT-owned** — All CBT tables (exams, questions, blueprints, question bank, etc.) | CBT API: full CRUD |
| `elite_kids` | **Kids-owned** — All kids_* tables (lessons, progress, game configs, etc.) | Kids API: full CRUD |
| `elite_content` | **Shared content** — ONLY if needed (website CMS, cross-app content tables) | READ for all apps |
| `elite_bot` | **AI-owned** — kids_content_generation_audit | Kids API: full CRUD |
| `elitefees` | **Finance-owned** — Full finance suite | Finance API: full CRUD |

### EliteCBT Stack
```
elite_cbt (full CRUD)
  + elite_db (read-only: users, students, school_setup, subjects, classes)
  + elite_content (read-only: only if website CMS or cross-app content needed)
```

### EliteKids Stack
```
elite_kids (full CRUD)
  + elite_db (read-only: users, students, school_setup)
  + elite_bot (full CRUD: content generation audit)
  + elite_content (read-only: only if website CMS or cross-app content needed)
```

### EliteSMS Stack
```
elite_db (full CRUD)
  + reads from elite_cbt, elite_kids, elitefees as needed for dashboards
```

---

## Shared Tables (Stay in elite_db)

These tables are owned by EliteSMS and READ-ONLY for addon apps:

### Core Identity & Access
- `users` — All user accounts (admin, teacher, parent, student)
- `parents` — Parent records linked to users
- `students` — Student records (SMS-imported)
- `school_setup` — School configuration (includes `kids_stand_alone`, `cbt_stand_alone`, `kids_url`)

### Academic Structure
- `subjects` — Subject definitions
- `classes` — Class definitions
- `school_locations` — School location/branch data
- `academic_calendar` — Academic periods

### Other SMS-owned tables (read-only access for addons)
- attendance, assignments, academic_weeks, account_balances, etc.

---

## App-Owned Tables (Move to Dedicated DBs)

### 1. EliteKids-Owned Tables (Move to elite_kids)

**Already in elite_kids (✅ done):**
- kids_children, kids_lessons, kids_game_configs, kids_scene_scripts
- kids_progress, kids_content_approvals, kids_prescreen_log
- kids_denylist_rules, kids_generation_jobs
- kids_game_series, kids_game_units, kids_curriculum_points
- kids_library_games, kids_class_game_variants, kids_game_item_responses
- kids_engagement_snapshots, kids_mastery_progress, kids_test_attempts
- kids_review_schedule, kids_interface_onboarding
- kids_garden_state, kids_companion_state, kids_session_state
- kids_parental_controls, kids_mode_locks, kids_learning_goals
- kids_age_declarations
- kids_teams, kids_team_members, kids_team_challenges, kids_peer_teaching
- kids_class_quests
- kids_insights, kids_action_items, kids_teacher_insights
- kids_content_suggestions, kids_predictions
- kids_subscription_plans, kids_subscriptions, kids_payments
- kids_badges, kids_festival_state, kids_parent_links, kids_parent_notifications

**Still in elite_content (NEEDS MOVE):**
- kids_adaptive_profiles, kids_adaptive_state_v2
- kids_band_placements, kids_boss_raid_games, kids_boss_raid_participants
- kids_boss_raid_state, kids_boss_runs
- kids_competition_analytics, kids_competition_members, kids_competitions
- kids_economy, kids_economy_milestones, kids_economy_transactions
- kids_failed_items, kids_match_history
- kids_marketplace_listings, kids_marketplace_purchases, kids_marketplace_reviews
- kids_power_ups, kids_push_log, kids_push_subscriptions
- kids_review_schedule_v2, kids_series_subject_maps
- kids_shop_items, kids_shop_purchases
- kids_speech_logs, kids_teacher_questions, kids_teacher_quizzes
- kids_tournament_games

### 2. EliteCBT-Owned Tables (Move to elite_cbt)

**Definitely CBT-owned — MOVE to elite_cbt:**
- cbt_examinations, cbt_exam_questions, cbt_exam_question_options
- cbt_exam_responses, cbt_exam_results, cbt_exam_result_approvals
- cbt_exam_sessions, cbt_practice_queue, cbt_proctoring_events
- cbt_subject_access
- ca_exam_papers (CBT continuous assessment papers)
- school_proctoring_settings

Note: ca_exam_submissions stays in elite_content — hardcopy exam data for SMS printed exam workflow

**Move to elite_cbt (test/exam-specific):**
These are test/exam management tables owned by CBT:
- test_blueprints — exam blueprint definitions (FK to cbt_examinations)
- blueprint_specifications — blueprint topic/bloom breakdown
- test_reliability_analysis — exam reliability metrics (FK to cbt_examinations)

**Move to elite_cbt (question bank & curriculum — CBT-owned):**
CBT is the primary consumer of these question/curriculum tables:
- question_bank — master question bank
- question_categories — question categorization
- question_category_map — question-to-category mapping
- item_bank — item/question item bank
- item_bank_usage — item usage tracking
- curriculum_standards — curriculum standard references
- question_standards_mapping — question-to-standard mapping
- blooms_taxonomy_guide — Bloom's taxonomy reference
- question_feedback_templates — question feedback templates (FK to cbt_exam_questions)

**Stay in elite_content (content/asset tables — shared across apps):**
These remain as shared resources:
- ca_exam_submissions — hardcopy exam submissions (for SMS printed exam workflow)
- question_moderation — question moderation queue
- question_usage_log — question usage analytics (FK to question_bank + assignment_id — used by SMS assignments too)
- report_generation_log — report generation audit
- report_print_logs — print audit logs
- student_feedback_log — MOVED to CBT (FK to cbt_examinations + cbt_exam_questions — CBT online exam feedback only)
- school_website_content, school_website_sections, school_website_stories, school_website_tokens — Website CMS

**Rationale for keeping in elite_content:**
- Website CMS content belongs to SMS/schools, not CBT
- question_usage_log has assignment_id column — used by SMS for assignment analytics
- Feedback/moderation/usage logs are cross-app analytics
- These serve multiple apps, not just CBT

**Stay in elite_db (NOT CBT-owned):**
- assignment_questions, assignment_responses, assignment_templates
- assignment_question_options, assignment_question_bank_link
- assignments

**Note:** assignment_question_bank_link exists in elite_content but links to elite_db assignments

### 3. EliteFinance-Owned Tables (Move to elitefees)

**Already in elitefees (✅ done):**
- Full finance suite: accounts, bills, invoices, payments, fee_structures, etc.

**Still in elite_db or elite_content (NEEDS MOVE if any exist):**
- Need to audit for any finance-related tables outside elitefees

---

## API Awareness Rules

Each API must be configured to:

### EliteKids API (port 8484)
- **Read** shared tables from `elite_db` (users, students, school_setup, etc.)
- **CRUD** kids-owned tables in `elite_kids`
- **CRUD** AI tables in `elite_bot` (content generation audit)
- **NEVER** write to `elite_db` shared tables
- **NEVER** touch `elite_cbt` or `elitefees` tables

### EliteCBT API (port 8282)
- **Read** shared tables from `elite_db` (users, students, school_setup, subjects, classes, etc.)
- **CRUD** cbt-owned tables in `elite_cbt`
- **NEVER** write to `elite_db` shared tables
- **NEVER** touch `elite_kids` or `elitefees` tables

### EliteSMS API (port 8383)
- **Full CRUD** on `elite_db` (all shared tables)
- **Read** from `elite_kids`, `elite_cbt`, `elitefees` as needed for dashboards
- **NEVER** directly modify app-owned tables in other DBs (let each app manage its own)

### EliteFinance API
- **Full CRUD** on `elitefees`
- **Read** shared tables from `elite_db` (school_setup, students, etc.)
- **NEVER** write to `elite_db` shared tables
- **NEVER** touch `elite_kids` or `elite_cbt` tables

---

## Migration Strategy

### Phase 1: Audit & Plan (CURRENT)
- [x] Inventory all tables across all DBs
- [x] Identify ownership for each table
- [x] Document current state

### Phase 2: Dry-Run Migration
- Create migration script that:
  1. Lists tables to move (excluding assignments)
  2. Shows CREATE TABLE LIKE + INSERT SELECT + DROP plan
  3. Validates no data loss
  4. **NO actual changes**

### Phase 3: Execute Migration (with backups)
- Run migration with `--apply` flag
- Take mysqldump backups before each move
- Move tables in batches
- Verify row counts match

---

## Tables That Stay in elite_content (Permanent)

These are **content/asset/reference tables** that don't belong to any single app:

### Content & Media
- `school_website_content` — Website CMS content
- `school_website_sections` — Website section structure
- `school_website_stories` — Story/blog content
- `school_website_tokens` — Website access tokens

### Question Bank & Curriculum (MOVED to elite_cbt)
- `question_bank` — Master question bank
- `question_categories` — Question categorization
- `question_category_map` — Question-to-category mapping
- `item_bank` — Item/question item bank
- `item_bank_usage` — Item usage tracking
- `curriculum_standards` — Curriculum standard references
- `question_standards_mapping` — Question-to-standard mapping
- `blooms_taxonomy_guide` — Bloom's taxonomy reference

### Feedback & Moderation (Stay in elite_content)
- `question_moderation` — Question moderation queue
- `question_usage_log` — Question usage analytics

### Assessment Framework
- `test_blueprints` — Test blueprint definitions
- `blueprint_specifications` — Blueprint specs
- `test_reliability_analysis` — Test reliability metrics
- `report_generation_log` — Report generation audit
- `report_print_logs` — Print audit logs
- `student_feedback_log` — Student feedback collection

### Cross-Reference
- `assignment_question_bank_link` — Links questions to assignments (stays where assignments live — elite_db)

---

## Decision Framework for Table Ownership

Ask these questions to determine where a table belongs:

1. **Who creates/owns the data?**
   - If SMS creates it → elite_db (shared)
   - If CBT app creates it → elite_cbt
   - If Kids app creates it → elite_kids
   - If it's reference/content data → elite_content

2. **Who reads the data?**
   - If multiple apps need it → elite_content or elite_db
   - If only one app needs it → that app's DB

3. **Is it business logic or content?**
   - Business logic (exams, progress, subscriptions) → app's DB
   - Content/assets (questions, website, curriculum refs) → elite_content

4. **Does it have FK relationships?**
   - If FK to shared tables only → can go to app DB
   - If FK to other app-specific tables → keep together

---

### Phase 4: Update API Configurations
- Update each API's database config to point to correct DBs
- Add connection pools for dedicated DBs
- Update query routing logic

### Phase 5: Testing & Verification
- Run integration tests
- Verify APIs can read/write to correct DBs
- Verify shared table access still works
- Monitor for errors

---

## Migration Script: migrate-isolate.sh

Already exists at `backend/migrate-isolate.sh` — needs review and enhancement:

```bash
#!/usr/bin/env bash
# Moves tables to their dedicated DBs
# Usage: bash migrate-isolate.sh [--dry-run]
```

Current script handles:
- Step 1: Drop empty shared duplicates from elite_content
- Step 2: Move CBT-owned tables → elite_cbt
- Step 3: Move kids_* tables → elite_kids
- Step 4: Report remaining tables in elite_content

**Needs enhancement:**
- Add elitefees table handling
- Add transaction safety
- Add rollback capability
- Add detailed logging

---

## Next Steps

1. **Review current migrate-isolate.sh** — check if it handles all tables
2. **Run dry-run migration** — verify planned moves
3. **Backup all databases** — before any changes
4. **Execute migration** — move tables to dedicated DBs
5. **Update API configs** — ensure each API uses correct DBs
6. **Test thoroughly** — verify everything works

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during move | mysqldump backups before each move |
| Foreign key violations | SET FOREIGN_KEY_CHECKS=0 during migration |
| API downtime | Migrate during maintenance window |
| Broken queries after move | Update all API DB configs before cutover |
| orphaned records | Validate row counts match after move |

---

## Completion Criteria

### Phase 1: Database Migration ✅ COMPLETED
- [x] All kids_* tables in elite_content moved to elite_kids (64 tables)
- [x] All cbt_* tables + question_bank + curriculum tables moved to elite_cbt (26 tables)
- [x] Assignment tables remain in elite_db (SMS-owned)
- [x] elite_content only contains: school_website_*, question_usage_log, report_print_logs, ca_exam_submissions, assignment_question_bank_link
- [x] Verify row counts match after each move

### Phase 2: API Configuration 🔄 IN PROGRESS
- [ ] EliteCBT API: Update `.env` to set CONTENT_DB_NAME=elite_cbt, restart service
- [ ] EliteKids API: Already configured correctly (uses KIDS_DB_NAME=elite_kids)
- [ ] EliteSMS API: No changes needed (owns elite_db)
- [x] All hardcoded `elite_content.` references removed from SQL queries

### Phase 3: Testing ⏳ PENDING
- [ ] Restart CBT API with new DB config
- [ ] Verify CBT API can read/write to elite_cbt
- [ ] Verify Kids API can read/write to elite_kids
- [ ] Verify shared table reads work (users, students, school_setup)
- [ ] Run integration tests
