'use strict';

/**
 * Hermetic integration-test database for elite-kids-api.
 *
 * Creates `elite_kids_test` on the LOCAL MySQL (root, no password) with the
 * minimal shared-school tables the auth/school routes query (users, parents,
 * students, school_setup, password_reset_tokens) and seeds fixtures.
 *
 * NEVER points at the prod DBs — the app's .env (tunnel/prod) is ignored in
 * tests because setup-env.js sets process.env before the app is imported and
 * dotenv does not override existing env vars.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const TEST_DB = process.env.TEST_DB_NAME || 'elite_kids_test';
const CONFIG = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 3306),
  user: process.env.TEST_DB_USER || 'root',
  password: process.env.TEST_DB_PASSWORD || '',
};

const TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(191) NULL,
  email VARCHAR(191) NULL,
  username VARCHAR(191) NULL,
  password VARCHAR(255) NULL,
  role VARCHAR(50) NULL,
  user_type VARCHAR(50) NULL,
  school_id VARCHAR(20) NULL,
  branch_id VARCHAR(20) NULL,
  status VARCHAR(20) NULL DEFAULT 'active',
  is_activated TINYINT(1) NULL DEFAULT 1,
  first_login_completed TINYINT(1) NULL DEFAULT 1,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parents (
  user_id VARCHAR(50) PRIMARY KEY,
  phone VARCHAR(20) NULL,
  school_id VARCHAR(20) NULL,
  password VARCHAR(255) NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  admission_no VARCHAR(50) PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL,
  branch_id VARCHAR(20) NULL,
  student_name VARCHAR(191) NULL,
  email VARCHAR(191) NULL,
  phone VARCHAR(20) NULL,
  parent_id VARCHAR(50) NULL,
  guardian_id VARCHAR(50) NULL,
  class_code VARCHAR(50) NULL,
  password VARCHAR(255) NULL,
  user_type VARCHAR(50) NULL DEFAULT 'Student',
  status VARCHAR(20) NULL DEFAULT 'Active',
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_setup (
  school_id VARCHAR(20) PRIMARY KEY,
  school_name VARCHAR(500) NULL,
  short_name VARCHAR(20) NULL,
  school_motto VARCHAR(300) NULL,
  badge_url VARCHAR(500) NULL,
  status VARCHAR(20) NULL DEFAULT 'Active',
  kids_stand_alone TINYINT(1) NULL DEFAULT 0,
  nursery_section TINYINT(1) NULL DEFAULT 0,
  cbt_stand_alone TINYINT(1) NULL DEFAULT 0,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NULL,
  user_type VARCHAR(50) NULL,
  contact VARCHAR(255) NULL,
  otp_code VARCHAR(10) NULL,
  school_id VARCHAR(20) NULL,
  expires_at DATETIME NULL,
  used_at DATETIME NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contact_school (contact, school_id)
);

-- Addon tables (elite_content) — mirrored from the Sequelize models so the
-- controllers' model queries work against the hermetic test DB.
CREATE TABLE IF NOT EXISTS kids_children (
  id VARCHAR(50) PRIMARY KEY,
  admission_no VARCHAR(50) NOT NULL,
  school_id VARCHAR(20) NOT NULL,
  branch_id VARCHAR(20) NOT NULL,
  full_name VARCHAR(191) NOT NULL,
  age_level ENUM('Creche','Nursery','KG1','KG2','Primary') NOT NULL DEFAULT 'Nursery',
  class_code VARCHAR(50) NULL,
  avatar_url VARCHAR(500) NULL,
  parent_user_id VARCHAR(50) NULL,
  parent_phone VARCHAR(20) NULL,
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admission_school (admission_no, school_id),
  KEY idx_kids_children_parent (parent_user_id)
);

CREATE TABLE IF NOT EXISTS kids_progress (
  id VARCHAR(50) PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL,
  branch_id VARCHAR(20) NOT NULL,
  child_admission_no VARCHAR(50) NOT NULL,
  lesson_id VARCHAR(50) NOT NULL,
  game_config_id VARCHAR(50) NULL,
  score INT NOT NULL DEFAULT 0,
  stars_earned TINYINT NOT NULL DEFAULT 0,
  xp INT NOT NULL DEFAULT 0,
  completed_at DATETIME NOT NULL,
  idempotency_key VARCHAR(100) NULL,
  difficulty VARCHAR(20) NULL,
  mode VARCHAR(20) NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_kids_progress_child (child_admission_no),
  KEY idx_kids_progress_lesson (lesson_id)
);

CREATE TABLE IF NOT EXISTS kids_lessons (
  id VARCHAR(50) PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL,
  branch_id VARCHAR(20) NOT NULL,
  title VARCHAR(191) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  age_level ENUM('Creche','Nursery','KG1','KG2','Primary') NOT NULL,
  lesson_text TEXT NULL,
  created_by VARCHAR(50) NOT NULL,
  content_state ENUM('generated','pre_screened','pending_human_review','approved','published','recalled') NOT NULL DEFAULT 'generated',
  lesson_type ENUM('game','video','story','song','worksheet') NOT NULL DEFAULT 'game',
  is_global TINYINT(1) NOT NULL DEFAULT 0,
  duration_target_sec INT NULL,
  published_at DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_kids_lessons_school (school_id, branch_id),
  KEY idx_kids_lessons_state (content_state),
  KEY idx_kids_lessons_age (age_level)
);

CREATE TABLE IF NOT EXISTS kids_game_configs (
  id VARCHAR(50) PRIMARY KEY,
  lesson_id VARCHAR(50) NOT NULL,
  template ENUM('matching','tap-recognition','drag-sort','quiz','fill-in-blank','puzzle-split') NOT NULL,
  age_level VARCHAR(20) NOT NULL,
  item_id VARCHAR(50) NULL,
  tier INT NULL,
  category VARCHAR(50) NULL,
  config_json JSON NOT NULL,
  schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
  content_state ENUM('generated','pre_screened','pending_human_review','approved','published','recalled') NOT NULL DEFAULT 'generated',
  model_version VARCHAR(50) NULL,
  created_by VARCHAR(50) NULL,
  approved_by VARCHAR(50) NULL,
  approved_at DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_kids_game_configs_lesson (lesson_id),
  KEY idx_kids_game_configs_state (content_state),
  KEY idx_kids_game_configs_item_id (item_id),
  KEY idx_kids_game_configs_tier (tier),
  KEY idx_kids_game_configs_category (category)
);

CREATE TABLE IF NOT EXISTS kids_mode_locks (
  id BIGINT NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(20) NOT NULL,
  branch_id VARCHAR(20) NOT NULL,
  child_admission_no VARCHAR(50) NOT NULL DEFAULT '*',
  class_code VARCHAR(50) NULL,
  lesson_id VARCHAR(50) NOT NULL,
  locked_mode ENUM('learning','practice','test') NOT NULL,
  locked_by VARCHAR(50) NOT NULL,
  locked_by_role ENUM('teacher','parent') NOT NULL,
  locked_by_name VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mode_lock_child_lesson (child_admission_no, lesson_id),
  UNIQUE KEY uq_mode_lock_class_lesson (class_code, lesson_id, school_id),
  KEY mode_lock_child (child_admission_no),
  KEY mode_lock_class (class_code),
  KEY mode_lock_school (school_id, branch_id)
);

CREATE TABLE IF NOT EXISTS kids_content_approvals (
  id VARCHAR(50) PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL,
  branch_id VARCHAR(20) NOT NULL,
  content_type ENUM('lesson','game_config','scene_script','story','audio') NOT NULL,
  content_id VARCHAR(50) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(50) NULL,
  reviewed_at DATETIME NULL,
  rejection_reason TEXT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_kids_approvals_school (school_id, status),
  KEY idx_kids_approvals_content (content_type, content_id)
);

CREATE TABLE IF NOT EXISTS kids_generation_jobs (
  id VARCHAR(50) PRIMARY KEY,
  lesson_id VARCHAR(50) NOT NULL,
  content_type ENUM('game_config','scene_script','story','audio') NOT NULL,
  template VARCHAR(30) NULL,
  status ENUM('queued','running','succeeded','failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  error TEXT NULL,
  model_version VARCHAR(50) NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_kids_generation_lesson (lesson_id),
  KEY idx_kids_generation_status (status)
);

CREATE TABLE IF NOT EXISTS kids_scene_scripts (
  id VARCHAR(50) PRIMARY KEY,
  lesson_id VARCHAR(50) NOT NULL,
  scene_type VARCHAR(30) NULL,
  script_json JSON NOT NULL,
  schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
  content_state ENUM('generated','pre_screened','pending_human_review','approved','published','recalled') NOT NULL DEFAULT 'generated',
  model_version VARCHAR(50) NULL,
  created_by VARCHAR(50) NULL,
  approved_by VARCHAR(50) NULL,
  approved_at DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_scene_scripts_lesson (lesson_id),
  KEY kids_scene_scripts_state (content_state)
);

CREATE TABLE IF NOT EXISTS kids_prescreen_log (
  id VARCHAR(50) PRIMARY KEY,
  content_type VARCHAR(30) NOT NULL,
  content_id VARCHAR(50) NOT NULL,
  age_appropriate TINYINT NULL,
  safe TINYINT NULL,
  curriculum_aligned TINYINT NULL,
  score DECIMAL(5,2) NULL,
  passed TINYINT NULL,
  classifier_version VARCHAR(50) NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  KEY kids_prescreen_content (content_type, content_id)
);

CREATE TABLE IF NOT EXISTS kids_denylist_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  added_by VARCHAR(50) NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kids_content_generation_audit (
  id VARCHAR(50) PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL,
  content_type VARCHAR(30) NOT NULL,
  content_id VARCHAR(50) NOT NULL,
  prompt TEXT NOT NULL,
  model_provider VARCHAR(50) NOT NULL,
  model_version VARCHAR(50) NOT NULL,
  raw_output MEDIUMTEXT NULL,
  classifier_score DECIMAL(5,2) NULL,
  classifier_passed TINYINT(1) NULL,
  denylist_result VARCHAR(20) NULL,
  reviewer_id VARCHAR(50) NULL,
  approved_at DATETIME NULL,
  published_at DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  KEY kids_audit_school_created (school_id, createdAt),
  KEY kids_audit_content (content_id)
);

CREATE TABLE IF NOT EXISTS kids_game_series (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NULL,
  created_by VARCHAR(50) NULL,
  subject_code VARCHAR(50) NULL,
  term_hint VARCHAR(20) NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_game_series_category (category)
);

CREATE TABLE IF NOT EXISTS kids_game_units (
  id VARCHAR(50) PRIMARY KEY,
  series_id VARCHAR(50) NOT NULL,
  unit_number INT NOT NULL,
  prerequisite_unit_id VARCHAR(50) NULL,
  content_items JSON NOT NULL,
  title VARCHAR(255) NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_game_units_series (series_id),
  UNIQUE KEY kids_game_units_series_number (series_id, unit_number)
);

CREATE TABLE IF NOT EXISTS kids_curriculum_points (
  id VARCHAR(50) PRIMARY KEY,
  curriculum_source VARCHAR(255) NULL,
  age_band VARCHAR(20) NOT NULL,
  learning_objective TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  mapped_item_ids JSON NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_curriculum_points_age_band (age_band)
);

CREATE TABLE IF NOT EXISTS kids_library_games (
  id VARCHAR(50) PRIMARY KEY,
  curriculum_point_id VARCHAR(50) NULL,
  game_config_id VARCHAR(50) NOT NULL,
  ece_validated TINYINT(1) NOT NULL DEFAULT 0,
  validated_by VARCHAR(50) NULL,
  validated_at DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_library_games_config (game_config_id)
);

CREATE TABLE IF NOT EXISTS kids_class_game_variants (
  id VARCHAR(50) PRIMARY KEY,
  library_game_id VARCHAR(50) NULL,
  teacher_id VARCHAR(50) NOT NULL,
  class_id VARCHAR(50) NOT NULL,
  customizations JSON NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_class_game_variants_class (class_id)
);

CREATE TABLE IF NOT EXISTS kids_game_item_responses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  item_id VARCHAR(50) NOT NULL,
  tier INT NOT NULL,
  distractor_count INT NOT NULL,
  response_time_ms INT NOT NULL,
  mode ENUM('learning','practice','test') NOT NULL,
  correct TINYINT(1) NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_game_item_responses_student (student_id),
  KEY kids_game_item_responses_item (item_id),
  KEY kids_game_item_responses_student_item (student_id, item_id)
);

CREATE TABLE IF NOT EXISTS kids_engagement_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(50) NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NULL,
  drop_off_point VARCHAR(100) NULL,
  content_format_breakdown JSON NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_engagement_snapshots_student (student_id),
  KEY kids_engagement_snapshots_session (session_id)
);

CREATE TABLE IF NOT EXISTS kids_mastery_progress (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  item_id VARCHAR(50) NOT NULL,
  tier INT NOT NULL,
  attempts_to_mastery INT NOT NULL DEFAULT 0,
  last_regression_flag_at DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY kids_mastery_progress_student_item (student_id, item_id, tier)
);

CREATE TABLE IF NOT EXISTS kids_test_attempts (
  id VARCHAR(50) PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  item_id VARCHAR(50) NOT NULL,
  tier INT NOT NULL,
  result ENUM('pass','fail') NOT NULL,
  attempt_number INT NOT NULL,
  routed_to ENUM('retest','practice','teacher_flag') NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY kids_test_attempts_student (student_id),
  KEY kids_test_attempts_item (item_id),
  KEY kids_test_attempts_student_item (student_id, item_id)
);

CREATE TABLE IF NOT EXISTS kids_review_schedule (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  item_id VARCHAR(50) NOT NULL,
  tier INT NOT NULL,
  next_review_at DATETIME NOT NULL,
  interval_stage INT NOT NULL DEFAULT 1,
  last_result ENUM('pass','fail') NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY kids_review_schedule_student_item (student_id, item_id, tier)
);

CREATE TABLE IF NOT EXISTS kids_interface_onboarding (
  id VARCHAR(50) PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  completed_at DATETIME NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY kids_interface_onboarding_student (student_id)
);

CREATE TABLE IF NOT EXISTS kids_garden_state (
  id VARCHAR(50) PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  garden_elements JSON NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY kids_garden_state_student (student_id)
);

CREATE TABLE IF NOT EXISTS kids_companion_state (
  id VARCHAR(50) PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  companion_type VARCHAR(50) NOT NULL,
  customization JSON NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY kids_companion_state_student (student_id)
);

CREATE TABLE IF NOT EXISTS kids_session_state (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(50) NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  current_item_id VARCHAR(50) NOT NULL,
  current_tier INT NOT NULL,
  saved_state JSON NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY kids_session_state_student_session (student_id, session_id)
);

CREATE TABLE IF NOT EXISTS kids_parental_controls (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  daily_play_limit_minutes INT NOT NULL DEFAULT 30,
  allowed_time_start TIME NULL,
  allowed_time_end TIME NULL,
  set_by VARCHAR(50) NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY kids_parental_controls_student (student_id)
);
`;

async function ensureTestDb() {
  const conn = await mysql.createConnection(CONFIG);
  try {
    // Full rebuild each run — the DB is throwaway, so schema always matches
    // the DDL below even when the table layout changed between commits
    // (CREATE TABLE IF NOT EXISTS would silently keep a stale schema).
    await conn.query('DROP DATABASE IF EXISTS `' + TEST_DB + '`');
    await conn.query('CREATE DATABASE `' + TEST_DB + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await conn.query('USE `' + TEST_DB + '`');

    // Tables
    const statements = TABLES.split(';').map((s) => s.trim()).filter(Boolean);
    for (const sql of statements) await conn.query(sql);

    // Reset data between runs
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['users', 'parents', 'students', 'school_setup', 'password_reset_tokens', 'kids_children', 'kids_progress', 'kids_lessons', 'kids_game_configs', 'kids_mode_locks', 'kids_content_approvals', 'kids_generation_jobs', 'kids_scene_scripts', 'kids_prescreen_log', 'kids_denylist_rules', 'kids_content_generation_audit', 'kids_game_series', 'kids_game_units', 'kids_curriculum_points', 'kids_library_games', 'kids_class_game_variants', 'kids_game_item_responses', 'kids_engagement_snapshots', 'kids_mastery_progress', 'kids_test_attempts', 'kids_review_schedule', 'kids_interface_onboarding', 'kids_garden_state', 'kids_companion_state', 'kids_session_state', 'kids_parental_controls']) {
      await conn.query('TRUNCATE TABLE `' + t + '`');
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ── Fixtures ──────────────────────────────────────────────────────────
    const h = (pw) => bcrypt.hashSync(pw, 10);

    // Schools
    await conn.query(
      `INSERT INTO school_setup (school_id, school_name, short_name, school_motto, badge_url, status, kids_stand_alone, nursery_section, cbt_stand_alone) VALUES
       ('SCH-KIDS',  'Elite Kids Academy', 'kids',     'Learn, play and grow.', NULL,            'Active', 1, 1, 1),
       ('SCH-TEST',  'Test Kids Academy',  'testkids', 'Test motto',           'http://cdn.test/badge.png', 'Active', 1, 1, 0),
       ('SCH-NOKIDS','No Kids Academy',    'nokids',   NULL,                   NULL,            'Active', 0, 1, 0),
       ('SCH-INACTIVE','Inactive School',  'inactivesch', NULL,                NULL,            'Inactive', 1, 1, 0)`
    );

    // Users (admin, parent, other parent, inactive, superadmin, multi-school pair)
    await conn.query(
      `INSERT INTO users (id, name, email, username, password, role, user_type, school_id, branch_id, status, is_activated) VALUES
       ('U1',  'Test Admin',      'admin@kids.test',   'admin',       ?, 'Admin',      'Admin',      'SCH-TEST', 'BR-TEST', 'active', 1),
       ('U2',  'Test Parent',     'parent@kids.test',  'parent',      ?, 'Parent',     'Parent',     'SCH-TEST', 'BR-TEST', 'active', 1),
       ('U3',  'Inactive Teacher','inactive@kids.test','inactive',    ?, 'Teacher',    'Teacher',    'SCH-TEST', 'BR-TEST', 'inactive', 1),
       ('U4',  'Super Admin',     'super@kids.test',   'superadmin',  ?, 'superadmin', 'superadmin', NULL, NULL, 'active', 1),
       ('U5A', 'Multi Admin',     'multi@kids.test',   'multi',       ?, 'Admin',      'Admin',      'SCH-TEST', 'BR-TEST', 'active', 1),
       ('U5B', 'Multi Admin',     'multi@kids.test',   'multi',       ?, 'Admin',      'Admin',      'SCH-KIDS', 'BR-KIDS', 'active', 1),
       ('U6',  'Other Parent',    'other@kids.test',   'other',       ?, 'Parent',     'Parent',     'SCH-TEST', 'BR-TEST', 'active', 1)`,
      [h('Admin@123'), h('Parent@123'), h('Pass@123'), h('Super@123'), h('Multi@123'), h('Multi@123'), h('Other@123')]
    );

    // Parent link (login via parents table using email from users + phone)
    await conn.query(
      `INSERT INTO parents (user_id, phone, school_id, password) VALUES
       ('U2', '08012345678', 'SCH-TEST', ?),
       ('U6', '08099999999', 'SCH-TEST', ?)`,
      [h('Parent@123'), h('Other@123')]
    );

    // Students — tablet login + parent-ownership fixtures for child linking.
    await conn.query(
      `INSERT INTO students (admission_no, school_id, branch_id, student_name, email, phone, parent_id, guardian_id, class_code, password, user_type, status) VALUES
       ('NUR-001', 'SCH-TEST', 'BR-TEST', 'Ada Obi',   'ada@kids.test',  '08012345678', 'U2',  NULL,  'NUR-A', ?, 'Student', 'Active'),
       ('NUR-002', 'SCH-TEST', 'BR-TEST', 'Bola Yusuf', 'bola@kids.test', NULL,          'U2',  NULL,  'NUR-A', ?, 'Student', 'Active'),
       ('NUR-003', 'SCH-TEST', 'BR-TEST', 'Chidi Eze', 'chidi@kids.test', '08111111111', 'U99', NULL,  'NUR-B', ?, 'Student', 'Active'),
       ('NUR-004', 'SCH-TEST', 'BR-TEST', 'Dami Ayo',  'dami@kids.test',  NULL,          NULL,  NULL,  'NUR-B', ?, 'Student', 'Active'),
       ('NUR-005', 'SCH-TEST', 'BR-TEST', 'Emeka Obi', 'emeka@kids.test', '08012345678', 'U2',  NULL,  'NUR-A', ?, 'Student', 'Active'),
       ('NUR-006', 'SCH-TEST', 'BR-TEST', 'Fatima Lawal', 'fatima@kids.test', NULL,      'U2',  NULL,  'NUR-B', ?, 'Student', 'Active')`,
      [h('Nursery@123'), h('Nursery@123'), h('Nursery@123'), h('Nursery@123'), h('Nursery@123'), h('Nursery@123')]
    );

    // kids_children profiles (linked to the students above by admission_no).
    await conn.query(
      `INSERT INTO kids_children (id, admission_no, school_id, branch_id, full_name, age_level, class_code, parent_user_id, parent_phone, status) VALUES
       ('CHILD-A', 'NUR-001', 'SCH-TEST', 'BR-TEST', 'Ada Obi',    'Nursery', 'NUR-A', 'U2', '08012345678', 'Active'),
       ('CHILD-B', 'NUR-002', 'SCH-TEST', 'BR-TEST', 'Bola Yusuf', 'KG1',     'NUR-A', NULL, NULL,          'Active'),
       ('CHILD-C', 'NUR-005', 'SCH-TEST', 'BR-TEST', 'Emeka Obi',  'Nursery', 'NUR-A', NULL, NULL,          'Active')`
    );

    // Lessons — published + generated (the child-facing gate checks content_state).
    await conn.query(
      `INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, created_by, content_state, lesson_type, published_at) VALUES
       ('LESSON-1', 'SCH-TEST', 'BR-TEST', 'Colors Lesson',  'Art',   'Nursery', 'U1', 'published', 'game', NOW()),
       ('LESSON-2', 'SCH-TEST', 'BR-TEST', 'Shapes Lesson',  'Math',  'Nursery', 'U1', 'generated', 'game', NULL),
       ('LESSON-3', 'SCH-KIDS', 'BR-KIDS', 'ABC Song',       'Music', 'Nursery', 'U1', 'published', 'song', NOW())`
    );

    // Game configs — LESSON-1 has a published matching config (child-facing).
    await conn.query(
      `INSERT INTO kids_game_configs (id, lesson_id, template, age_level, config_json, content_state, created_by) VALUES
       ('GAME-1', 'LESSON-1', 'matching', 'Nursery', ?, 'published', 'U1'),
       ('GAME-2', 'LESSON-2', 'quiz',     'Nursery', ?, 'generated', 'U1')`,
      [
        JSON.stringify({ title: 'Match the Colors', pairs: [{ left: 'Red', right: '🔴' }, { left: 'Blue', right: '🔵' }] }),
        JSON.stringify({ title: 'Shapes Quiz', questions: [{ q: 'What is a circle?', options: ['Round', 'Square'] }] }),
      ]
    );

    // One progress row for NUR-001 (exercises getChild's summary).
    await conn.query(
      `INSERT INTO kids_progress (id, school_id, branch_id, child_admission_no, lesson_id, score, stars_earned, xp, completed_at) VALUES
       ('PROG-1', 'SCH-TEST', 'BR-TEST', 'NUR-001', 'LESSON-1', 80, 3, 10, NOW())`
    );

    // Content approval — pending review for LESSON-2.
    await conn.query(
      `INSERT INTO kids_content_approvals (id, school_id, branch_id, content_type, content_id, status) VALUES
       ('APPR-1', 'SCH-TEST', 'BR-TEST', 'lesson', 'LESSON-2', 'pending'),
       ('APPR-2', 'SCH-TEST', 'BR-TEST', 'game_config', 'GAME-2', 'pending'),
       ('APPR-3', 'SCH-TEST', 'BR-TEST', 'game_config', 'GAME-2', 'pending')`
    );

    // Scene scripts — LESSON-1 has 2 published scenes (child-facing).
    await conn.query(
      `INSERT INTO kids_scene_scripts (id, lesson_id, scene_type, script_json, schema_version, content_state, created_by) VALUES
       ('SCENE-1', 'LESSON-1', 'teach', ?, '1.0', 'published', 'U1'),
       ('SCENE-2', 'LESSON-1', 'reinforce', ?, '1.0', 'published', 'U1'),
       ('SCENE-3', 'LESSON-2', 'teach', ?, '1.0', 'generated', 'U1')`,
      [
        JSON.stringify({ sceneId: 's1', lessonId: 'LESSON-1', background: 'classroom', narrationText: 'Let us learn about colors!', durationSec: 12, sceneType: 'teach' }),
        JSON.stringify({ sceneId: 's2', lessonId: 'LESSON-1', background: 'playground', narrationText: 'Can you name the colors?', durationSec: 10, sceneType: 'reinforce' }),
        JSON.stringify({ sceneId: 's3', lessonId: 'LESSON-2', background: 'classroom', narrationText: 'Shapes are everywhere!', durationSec: 15, sceneType: 'teach' }),
      ]
    );

    // Generation job — LESSON-2 has a queued job.
    await conn.query(
      `INSERT INTO kids_generation_jobs (id, lesson_id, content_type, template, status, model_version) VALUES
       ('JOB-1', 'LESSON-2', 'game_config', 'matching', 'queued', 'gemini-2.5-flash'),
       ('JOB-2', 'LESSON-2', 'scene_script', NULL, 'succeeded', 'gemini-2.5-flash')`
    );

    // Game configs with item_id/tier/category (Phase 1 denormalized columns)
    await conn.query(
      `UPDATE kids_game_configs SET item_id='cat-01', tier=0, category='Animals' WHERE id='GAME-1'`
    );
    await conn.query(
      `INSERT INTO kids_game_configs (id, lesson_id, template, age_level, item_id, tier, category, config_json, content_state, created_by) VALUES
       ('GAME-1-T1', 'LESSON-1', 'matching', 'Nursery', 'cat-01', 1, 'Animals', ?, 'published', 'U1')`,
      [JSON.stringify({ title: 'Cat Recognition', pairs: [{ left: 'Cat', right: '🐱' }, { left: 'Dog', right: '🐶' }] })]
    );
    await conn.query(
      `INSERT INTO kids_game_configs (id, lesson_id, template, age_level, item_id, tier, category, config_json, content_state, created_by) VALUES
       ('GAME-1-T2', 'LESSON-1', 'matching', 'Nursery', 'cat-01', 2, 'Animals', ?, 'published', 'U1')`,
      [JSON.stringify({ title: 'Cat Sound Match', pairs: [{ left: 'Meow', right: '🐱' }, { left: 'Woof', right: '🐶' }] })]
    );

    // Game Series
    await conn.query(
      `INSERT INTO kids_game_series (id, name, category, description, created_by) VALUES
       ('SERIES-1', 'Animal Friends', 'Animals', 'Learn about animals', 'U1'),
       ('SERIES-2', 'Letter Sounds', 'Letters', 'Learn letter sounds', 'U1')`
    );

    // Game Units
    await conn.query(
      `INSERT INTO kids_game_units (id, series_id, unit_number, prerequisite_unit_id, content_items, title) VALUES
       ('UNIT-1', 'SERIES-1', 1, NULL, ?, 'Domestic Animals'),
       ('UNIT-2', 'SERIES-1', 2, 'UNIT-1', ?, 'Wild Animals'),
       ('UNIT-3', 'SERIES-2', 1, NULL, ?, 'Letter A-C')`,
      [
        JSON.stringify([
          { item_id: 'cat-01', tier: 0, lesson_id: 'lesson-unit1-cat' },
          { item_id: 'dog-01', tier: 0, lesson_id: 'lesson-unit1-dog' },
        ]),
        JSON.stringify([{ item_id: 'lion-01', tier: 0 }]),
        JSON.stringify([{ item_id: 'letter-a', tier: 0 }]),
      ]
    );

    // Curriculum Points
    await conn.query(
      `INSERT INTO kids_curriculum_points (id, curriculum_source, age_band, learning_objective, category, mapped_item_ids) VALUES
       ('CP-1', 'Nigerian ECE', 'Nursery', 'Recognizes common domestic animals', 'Animals', ?),
       ('CP-2', 'Nigerian ECE', 'KG1', 'Identifies uppercase letters A-C', 'Letters', ?)`,
      [
        JSON.stringify(['cat-01', 'dog-01']),
        JSON.stringify(['letter-a', 'letter-b', 'letter-c']),
      ]
    );

    // Library Games
    await conn.query(
      `INSERT INTO kids_library_games (id, curriculum_point_id, game_config_id, ece_validated, validated_by, validated_at) VALUES
       ('LIB-1', 'CP-1', 'GAME-1', 1, 'U1', NOW()),
       ('LIB-2', 'CP-2', 'GAME-1-T1', 0, NULL, NULL)`
    );

    // Class Game Variants
    await conn.query(
      `INSERT INTO kids_class_game_variants (id, library_game_id, teacher_id, class_id, customizations) VALUES
       ('VAR-1', 'LIB-1', 'U1', 'NUR-A', ?)`,
      [JSON.stringify({ assigned: true, customizations: {} })]
    );

    // Interface Onboarding
    await conn.query(
      `INSERT INTO kids_interface_onboarding (id, student_id, completed_at) VALUES
       (1, 'NUR-001', NOW())`
    );

    // Test Attempts
    await conn.query(
      `INSERT INTO kids_test_attempts (id, student_id, item_id, tier, result, attempt_number, routed_to) VALUES
       (1, 'NUR-001', 'cat-01', 0, 'fail', 1, 'practice'),
       (2, 'NUR-001', 'cat-01', 0, 'fail', 2, 'practice'),
       (3, 'NUR-001', 'cat-01', 0, 'fail', 3, 'teacher_flag')`
    );

    // Engagement Snapshots
    await conn.query(
      `INSERT INTO kids_engagement_snapshots (id, session_id, student_id, start_time, end_time) VALUES
       (1, 'SESS-1', 'NUR-001', DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
       (2, 'SESS-2', 'NUR-001', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 90 MINUTE))`
    );

    // Parental Controls
    await conn.query(
      `INSERT INTO kids_parental_controls (id, student_id, daily_play_limit_minutes, allowed_time_start, allowed_time_end, set_by) VALUES
       (1, 'NUR-001', 45, '08:00:00', '18:00:00', 'U2')`
    );

    // Garden State
    await conn.query(
      `INSERT INTO kids_garden_state (id, student_id, garden_elements) VALUES
       (1, 'NUR-001', ?)`,
      [JSON.stringify([{ type: 'plot', label: 'My Garden', planted: true }])]
    );

    return { db: TEST_DB, ok: true };
  } finally {
    await conn.end();
  }
}

/** Direct query helper for tests (e.g. reading the OTP the API wrote). */
async function testQuery(sql, params) {
  const conn = await mysql.createConnection({ ...CONFIG, database: TEST_DB });
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

module.exports = { ensureTestDb, testQuery, TEST_DB };
