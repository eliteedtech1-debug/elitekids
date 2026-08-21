'use strict';
/**
 * kids_parental_controls (elite_content) — Parental limits for play time.
 * See Doc 17: Engagement & Accessibility Layer — Parental Controls.
 */
module.exports = (sequelize, DataTypes) => {
  const KidParentalControl = sequelize.define(
    'KidParentalControl',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      daily_play_limit_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      allowed_time_start: { type: DataTypes.TIME, allowNull: true },
      allowed_time_end: { type: DataTypes.TIME, allowNull: true },
      set_by: { type: DataTypes.STRING(50), allowNull: false },
    },
    {
      tableName: 'kids_parental_controls',
      indexes: [
        { name: 'kids_parental_controls_student', fields: ['student_id'], unique: true },
      ],
    }
  );
  return KidParentalControl;
};
