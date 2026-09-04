'use strict';
/**
 * kids_class_quests (elite_content) — Q3 Classroom Collaboration.
 * Class-wide challenges: whole-class target (e.g. total XP) with per-child
 * contribution tracked. Scored by services/classQuestScoring.js.
 */
module.exports = (sequelize, DataTypes) => {
  const KidClassQuest = sequelize.define(
    'KidClassQuest',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      school_id: { type: DataTypes.STRING(40), allowNull: false },
      class_id: { type: DataTypes.STRING(50), allowNull: false },
      title: { type: DataTypes.STRING(160), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      target_metric: { type: DataTypes.ENUM('xp', 'games', 'points'), allowNull: false, defaultValue: 'xp' },
      target_value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
      current_value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      contributions: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'completed', 'expired'), allowNull: false, defaultValue: 'active' },
      period_start: { type: DataTypes.DATEONLY, allowNull: true },
      period_end: { type: DataTypes.DATEONLY, allowNull: true },
      created_by: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      tableName: 'kids_class_quests',
      indexes: [
        { name: 'kids_class_quests_class', fields: ['class_id'] },
        { name: 'kids_class_quests_class_status', fields: ['class_id', 'status'] },
        { name: 'kids_class_quests_period', fields: ['period_start', 'period_end'] },
      ],
    }
  );
  return KidClassQuest;
};
