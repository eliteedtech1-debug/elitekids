'use strict';
/**
 * kids_companion_state (elite_content) — Companion character state.
 * See Doc 17: Engagement & Accessibility Layer — Companion Character.
 */
module.exports = (sequelize, DataTypes) => {
  const KidCompanionState = sequelize.define(
    'KidCompanionState',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      companion_type: { type: DataTypes.STRING(50), allowNull: false },
      customization: { type: DataTypes.JSON, allowNull: false },
    },
    {
      tableName: 'kids_companion_state',
      indexes: [
        { name: 'kids_companion_state_student', fields: ['student_id'], unique: true },
      ],
    }
  );
  return KidCompanionState;
};
