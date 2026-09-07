# DB Table Fate Determination — FK Analysis Results

**Date:** 2026-09-07  
**Method:** Foreign key relationship analysis to determine table ownership

---

## Summary: Tables Still in elite_content (undecided)

### Already Decided

| Table | Fate | Reason |
|-------|------|--------|
| `ca_exam_papers` | → elite_cbt | CBT continuous assessment papers |
| `test_blueprints` | → elite_cbt | FK to cbt_examinations |
| `blueprint_specifications` | → elite_cbt | FK to test_blueprints |
| `test_reliability_analysis` | → elite_cbt | FK to cbt_examinations |
| `question_bank` | → elite_cbt | Question bank core |
| `question_categories` | → elite_cbt | Question categorization |
| `question_category_map` | → elite_cbt | FK to question_bank, question_categories |
| `item_bank` | → elite_cbt | FK to cbt_exam_questions |
| `item_bank_usage` | → elite_cbt | FK to cbt_examinations, item_bank |
| `curriculum_standards` | → elite_cbt | Curriculum reference for CBT |
| `question_standards_mapping` | → elite_cbt | FK to cbt_exam_questions, curriculum_standards |
| `blooms_taxonomy_guide` | → elite_cbt | Bloom's taxonomy for CBT |
| `question_feedback_templates` | → elite_cbt | FK to cbt_exam_questions |
| `school_website_content` | → elite_content (stay) | SMS website CMS |
| `school_website_sections` | → elite_content (stay) | SMS website CMS |
| `school_website_stories` | → elite_content (stay) | SMS website CMS |
| `school_website_tokens` | → elite_content (stay) | SMS website CMS |
| `assignment_question_bank_link` | → elite_db (stay) | FK to question_bank but used by SMS assignments |

---

### Still Need Decision: Tables with FKs to CBT tables

| Table | FK Relationships | Questions to Determine Fate |
|-------|------------------|----------------------------|
| `question_moderation` | FK → cbt_exam_questions | Is moderation for CBT online questions only, or also for printed/hardcopy questions? |
| `question_usage_log` | FK → question_bank | Is usage tracking for CBT exams only, or across all question usage (SMS printable too)? |
| `report_generation_log` | FK → cbt_examinations | Is report generation for CBT exams only, or also SMS report cards? |
| `report_print_logs` | (no FK to CBT tables found) | What does this track? Print logs for what? |
| `student_feedback_log` | FK → cbt_examinations, cbt_exam_questions | Is student feedback for CBT exams only, or also SMS assignments/printed exams? |

---

## Decision Queries for Each Undecided Table

### 1. `question_moderation`
```sql
-- Check: Does moderation involve printed/hardcopy questions?
-- If YES → stay in elite_content (SMS uses it too)
-- If NO → move to elite_cbt (CBT-only)

-- Query to run in app code:
SELECT COUNT(*) FROM question_moderation qm
JOIN cbt_exam_questions ceq ON qm.question_id = ceq.id
WHERE ceq.exam_type = 'online';  -- if all are online, CBT-owned
```

### 2. `question_usage_log`
```sql
-- Check: Is usage tracked only for CBT exams?
-- If YES → move to elite_cbt
-- If NO → stay in elite_content (shared usage analytics)

-- Query to run:
SELECT DISTINCT source FROM question_usage_log LIMIT 10;
-- If 'source' column shows 'cbt_exam' only → CBT-owned
-- If 'source' shows 'printed_exam', 'assignment' etc → stay shared
```

### 3. `report_generation_log`
```sql
-- Check: What exams trigger reports?
-- If CBT exams only → move to elite_cbt
-- If SMS report cards also trigger → stay in elite_content

-- Query to run:
SELECT rgl.*, ceq.title AS exam_title 
FROM report_generation_log rgl
JOIN cbt_examinations ceq ON rgl.exam_id = ceq.id
LIMIT 5;
-- Check if exam_title values are CBT exam names or generic
```

### 4. `report_print_logs`
```sql
-- Check: What is being printed?
-- No FK found — need to inspect columns

-- Query to run:
SHOW CREATE TABLE report_print_logs;
DESCRIBE report_print_logs;
-- If tracks CBT exam paper printing → move to elite_cbt
-- If tracks SMS report card / receipt printing → stay in elite_content
```

### 5. `student_feedback_log`
```sql
-- Check: Is feedback for CBT exams or also SMS assignments?
-- FK to cbt_examinations AND cbt_exam_questions → seems CBT

-- Query to run:
SELECT DISTINCT exam_id FROM student_feedback_log sfl
JOIN cbt_examinations cbt ON sfl.exam_id = cbt.id
WHERE cbt.exam_type IN ('online', 'practice', 'mock');
-- If all are CBT exam types → move to elite_cbt
-- If some are SMS assignment IDs → stay in elite_content
```

---

## Decision Framework

For each undecided table, ask:

1. **Who creates the data?**
   - CBT exam engine → elite_cbt
   - SMS printable/assignment workflow → elite_content or elite_db
   - Both → elite_content (shared)

2. **Who reads/queries the data?**
   - CBT dashboard only → elite_cbt
   - SMS reports/dashboard too → elite_content
   - Both apps → elite_content

3. **What happens if the table moves?**
   - If SMS breaks without it → stays shared
   - If only CBT needs it → moves to CBT

---

## Recommended Next Step

Run the queries above in the actual application to see:
1. Sample data from each table
2. What other tables reference them
3. What app features use them

Then update the migration script accordingly.
