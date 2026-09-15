'use strict';
/**
 * kids_checkpoint_exams (KIDS_DB_NAME) — one "test out / jump ahead" attempt.
 *
 * A child who is blocked by the cumulative E3f unit chain may sit ONE assessment
 * that covers every unfinished unit the series still has up to their age band
 * ceiling (see team-docs/reports/jump-ahead-checkpoint-2026-09-15.md). Passing it
 * is not enough on its own: a teacher/admin confirms the unlock, so `status`
 * walks issued → submitted → approved | rejected.
 *
 * `questions` holds the issued set INCLUDING the answer key (`correctId`) and is
 * therefore never returned raw to a child — `kidsCheckpoints.publicExam()` strips
 * the key before the response. Grading always happens against this stored set,
 * never against the child's copy, so a replayed payload cannot re-grade itself.
 *
 * Why a NEW mode instead of reusing kids_progress mode='test':
 *   the completion rule is `mode === 'test' && score >= 50`, so a `checkpoint`
 *   row deliberately does NOT satisfy it — an approved jump-ahead is recorded as
 *   exempt ('tested out'), never as mastery of content the child never played.
 *
 * Schema is owned by database/kids-checkpoint-exams-migration.js and is
 * intentionally absent from KIDS_CONTENT_TABLES: the running service never runs
 * this DDL, the migration is run on its own.
 */
module.exports = (sequelize, DataTypes) => {
  const KidCheckpointExam = sequelize.define(
    'KidCheckpointExam',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      school_id: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      branch_id: { type: DataTypes.STRING(40), allowNull: true },
      child_admission_no: { type: DataTypes.STRING(64), allowNull: false },
      series_id: { type: DataTypes.STRING(50), allowNull: false },
      // Age band the chain was computed against, so a band change cannot make an
      // old assessment silently unlock a wider (or narrower) chain.
      band: { type: DataTypes.STRING(30), allowNull: true },
      // The unfinished units being tested out, in path order.
      unit_ids: { type: DataTypes.JSON, allowNull: false },
      // Issued question set WITH the answer key — server-side only.
      questions: { type: DataTypes.JSON, allowNull: false },
      answers: { type: DataTypes.JSON, allowNull: true },
      score_pct: { type: DataTypes.INTEGER, allowNull: true },
      // { [unit_id]: { asked, correct } } — drives the per-unit coverage rule.
      per_unit: { type: DataTypes.JSON, allowNull: true },
      // issued | submitted | approved | rejected
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'issued' },
      // True when the self-paced flagship exception confirmed this instead of a
      // human (see services/selfPacedSchools.js) — kept explicit so the audit
      // trail never reads as a teacher approval that did not happen.
      self_approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      requested_by: { type: DataTypes.STRING(64), allowNull: true },
      submitted_at: { type: DataTypes.DATE, allowNull: true },
      decided_by: { type: DataTypes.STRING(64), allowNull: true },
      decided_at: { type: DataTypes.DATE, allowNull: true },
      decision_note: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'kids_checkpoint_exams',
      indexes: [
        { name: 'kids_checkpoint_exams_child', fields: ['child_admission_no'] },
        { name: 'kids_checkpoint_exams_status', fields: ['status'] },
        { name: 'kids_checkpoint_exams_child_series', fields: ['child_admission_no', 'series_id'] },
      ],
    }
  );
  return KidCheckpointExam;
};
