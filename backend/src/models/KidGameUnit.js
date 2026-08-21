'use strict';
/**
 * kids_game_units (elite_content) — Unit sequencing with prerequisites.
 * See Doc 12: Learning Progression & Association Ladder — Game Series & Unit Sequencing.
 */
module.exports = (sequelize, DataTypes) => {
  const KidGameUnit = sequelize.define(
    'KidGameUnit',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      series_id: { type: DataTypes.STRING(50), allowNull: false },
      unit_number: { type: DataTypes.INTEGER, allowNull: false },
      prerequisite_unit_id: { type: DataTypes.STRING(50), allowNull: true },
      content_items: { type: DataTypes.JSON, allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'kids_game_units',
      indexes: [
        { name: 'kids_game_units_series', fields: ['series_id'] },
        { name: 'kids_game_units_prerequisite', fields: ['prerequisite_unit_id'] },
        { name: 'kids_game_units_series_number', fields: ['series_id', 'unit_number'], unique: true },
      ],
    }
  );
  return KidGameUnit;
};
