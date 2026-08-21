'use strict';
/**
 * kids_mastery_progress (elite_content) — Mastery tracking per item/tier.
 * See Doc 14: Pattern Tracking & Parent/Teacher Insights — Mastery & progress signals.
 */
module.exports = (sequelize, DataTypes) => {
  const KidMasteryProgress = sequelize.define(
    'KidMasteryProgress',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false },
      category: { type: DataTypes.STRING(50), allowNull: false },
      item_id: { type: DataTypes.STRING(50), allowNull: false },
      tier: { type: DataTypes.INTEGER, allowNull: false },
      attempts_to_mastery: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_regression_flag_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'kids_mastery_progress',
      indexes: [
        { name: 'kids_mastery_progress_student', fields: ['student_id'] },
        { name: 'kids_mastery_progress_category', fields: ['category'] },
        { name: 'kids_mastery_progress_student_item', fields: ['student_id', 'item_id', 'tier'], unique: true },
      ],
    }
  );
  return KidMasteryProgress;
};
