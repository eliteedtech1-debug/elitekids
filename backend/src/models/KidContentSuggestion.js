'use strict';
/**
 * kids_content_suggestions (elite_content) — Q3 Teacher AI Assistant.
 * Content-gap / auto-assign records (NERDC strand low coverage, mastery-assign).
 */
module.exports = (sequelize, DataTypes) => {
  const KidContentSuggestion = sequelize.define(
    'KidContentSuggestion',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      school_id: { type: DataTypes.STRING(40), allowNull: false },
      class_id: { type: DataTypes.STRING(50), allowNull: false },
      suggestion_type: { type: DataTypes.ENUM('gap', 'assign', 'review'), allowNull: false, defaultValue: 'gap' },
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      strand: { type: DataTypes.STRING(100), allowNull: true },
      lesson_id: { type: DataTypes.STRING(50), allowNull: true },
      child_admission_no: { type: DataTypes.STRING(50), allowNull: true },
      status: { type: DataTypes.ENUM('open', 'assigned', 'dismissed'), allowNull: false, defaultValue: 'open' },
      priority: { type: DataTypes.ENUM('low', 'medium', 'high'), allowNull: false, defaultValue: 'medium' },
      meta: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'kids_content_suggestions',
      indexes: [
        { name: 'kids_content_suggestions_class', fields: ['class_id'] },
        { name: 'kids_content_suggestions_class_status', fields: ['class_id', 'status'] },
        { name: 'kids_content_suggestions_type', fields: ['suggestion_type'] },
      ],
    }
  );
  return KidContentSuggestion;
};
