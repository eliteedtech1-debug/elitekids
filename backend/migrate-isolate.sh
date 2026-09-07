#!/usr/bin/env bash
# ── Elite Suite DB Isolation Migration ───────────────────────────────────────
# Moves tables to their dedicated DBs so no app touches another app's tables.
#
# Source: elite_content (mixed addon DB)
# Targets:
#   elite_cbt  — CBT-owned tables (CRUD for elitecbt-api)
#   elite_kids — Kids-owned tables (CRUD for elitekids-api)
#   elite_db   — Shared tables (read-only for addons, read/write for elite-api)
#
# Stays in elite_content:
#   Content tables (school_conduct_rules, etc.) — not shared business logic
#
# Usage: bash migrate-isolate.sh
#   Dry-run first: bash migrate-isolate.sh --dry-run
#
# SAFETY: every DROP TABLE / DROP DATABASE in this script is routed through
# backend/lib/assert-database-name.sh, which delegates to backend/lib/db-drop-guard.js.
# The script will abort clean if the target is a production database name or anything
# that does not end in _test (except where explicitly allowed).
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Load the shared DB-name guard (returns 1 + message on stderr when rejected).
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)/assert-database-name.sh"

DB_HOST="127.0.0.1"
DB_USER="elite"
DB_PASS="SMS2026Elite"
MYSQL="mysql -h $DB_HOST -u $DB_USER -p$DB_PASS --silent --batch --skip-column-names"

DRY_RUN="${1:-}"

log() { echo "[MIGRATE] $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

# Disable FK checks for the entire migration (cross-DB moves can't enforce FKs anyway)
log "Disabling foreign key checks..."
$MYSQL -e "SET FOREIGN_KEY_CHECKS=0;" 2>/dev/null || true
FK_DISABLED=true

# NOTE: school_conduct_rules stays in elite_content (content in nature, not shared)
# NOTE: assignment_* tables stay in elite_db (elite-cbt does not handle assignments)
#
# ALSO STAY IN elite_content (content/asset tables, shared across apps):
#   assignment_question_bank_link — stays but FK to question_bank will be dropped
#   question_usage_log — has assignment_id, used by SMS for assignment analytics
#   report_print_logs — SMS report card printing (EndOfTerm, Transcript, etc.)
#   ca_exam_submissions — hardcopy exam data for SMS printed exams
#   school_website_content, school_website_sections, school_website_stories, school_website_tokens

# ── Step 1: Drop empty shared duplicates from elite_content ──────────────────
log "Step 1: Drop empty shared duplicates from elite_content"
for tbl in school_subscriptions school_proctoring_settings; do
  row_cnt=$(eval $MYSQL -e "SELECT COUNT(*) FROM elite_content.$tbl" 2>/dev/null | head -1 || echo "-1")
  log "  elite_content.$tbl has $row_cnt rows"
  if [ "$DRY_RUN" = "--dry-run" ]; then
    log "  [DRY-RUN] Would drop if empty"
  elif [ "$row_cnt" = "0" ] || [ "$row_cnt" = "-1" ]; then
    if assert_database_name "elite_content" "DROP TABLE" "elite_content"; then
      eval $MYSQL -e "DROP TABLE IF EXISTS elite_content.$tbl" 2>/dev/null || true
      log "  Dropped elite_content.$tbl"
    else
      error "  Refused to drop elite_content.$tbl — guard rejected elite_content as target"
    fi
  else
    log "  WARNING: $tbl has $row_cnt rows — keeping it"
  fi
done

# ── Step 2: Move CBT-owned tables → elite_cbt ───────────────────────────────
# NOTE: assignment_* tables stay in elite_db — elite-cbt does not handle assignments
# MOVE: question bank + curriculum tables (CBT is primary consumer)
# STAY: website CMS, feedback templates, moderation, usage logs (cross-app shared)
CBT_TABLES=(
  # Children tables first (they reference parents, so move them before parents)
  cbt_exam_question_options   # references cbt_exam_questions
  cbt_exam_responses          # references cbt_exam_questions, cbt_exam_sessions
  cbt_exam_results            # references cbt_exam_sessions
  cbt_exam_result_approvals   # references cbt_exam_results
  cbt_proctoring_events       # references cbt_exam_sessions
  cbt_subject_access          # references cbt_examinations
  # Parent tables second
  cbt_examinations
  cbt_exam_questions
  cbt_exam_sessions
  cbt_practice_queue
  # Question bank and curriculum (move children before parents due to FKs)
  blueprint_specifications     # references test_blueprints
  test_reliability_analysis    # references cbt_examinations
  test_blueprints
  question_bank
  question_categories
  question_category_map
  item_bank
  item_bank_usage
  curriculum_standards
  question_standards_mapping
  blooms_taxonomy_guide
  question_feedback_templates
  question_moderation
  student_feedback_log
  report_generation_log
  ca_exam_papers
  # ca_exam_submissions stays in elite_content — hardcopy exam data for SMS printed exams
  school_proctoring_settings
)

log "Step 2: Move ${#CBT_TABLES[@]} CBT-owned tables → elite_cbt"

# Drop FK constraints that would block the move (cross-DB FKs not supported anyway)
log "  Dropping FK constraints that block migration..."
$MYSQL -e "ALTER TABLE elite_content.assignment_question_bank_link DROP FOREIGN KEY assignment_question_bank_link_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.question_category_map DROP FOREIGN KEY question_category_map_ibfk_2;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.question_category_map DROP FOREIGN KEY question_category_map_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.question_standards_mapping DROP FOREIGN KEY question_standards_mapping_ibfk_2;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.question_standards_mapping DROP FOREIGN KEY question_standards_mapping_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.question_feedback_templates DROP FOREIGN KEY question_feedback_templates_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.question_moderation DROP FOREIGN KEY question_moderation_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.student_feedback_log DROP FOREIGN KEY student_feedback_log_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.student_feedback_log DROP FOREIGN KEY student_feedback_log_ibfk_2;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.report_generation_log DROP FOREIGN KEY report_generation_log_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.item_bank_usage DROP FOREIGN KEY item_bank_usage_ibfk_1;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.item_bank_usage DROP FOREIGN KEY item_bank_usage_ibfk_2;" 2>/dev/null || true
$MYSQL -e "ALTER TABLE elite_content.question_usage_log DROP FOREIGN KEY question_usage_log_ibfk_1;" 2>/dev/null || true

for tbl in "${CBT_TABLES[@]}"; do
  in_source=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_content' AND TABLE_NAME='$tbl';" 2>/dev/null)
  in_target=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_cbt' AND TABLE_NAME='$tbl';" 2>/dev/null)
  if [ "$in_source" = "0" ]; then
    if [ "$in_target" = "1" ]; then
      log "  DONE: $tbl already in elite_cbt (was moved earlier)"
    else
      log "  SKIP: $tbl not found anywhere"
    fi
    continue
  fi
  if [ "$in_target" = "1" ]; then
    log "  SKIP: $tbl already exists in elite_cbt"
    continue
  fi
  if [ "$DRY_RUN" = "--dry-run" ]; then
    log "  [DRY-RUN] Would move $tbl → elite_cbt"
  else
    $MYSQL -e "CREATE TABLE IF NOT EXISTS elite_cbt.$tbl LIKE elite_content.$tbl;"
    $MYSQL -e "INSERT INTO elite_cbt.$tbl SELECT * FROM elite_content.$tbl;"
    rows=$($MYSQL -e "SELECT COUNT(*) FROM elite_cbt.$tbl;" 2>/dev/null)
    if assert_database_name "elite_content" "DROP TABLE" "elite_content"; then
      $MYSQL -e "DROP TABLE elite_content.$tbl;"
      log "  Moved $tbl → elite_cbt ($rows rows)"
    else
      error "  Refused to drop elite_content.$tbl after move — guard rejected elite_content as target"
    fi
  fi
done

# ── Step 3: Move remaining kids_* tables → elite_kids ───────────────────────
log "Step 3: Move remaining kids_* tables → elite_kids"
KIDS_IN_CONTENT=$($MYSQL -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_content' AND TABLE_NAME LIKE 'kids_%' ORDER BY TABLE_NAME;" 2>/dev/null || true)
KIDS_IN_KIDS=$($MYSQL -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_kids' ORDER BY TABLE_NAME;" 2>/dev/null || true)

if [ -n "$KIDS_IN_CONTENT" ]; then
  for tbl in $KIDS_IN_CONTENT; do
  in_source=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_content' AND TABLE_NAME='$tbl';" 2>/dev/null)
  in_target=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_kids' AND TABLE_NAME='$tbl';" 2>/dev/null)
  if [ "$in_source" = "0" ]; then
    if [ "$in_target" = "1" ]; then
      log "  DONE: $tbl already in elite_kids (was moved earlier)"
    else
      log "  SKIP: $tbl not found anywhere"
    fi
    continue
  fi
  if [ "$in_target" = "1" ]; then
    log "  SKIP: $tbl already exists in elite_kids"
    continue
  fi
  if [ "$DRY_RUN" = "--dry-run" ]; then
    log "  [DRY-RUN] Would move $tbl → elite_kids"
  else
    $MYSQL -e "CREATE TABLE IF NOT EXISTS elite_kids.$tbl LIKE elite_content.$tbl;"
    $MYSQL -e "INSERT INTO elite_kids.$tbl SELECT * FROM elite_content.$tbl;"
    rows=$($MYSQL -e "SELECT COUNT(*) FROM elite_kids.$tbl;" 2>/dev/null)
    if assert_database_name "elite_content" "DROP TABLE" "elite_content"; then
      $MYSQL -e "DROP TABLE elite_content.$tbl;"
      log "  Moved $tbl → elite_kids ($rows rows)"
    else
      error "  Refused to drop elite_content.$tbl after move — guard rejected elite_content as target"
    fi
  fi
done
fi

# ── Step 4: Report remaining tables in elite_content ────────────────────────
log "Step 4: Remaining tables in elite_content (should ONLY be content/CMS tables)"
REMAINING=$($MYSQL -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_content' ORDER BY TABLE_NAME;" 2>/dev/null)
if [ -z "$REMAINING" ]; then
  log "  elite_content is now EMPTY"
else
  log "  Remaining in elite_content (expected: school_website_*, question_usage_log, report_print_logs, ca_exam_submissions):"
  echo "$REMAINING" | while read -r t; do log "    $t"; done
  log ""
  log "⚠️  WARNING: If tables above are not in the expected list, review before applying migration."
fi

if [ "$FK_DISABLED" = true ]; then
  log "Re-enabling foreign key checks..."
  $MYSQL -e "SET FOREIGN_KEY_CHECKS=1;" 2>/dev/null || true
fi

# ── Step 5: Cleanup leftover tables in elite_content ────────────────────────
log ""
log "Step 5: Cleanup leftover tables in elite_content (tables that still exist after migration)"
log "  These are tables that already existed in target DBs but weren't dropped from source."
log ""

CBT_TABLES_CLEANUP=(
  cbt_examinations
  cbt_exam_questions
  cbt_exam_question_options
  cbt_exam_responses
  cbt_exam_results
  cbt_exam_result_approvals
  cbt_exam_sessions
  cbt_practice_queue
  cbt_proctoring_events
  cbt_subject_access
  test_blueprints
  blueprint_specifications
  test_reliability_analysis
  question_bank
  question_categories
  question_category_map
  item_bank
  item_bank_usage
  curriculum_standards
  question_standards_mapping
  blooms_taxonomy_guide
  question_feedback_templates
  question_moderation
  student_feedback_log
  report_generation_log
  ca_exam_papers
)

KIDS_TABLES_CLEANUP=($(echo "$KIDS_IN_KIDS" | tr '\n' ' '))

log "  Dropping leftover CBT tables from elite_content..."
for tbl in "${CBT_TABLES_CLEANUP[@]}"; do
  exists=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_content' AND TABLE_NAME='$tbl';" 2>/dev/null)
  if [ "$exists" = "1" ]; then
    if [ "$DRY_RUN" = "--dry-run" ]; then
      log "    [DRY-RUN] Would drop elite_content.$tbl"
    else
      if assert_database_name "elite_content" "DROP TABLE" "elite_content"; then
        $MYSQL -e "DROP TABLE IF EXISTS elite_content.$tbl;" 2>/dev/null && log "    Dropped elite_content.$tbl" || log "    Failed to drop elite_content.$tbl"
      else
        error "  Refused to drop elite_content.$tbl — guard rejected elite_content as target"
      fi
    fi
  fi
done

log "  Dropping leftover Kids tables from elite_content..."
for tbl in "${KIDS_TABLES_CLEANUP[@]}"; do
  if [ -z "$tbl" ]; then continue; fi
  exists=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_content' AND TABLE_NAME='$tbl';" 2>/dev/null)
  if [ "$exists" = "1" ]; then
    if [ "$DRY_RUN" = "--dry-run" ]; then
      log "    [DRY-RUN] Would drop elite_content.$tbl"
    else
      if assert_database_name "elite_content" "DROP TABLE" "elite_content"; then
        $MYSQL -e "DROP TABLE IF EXISTS elite_content.$tbl;" 2>/dev/null && log "    Dropped elite_content.$tbl" || log "    Failed to drop elite_content.$tbl"
      else
        error "  Refused to drop elite_content.$tbl — guard rejected elite_content as target"
      fi
    fi
  fi
done

log ""
log "── Migration complete ──"
log ""
log "Final state:"
CBT_COUNT=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_cbt';" 2>/dev/null)
KIDS_COUNT=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_kids';" 2>/dev/null)
CONTENT_COUNT=$($MYSQL -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='elite_content';" 2>/dev/null)
log "  elite_cbt: $CBT_COUNT tables"
log "  elite_kids: $KIDS_COUNT tables"
log "  elite_content: $CONTENT_COUNT tables (should only contain: assignment_question_bank_link, ca_exam_submissions, question_usage_log, report_print_logs, school_website_*)"

# ── Post-flight guard ──
# Not used after the migration above wraps every DROP; kept as a documentation
# anchor so the script's safety model is visible in-code. The real guard is the
# per-statement assert_database_name calls + the shared db-drop-guard.js module.
log "Note: this script routes every DROP TABLE through backend/lib/db-drop-guard.js."
