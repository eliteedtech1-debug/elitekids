'use strict';
/**
 * kids_insights (elite_content) — Q3 Parent Intelligence.
 * Deterministic rule-generated insights per child per week (see
 * services/insightGenerator.js — 8 seed rules). Never cross-child.
 */
module.exports = (sequelize, DataTypes) => {
  const KidInsight = sequelize.define(
    'KidInsight',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      child_admission_no: { type: DataTypes.STRING(50), allowNull: false },
      rule_key: { type: DataTypes.STRING(50), allowNull: false },
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      severity: { type: DataTypes.ENUM('info', 'low', 'medium', 'high'), allowNull: false, defaultValue: 'info' },
      kind: { type: DataTypes.ENUM('positive', 'watch', 'alert'), allowNull: false, defaultValue: 'watch' },
      meta: { type: DataTypes.JSON, allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'kids_insights',
      timestamps: false,
      indexes: [
        { name: 'kids_insights_child', fields: ['child_admission_no'] },
        { name: 'kids_insights_child_week', fields: ['child_admission_no', 'week_start'] },
        { name: 'kids_insights_rule', fields: ['rule_key'] },
      ],
    }
  );
  return KidInsight;
};
