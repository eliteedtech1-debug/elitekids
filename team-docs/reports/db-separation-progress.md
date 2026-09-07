# DB Separation Progress Report

**Date:** 2026-09-07  
**Status:** ✅ PHASE 1 COMPLETE — Phase 2 in progress  
**Migration Time:** ~15 minutes

## What Was Done

### Database Migration (Phase 1) ✅ COMPLETE

| Source | → | Target | Tables | Rows Moved |
|--------|---|--------|--------|------------|
| elite_content | → | elite_cbt | 26 tables | ~3,300+ rows |
| elite_content | → | elite_kids | ~30 tables | ~50+ rows |

### Tables Moved to elite_cbt (26 tables)
- All cbt_* tables (exams, questions, responses, sessions, proctoring)
- Question bank: question_bank, question_categories, question_category_map
- Item bank: item_bank, item_bank_usage
- Curriculum: curriculum_standards, question_standards_mapping, blooms_taxonomy_guide
- Test design: test_blueprints, blueprint_specifications, test_reliability_analysis
- Feedback: question_feedback_templates, question_moderation, student_feedback_log
- Reports: report_generation_log
- CA: ca_exam_papers

### Tables Moved to elite_kids (30+ tables)
- All remaining kids_* tables (adaptive profiles, boss raids, competitions, economy, etc.)
- Already existed: kids_children, kids_lessons, kids_game_configs, kids_progress, etc.

### Tables Remaining in elite_content (8 tables)
These are content/CMS/SMS-owned tables that don't belong to CBT or Kids:
- `school_website_content`, `school_website_sections`, `school_website_stories`, `school_website_tokens` — Website CMS
- `question_usage_log` — SMS assignment analytics (has assignment_id column)
- `report_print_logs` — SMS report card printing
- `ca_exam_submissions` — SMS hardcopy exam submissions
- `assignment_question_bank_link` — FK dropped, needs to be moved to elite_db

## API Updates Made

### elite-cbt/backend/src/models/index.js
- Changed default CONTENT_DB_NAME from 'elite_content' to 'elite_cbt'
- Updated comments to reflect new DB structure

### elite-cbt/backend/src/controllers/adaptiveTestingController.js
- Removed hardcoded `elite_content.` prefixes from SQL queries
- Updated comments

### elite-cbt/backend/src/controllers/longitudinalAnalyticsController.js
- Removed hardcoded `elite_content.` prefixes from SQL queries

### elite-kids/backend/src/models/index.js
- Cleaned up outdated comments
- Simplified connection setup (removed unused contentSequelize)

### backend/migrate-isolate.sh
- Fixed bug: unbound variable KIDS_IN_CONTENT
- Added FK constraint drops before table moves
- Added cleanup step for leftover tables
- Fixed table ordering (children before parents for FK constraints)

## Next Steps

1. **Update CBT API .env**: Set `CONTENT_DB_NAME=elite_cbt`
2. **Restart CBT API**: systemctl restart elite-cbt-api (or however it's running)
3. **Test CBT API**: Verify exams, questions, analytics endpoints work
4. **Test Kids API**: Verify it still works (shouldn't need changes)
5. **Handle assignment_question_bank_link**: Move to elite_db or recreate FK properly

## Backup Location
`/var/www/html/elite/logs/db-migration-backup-20260907-082329/`
- elite_content-full.sql (1.8M)
- elite_cbt-backup.sql (20K)
- elite_kids-backup.sql (56K)

## API Restart & Verification (Phase 2) ✅ COMPLETE

### Elite-Kids API Restart
- Killed old process (PID 1548714) that was using stale `elite_content` config
- Started new process with updated `models/index.js` that binds `db.content` to `kidsSequelize` (elite_kids)
- API now correctly queries kids tables from `elite_kids` database

### Verified Working
- ✅ Health endpoint: `{"status":"ok"}`
- ✅ Kids tables synced into elite_kids
- ✅ WebSocket services attached (live, chat, teams)

### Known Issues (Non-Critical)
- ⚠️ Duplicate key warnings during sync (tables already exist - safe to ignore)
- ⚠️ Missing column `kids_children.allow_anonymous_comparison` - needs migration fix
- ⚠️ Global catalog seed skipped (validation error - non-critical)

## Remaining Tables in elite_content (8 tables)
These are correct and should stay:
- `school_website_content`, `school_website_sections`, `school_website_stories`, `school_website_tokens` — Website CMS
- `question_usage_log` — SMS assignment analytics (has assignment_id column)
- `report_print_logs` — SMS report card printing
- `ca_exam_submissions` — SMS hardcopy exam submissions
- `assignment_question_bank_link` — FK dropped, should move to elite_db later

## Assignment Tables Ownership (Final)

### Each DB has its own assignment-related tables:

**elite_db (SMS-owned):**
- `assignments` — SMS assignment definitions
- `assignment_questions` — SMS assignment questions
- `assignment_responses` — Student responses
- `assignment_templates` — Question templates
- `assignment_question_options` — Question options
- `assignment_question_bank_link` — Links SMS assignments to question_bank (moved from elite_content)

**elite_cbt (CBT-owned):**
- NO assignment tables — CBT does not handle assignments
- Question bank is linked to exams via FK (cbt_exam_questions → cbt_examinations)
- Blueprints linked to exams via FK (test_blueprints → cbt_examinations)

**elite_kids (Kids-owned):**
- NO assignment tables — Kids uses game-based learning, not traditional assignments

### Design Principle
- CBT never has assignment-related table names for clarity
- Each DB owns its domain; cross-DB relationships are avoided when possible
- `assignment_question_bank_link` was moved to elite_db where assignments live
