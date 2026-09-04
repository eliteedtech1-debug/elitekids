'use strict';
/**
 * kids_teacher_insights (elite_content) — Q3 Teacher AI Assistant.
 * Class-level insight rows (rollup of the parent insight engine per class).
 */
module.exports = (sequelize, DataTypes) => {
  const KidTeacherInsight = sequelize.define(
    'KidTeacherInsight',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      school_id: { type: DataTypes.STRING(40), allowNull: false },
      class_id: { type: DataTypes.STRING(50), allowNull: false },
      insight_type: { type: DataTypes.STRING(50), allowNull: false },
      headline: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      severity: { type: DataTypes.ENUM('info', 'low', 'medium', 'high'), allowNull: false, defaultValue: 'info' },
      meta: { type: DataTypes.JSON, allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'kids_teacher_insights',
      timestamps: false,
      indexes: [
        { name: 'kids_teacher_insights_class', fields: ['class_id'] },
        { name: 'kids_teacher_insights_class_week', fields: ['class_id', 'week_start'] },
        { name: 'kids_teacher_insights_type', fields: ['insight_type'] },
      ],
    }
  );
  return KidTeacherInsight;
};
