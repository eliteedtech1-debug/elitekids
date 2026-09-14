'use strict';

/**
 * kids_teacher_observations (elite_kids) — dated, neutral professional
 * evidence. This is separate from game scores and may be recorded without
 * digital play. Private notes are never sent to child-facing routes.
 */
module.exports = (sequelize, DataTypes) => {
  const KidTeacherObservation = sequelize.define(
    'KidTeacherObservation',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      child_admission_no: { type: DataTypes.STRING(64), allowNull: false },
      lesson_bridge_id: { type: DataTypes.STRING(50), allowNull: false },
      lesson_id: { type: DataTypes.STRING(50), allowNull: false },
      outcome_id: { type: DataTypes.STRING(50), allowNull: false },
      school_id: { type: DataTypes.STRING(40), allowNull: false },
      class_id: { type: DataTypes.STRING(100), allowNull: true },
      observer_id: { type: DataTypes.STRING(50), allowNull: false },
      observation_level: {
        type: DataTypes.ENUM('independent', 'with_prompt', 'emerging', 'not_yet_observed', 'not_applicable'),
        allowNull: false,
      },
      response_route: {
        type: DataTypes.ENUM('point', 'gesture', 'movement', 'speech', 'home_language', 'sign', 'AAC', 'drawing', 'mark-making', 'mixed'),
        allowNull: false,
      },
      prompt_level: {
        type: DataTypes.ENUM('none', 'model', 'gesture', 'verbal_clue', 'two_choices', 'full_support'),
        allowNull: false,
      },
      context: { type: DataTypes.STRING(120), allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      next_step: { type: DataTypes.TEXT, allowNull: false },
      work_sample_ref: { type: DataTypes.STRING(255), allowNull: true },
      observed_at: { type: DataTypes.DATE, allowNull: false },
      idempotency_key: { type: DataTypes.STRING(100), allowNull: true },
    },
    {
      tableName: 'kids_teacher_observations',
      indexes: [
        { name: 'kids_teacher_observations_child', fields: ['child_admission_no', 'observed_at'] },
        { name: 'kids_teacher_observations_bridge', fields: ['lesson_bridge_id', 'observed_at'] },
        { name: 'kids_teacher_observations_school', fields: ['school_id', 'observed_at'] },
        { name: 'kids_teacher_observations_idempotency', fields: ['observer_id', 'idempotency_key'], unique: true },
      ],
    }
  );
  return KidTeacherObservation;
};
