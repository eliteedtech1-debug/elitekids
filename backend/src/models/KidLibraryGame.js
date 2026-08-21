'use strict';
/**
 * kids_library_games (elite_content) — Canonical, ECE-validated master content.
 * See Doc 15: Curriculum Mapping & Content Library Model.
 */
module.exports = (sequelize, DataTypes) => {
  const KidLibraryGame = sequelize.define(
    'KidLibraryGame',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      curriculum_point_id: { type: DataTypes.STRING(50), allowNull: true },
      game_config_id: { type: DataTypes.STRING(50), allowNull: false },
      ece_validated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      validated_by: { type: DataTypes.STRING(50), allowNull: true },
      validated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'kids_library_games',
      indexes: [
        { name: 'kids_library_games_curriculum', fields: ['curriculum_point_id'] },
        { name: 'kids_library_games_config', fields: ['game_config_id'] },
        { name: 'kids_library_games_validated', fields: ['ece_validated'] },
      ],
    }
  );
  return KidLibraryGame;
};
