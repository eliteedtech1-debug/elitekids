'use strict';
/**
 * kids_scene_scripts (elite_content) — Scene Script JSON for rig-based
 * video/animation content (see 01-PLANNING/10-VIDEO-ANIMATION-ARCHITECTURE-REVISION).
 */
module.exports = (sequelize, DataTypes) => {
  const KidSceneScript = sequelize.define(
    'KidSceneScript',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      lesson_id: { type: DataTypes.STRING(50), allowNull: false },
      scene_type: { type: DataTypes.STRING(30), allowNull: true }, // e.g. 'game_checkpoint' (Sprint 7+)
      script_json: { type: DataTypes.JSON, allowNull: false },
      schema_version: { type: DataTypes.STRING(10), allowNull: false, defaultValue: '1.0' },
      content_state: {
        type: DataTypes.ENUM(
          'generated',
          'pre_screened',
          'pending_human_review',
          'approved',
          'published',
          'recalled'
        ),
        allowNull: false,
        defaultValue: 'generated',
      },
      model_version: { type: DataTypes.STRING(50), allowNull: true },
      created_by: { type: DataTypes.STRING(50), allowNull: true },
      approved_by: { type: DataTypes.STRING(50), allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'kids_scene_scripts',
      indexes: [
        { name: 'kids_scene_scripts_lesson', fields: ['lesson_id'] },
        { name: 'kids_scene_scripts_state', fields: ['content_state'] },
      ],
    }
  );
  return KidSceneScript;
};
