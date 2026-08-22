'use strict';
/**
 * kids_test_attempts (elite_content) — Retry logic data for Test-mode failures.
 * See Doc 16: Gamification Depth — Test-Mode Failure Handling.
 */
module.exports = (sequelize, DataTypes) => {
  const KidTestAttempt = sequelize.define(
    'KidTestAttempt',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false },
      item_id: { type: DataTypes.STRING(50), allowNull: false },
      tier: { type: DataTypes.INTEGER, allowNull: false },
      result: {
        type: DataTypes.ENUM('pass', 'fail'),
        allowNull: false,
      },
      attempt_number: { type: DataTypes.INTEGER, allowNull: false },
      routed_to: {
        type: DataTypes.ENUM('retest', 'practice', 'teacher_flag'),
        allowNull: false,
      },
    },
    {
      tableName: 'kids_test_attempts',
      indexes: [
        { name: 'kids_test_attempts_student', fields: ['student_id'] },
        { name: 'kids_test_attempts_item', fields: ['item_id'] },
        { name: 'kids_test_attempts_student_item', fields: ['student_id', 'item_id'] },
        { name: 'kids_test_attempts_created', fields: ['createdAt'] },
      ],
    }
  );
  return KidTestAttempt;
};
