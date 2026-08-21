'use strict';
/**
 * kids_review_schedule (elite_content) — Spaced repetition scheduling.
 * See Doc 16: Gamification Depth — Spaced Repetition.
 */
module.exports = (sequelize, DataTypes) => {
  const KidReviewSchedule = sequelize.define(
    'KidReviewSchedule',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false },
      item_id: { type: DataTypes.STRING(50), allowNull: false },
      tier: { type: DataTypes.INTEGER, allowNull: false },
      next_review_at: { type: DataTypes.DATE, allowNull: false },
      interval_stage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      last_result: {
        type: DataTypes.ENUM('pass', 'fail'),
        allowNull: true,
      },
    },
    {
      tableName: 'kids_review_schedule',
      indexes: [
        { name: 'kids_review_schedule_student', fields: ['student_id'] },
        { name: 'kids_review_schedule_next_review', fields: ['next_review_at'] },
        { name: 'kids_review_schedule_student_item', fields: ['student_id', 'item_id', 'tier'], unique: true },
      ],
    }
  );
  return KidReviewSchedule;
};
