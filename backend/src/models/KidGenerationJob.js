'use strict';
/**
 * kids_generation_jobs (elite_content) — AI content-generation queue records.
 * The BullMQ worker updates these; UI polls status for "generating…" states.
 */
module.exports = (sequelize, DataTypes) => {
  const KidGenerationJob = sequelize.define(
    'KidGenerationJob',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      lesson_id: { type: DataTypes.STRING(50), allowNull: false },
      content_type: {
        type: DataTypes.ENUM('game_config', 'scene_script', 'story', 'audio'),
        allowNull: false,
      },
      template: { type: DataTypes.STRING(30), allowNull: true },
      status: {
        type: DataTypes.ENUM('queued', 'running', 'succeeded', 'failed'),
        allowNull: false,
        defaultValue: 'queued',
      },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      error: { type: DataTypes.TEXT, allowNull: true },
      model_version: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      tableName: 'kids_generation_jobs',
      indexes: [
        { name: 'kids_generation_lesson', fields: ['lesson_id'] },
        { name: 'kids_generation_status', fields: ['status'] },
      ],
    }
  );
  return KidGenerationJob;
};
