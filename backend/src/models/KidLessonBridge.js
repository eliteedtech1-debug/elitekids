'use strict';

/**
 * kids_lesson_bridges (elite_kids) — the professional planning bridge between
 * one reviewed outcome, one weekly lesson and its game/evidence plan.
 *
 * JSON fields are intentionally flexible at this MVP boundary: the controller
 * owns the field-level contract while the table remains additive and safe for
 * existing installations.
 */
module.exports = (sequelize, DataTypes) => {
  const KidLessonBridge = sequelize.define(
    'KidLessonBridge',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      lesson_id: { type: DataTypes.STRING(50), allowNull: false },
      outcome_id: { type: DataTypes.STRING(50), allowNull: false },
      school_id: { type: DataTypes.STRING(40), allowNull: false },
      branch_id: { type: DataTypes.STRING(40), allowNull: true },
      // Institutional identity is copied as a small audit snapshot. For
      // non-flagship schools it is resolved from EliteSMS, never trusted from
      // the browser; nullable additions preserve existing flagship records.
      class_code: { type: DataTypes.STRING(100), allowNull: true },
      class_label: { type: DataTypes.STRING(100), allowNull: false },
      age_band: { type: DataTypes.STRING(40), allowNull: false },
      academic_year: { type: DataTypes.STRING(20), allowNull: true },
      term_name: { type: DataTypes.STRING(20), allowNull: false },
      week_number: { type: DataTypes.INTEGER, allowNull: false },
      subject_id: { type: DataTypes.STRING(100), allowNull: false },
      subject_code: { type: DataTypes.STRING(100), allowNull: true },
      sms_lesson_id: { type: DataTypes.STRING(50), allowNull: true },
      context_source: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'flagship-local' },
      context_version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'flagship-local-v1' },
      context_snapshot: { type: DataTypes.JSON, allowNull: true },
      strand: { type: DataTypes.STRING(100), allowNull: true },
      sub_strand: { type: DataTypes.STRING(100), allowNull: true },
      objective: { type: DataTypes.TEXT, allowNull: false },
      micro_objectives: { type: DataTypes.JSON, allowNull: false },
      success_evidence: { type: DataTypes.JSON, allowNull: false },
      evidence_routes: { type: DataTypes.JSON, allowNull: false },
      previous_experience: { type: DataTypes.TEXT, allowNull: true },
      concrete_experience: { type: DataTypes.TEXT, allowNull: false },
      guided_play: { type: DataTypes.JSON, allowNull: true },
      transfer_activity: { type: DataTypes.TEXT, allowNull: true },
      differentiation: { type: DataTypes.JSON, allowNull: true },
      vocabulary: { type: DataTypes.JSON, allowNull: true },
      home_connection: { type: DataTypes.TEXT, allowNull: true },
      assessment_plan: { type: DataTypes.JSON, allowNull: false },
      follow_up_type: { type: DataTypes.STRING(40), allowNull: true },
      reinforcement_of: { type: DataTypes.JSON, allowNull: true },
      representation_sequence: { type: DataTypes.JSON, allowNull: true },
      grouping: { type: DataTypes.JSON, allowNull: true, field: 'grouping' },
      item_range: { type: DataTypes.STRING(100), allowNull: true },
      game_plan: { type: DataTypes.JSON, allowNull: false },
      scene_plan: { type: DataTypes.JSON, allowNull: true },
      status: {
        type: DataTypes.ENUM('draft', 'ready_for_review', 'approved', 'published', 'recalled'),
        allowNull: false,
        defaultValue: 'draft',
      },
      created_by: { type: DataTypes.STRING(50), allowNull: false },
      approved_by: { type: DataTypes.STRING(50), allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'kids_lesson_bridges',
      indexes: [
        { name: 'kids_lesson_bridges_lesson', fields: ['lesson_id'] },
        { name: 'kids_lesson_bridges_school', fields: ['school_id', 'branch_id'] },
        { name: 'kids_lesson_bridges_cell', fields: ['school_id', 'class_label', 'term_name', 'week_number', 'subject_id'] },
        { name: 'kids_lesson_bridges_context', fields: ['school_id', 'class_code', 'academic_year', 'term_name', 'week_number', 'subject_code'] },
        { name: 'kids_lesson_bridges_outcome', fields: ['outcome_id'] },
        { name: 'kids_lesson_bridges_status', fields: ['status'] },
      ],
    }
  );
  return KidLessonBridge;
};
