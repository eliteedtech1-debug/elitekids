'use strict';
/**
 * Q3 Migration: Create the 9 Classroom Collaboration + Parent Intelligence +
 * Teacher AI tables (kids_teams, kids_team_members, kids_team_challenges,
 * kids_peer_teaching, kids_class_quests, kids_insights, kids_action_items,
 * kids_teacher_insights, kids_content_suggestions).
 *
 * Run: node backend/database/q3-collab-parent-teacher-migration.js [--dry-run]
 */
const dbm = () => require('../src/models');

const DRY_RUN = process.argv.includes('--dry-run');

const TABLES = [
  `CREATE TABLE IF NOT EXISTS kids_teams (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    school_id VARCHAR(40) NULL,
    class_id VARCHAR(50) NOT NULL,
    name VARCHAR(120) NOT NULL,
    age_band VARCHAR(20) NULL,
    created_by VARCHAR(50) NULL,
    status ENUM('active','closed') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_teams_class (class_id),
    KEY idx_kids_teams_class_band (class_id, age_band),
    KEY idx_kids_teams_created_by (created_by)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_team_members (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id BIGINT NOT NULL,
    child_admission_no VARCHAR(50) NOT NULL,
    role ENUM('leader','member') NOT NULL DEFAULT 'member',
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_kids_team_members_unique (team_id, child_admission_no),
    KEY idx_kids_team_members_child (child_admission_no),
    KEY idx_kids_team_members_team (team_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_team_challenges (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id BIGINT NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    subject VARCHAR(50) NULL,
    status ENUM('lobby','active','ended','cancelled') NOT NULL DEFAULT 'lobby',
    started_at DATETIME NULL,
    ended_at DATETIME NULL,
    max_questions INT NOT NULL DEFAULT 5,
    current_index INT NOT NULL DEFAULT 0,
    scores JSON NULL,
    created_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_team_challenges_team (team_id),
    KEY idx_kids_team_challenges_team_status (team_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_peer_teaching (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    school_id VARCHAR(40) NULL,
    class_id VARCHAR(50) NULL,
    child_admission_no VARCHAR(50) NOT NULL,
    subject VARCHAR(50) NULL,
    skill_key VARCHAR(100) NULL,
    lesson_id VARCHAR(50) NULL,
    explanation_text TEXT NOT NULL,
    status ENUM('pending','approved','hidden') NOT NULL DEFAULT 'pending',
    helps_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_peer_teaching_class (class_id),
    KEY idx_kids_peer_teaching_subject (subject),
    KEY idx_kids_peer_teaching_author (child_admission_no),
    KEY idx_kids_peer_teaching_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_class_quests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    school_id VARCHAR(40) NULL,
    class_id VARCHAR(50) NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NULL,
    target_metric ENUM('xp','games','points') NOT NULL DEFAULT 'xp',
    target_value INT NOT NULL DEFAULT 100,
    current_value INT NOT NULL DEFAULT 0,
    contributions JSON NULL,
    status ENUM('active','completed','expired') NOT NULL DEFAULT 'active',
    period_start DATE NULL,
    period_end DATE NULL,
    created_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_class_quests_class (class_id),
    KEY idx_kids_class_quests_class_status (class_id, status),
    KEY idx_kids_class_quests_period (period_start, period_end)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_insights (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(50) NOT NULL,
    rule_key VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    severity ENUM('info','low','medium','high') NOT NULL DEFAULT 'info',
    kind ENUM('positive','watch','alert') NOT NULL DEFAULT 'watch',
    meta JSON NULL,
    week_start DATE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_insights_child (child_admission_no),
    KEY idx_kids_insights_child_week (child_admission_no, week_start),
    KEY idx_kids_insights_rule (rule_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_action_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(50) NOT NULL,
    insight_id BIGINT NULL,
    action_text TEXT NOT NULL,
    nudge VARCHAR(120) NULL,
    ack_status ENUM('pending','ack','done') NOT NULL DEFAULT 'pending',
    acked_at DATETIME NULL,
    week_start DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_action_items_child (child_admission_no),
    KEY idx_kids_action_items_child_ack (child_admission_no, ack_status),
    KEY idx_kids_action_items_insight (insight_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_teacher_insights (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    school_id VARCHAR(40) NULL,
    class_id VARCHAR(50) NOT NULL,
    insight_type VARCHAR(50) NOT NULL,
    headline VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    severity ENUM('info','low','medium','high') NOT NULL DEFAULT 'info',
    meta JSON NULL,
    week_start DATE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_teacher_insights_class (class_id),
    KEY idx_kids_teacher_insights_class_week (class_id, week_start),
    KEY idx_kids_teacher_insights_type (insight_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS kids_content_suggestions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    school_id VARCHAR(40) NULL,
    class_id VARCHAR(50) NOT NULL,
    suggestion_type ENUM('gap','assign','review') NOT NULL DEFAULT 'gap',
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    strand VARCHAR(100) NULL,
    lesson_id VARCHAR(50) NULL,
    child_admission_no VARCHAR(50) NULL,
    status ENUM('open','assigned','dismissed') NOT NULL DEFAULT 'open',
    priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
    meta JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_kids_content_suggestions_class (class_id),
    KEY idx_kids_content_suggestions_class_status (class_id, status),
    KEY idx_kids_content_suggestions_type (suggestion_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function run() {
  const { content } = dbm();
  for (const sql of TABLES) {
    if (DRY_RUN) {
      console.log('[DRY RUN]');
      console.log(sql);
      continue;
    }
    await content.query(sql);
    const table = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
    console.log(`✓ ${table} created`);
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
