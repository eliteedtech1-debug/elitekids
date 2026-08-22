'use strict';
/**
 * kids_game_item_responses (elite_content) — Per-tap logging for pattern tracking.
 * See Doc 14: Pattern Tracking & Parent/Teacher Insights — Data Model.
 */
module.exports = (sequelize, DataTypes) => {
  const KidGameItemResponse = sequelize.define(
    'KidGameItemResponse',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false },
      item_id: { type: DataTypes.STRING(50), allowNull: false },
      tier: { type: DataTypes.INTEGER, allowNull: false },
      distractor_count: { type: DataTypes.INTEGER, allowNull: false },
      response_time_ms: { type: DataTypes.INTEGER, allowNull: false },
      mode: {
        type: DataTypes.ENUM('learning', 'practice', 'test'),
        allowNull: false,
      },
      correct: { type: DataTypes.BOOLEAN, allowNull: false },
    },
    {
      tableName: 'kids_game_item_responses',
      indexes: [
        { name: 'kids_game_item_responses_student', fields: ['student_id'] },
        { name: 'kids_game_item_responses_item', fields: ['item_id'] },
        { name: 'kids_game_item_responses_student_item', fields: ['student_id', 'item_id'] },
        { name: 'kids_game_item_responses_created', fields: ['createdAt'] },
      ],
    }
  );
  return KidGameItemResponse;
};
