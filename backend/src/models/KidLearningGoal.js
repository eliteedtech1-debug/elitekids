'use strict';
/**
 * kids_learning_goals (elite_content) — weekly learning goals (G7).
 * One active row per (child, goal_type, week). Rollover is computed on read
 * (period math), no cron needed. Lazy auto-init default: 1 target/week.
 */
module.exports = (sequelize, DataTypes) => {
  const KidLearningGoal = sequelize.define(
    'KidLearningGoal',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      child_admission_no: { type: DataTypes.STRING(50), allowNull: false },
      goal_type: { type: DataTypes.ENUM('weekly'), allowNull: false, defaultValue: 'weekly' },
      target_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      period_start: { type: DataTypes.DATEONLY, allowNull: false },
      period_end: { type: DataTypes.DATEONLY, allowNull: false },
      set_by: { type: DataTypes.ENUM('child', 'teacher', 'auto'), allowNull: false, defaultValue: 'auto' },
      status: { type: DataTypes.ENUM('active', 'done', 'expired'), allowNull: false, defaultValue: 'active' },
    },
    {
      tableName: 'kids_learning_goals',
      indexes: [
        {
          name: 'uq_kids_learning_goals_period',
          unique: true,
          fields: ['child_admission_no', 'goal_type', 'period_start'],
        },
        { name: 'kids_learning_goals_child', fields: ['child_admission_no'] },
      ],
    }
  );
  return KidLearningGoal;
};
