'use strict';
/**
 * kids_class_game_variants (elite_content) — Teacher customizations (class-scoped copies).
 * See Doc 15: Curriculum Mapping & Content Library Model — Teacher Customization Rights.
 */
module.exports = (sequelize, DataTypes) => {
  const KidClassGameVariant = sequelize.define(
    'KidClassGameVariant',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      library_game_id: { type: DataTypes.STRING(50), allowNull: true },
      teacher_id: { type: DataTypes.STRING(50), allowNull: false },
      class_id: { type: DataTypes.STRING(50), allowNull: false },
      customizations: { type: DataTypes.JSON, allowNull: false },
    },
    {
      tableName: 'kids_class_game_variants',
      indexes: [
        { name: 'kids_class_game_variants_library', fields: ['library_game_id'] },
        { name: 'kids_class_game_variants_teacher', fields: ['teacher_id'] },
        { name: 'kids_class_game_variants_class', fields: ['class_id'] },
      ],
    }
  );
  return KidClassGameVariant;
};
