'use strict';
/**
 * kids_game_series (elite_content) — Game series metadata for unit sequencing.
 * See Doc 12: Learning Progression & Association Ladder — Game Series & Unit Sequencing.
 */
module.exports = (sequelize, DataTypes) => {
  const KidGameSeries = sequelize.define(
    'KidGameSeries',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      // E3b: free-text display group — canonical taxonomy lives in subject_code
      category: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      created_by: { type: DataTypes.STRING(50), allowNull: true },
      subject_code: { type: DataTypes.STRING(50), allowNull: true },
      term_hint: { type: DataTypes.STRING(20), allowNull: true },
    },
    {
      tableName: 'kids_game_series',
      indexes: [
        { name: 'kids_game_series_category', fields: ['category'] },
        { name: 'kids_game_series_created_by', fields: ['created_by'] },
      ],
    }
  );
  return KidGameSeries;
};
