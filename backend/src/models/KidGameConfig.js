'use strict';
/**
 * kids_game_configs (elite_content) — validated Game Config JSON per lesson.
 * config_json is validated against game-engine/schemas/*.schema.json BEFORE
 * storage and again before serving to a child.
 */
module.exports = (sequelize, DataTypes) => {
  const KidGameConfig = sequelize.define(
    'KidGameConfig',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      lesson_id: { type: DataTypes.STRING(50), allowNull: false },
      template: {
        type: DataTypes.ENUM(
          // Append-only (C2): order matters for MySQL ENUM — never reorder.
          'matching',
          'tap-recognition',
          'drag-sort',
          'quiz',
          'fill-in-blank',
          'puzzle-split',
          'memory-pairs',
          'label-diagram',
          'stage-sequence',
          'game-chain'
        ),
        allowNull: false,
      },
      age_level: { type: DataTypes.STRING(20), allowNull: false },
      config_json: { type: DataTypes.JSON, allowNull: false },
      schema_version: { type: DataTypes.STRING(10), allowNull: false, defaultValue: '1.0' },
      item_id: { type: DataTypes.STRING(50), allowNull: true },
      tier: { type: DataTypes.INTEGER, allowNull: true },
      category: { type: DataTypes.STRING(50), allowNull: true },
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
      model_version: { type: DataTypes.STRING(50), allowNull: true }, // pinned AI version
      created_by: { type: DataTypes.STRING(50), allowNull: true },
      approved_by: { type: DataTypes.STRING(50), allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'kids_game_configs',
      indexes: [
        { name: 'kids_game_configs_lesson', fields: ['lesson_id'] },
        { name: 'kids_game_configs_state', fields: ['content_state'] },
        { name: 'kids_game_configs_template', fields: ['template'] },
        { name: 'kids_game_configs_item_id', fields: ['item_id'] },
        { name: 'kids_game_configs_tier', fields: ['tier'] },
        { name: 'kids_game_configs_category', fields: ['category'] },
        { name: 'kids_game_configs_item_tier', fields: ['item_id', 'tier'], unique: true },
      ],
    }
  );
  return KidGameConfig;
};
