'use strict';
/**
 * kids_curriculum_points (elite_content) — Curriculum mapping for library-first content model.
 * See Doc 15: Curriculum Mapping & Content Library Model.
 */
module.exports = (sequelize, DataTypes) => {
  const KidCurriculumPoint = sequelize.define(
    'KidCurriculumPoint',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      curriculum_source: { type: DataTypes.STRING(255), allowNull: true },
      age_band: { type: DataTypes.STRING(20), allowNull: false },
      learning_objective: { type: DataTypes.TEXT, allowNull: false },
      category: { type: DataTypes.STRING(50), allowNull: false },
      mapped_item_ids: { type: DataTypes.JSON, allowNull: false },
    },
    {
      tableName: 'kids_curriculum_points',
      indexes: [
        { name: 'kids_curriculum_points_age_band', fields: ['age_band'] },
        { name: 'kids_curriculum_points_category', fields: ['category'] },
      ],
    }
  );
  return KidCurriculumPoint;
};
