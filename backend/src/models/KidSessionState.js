'use strict';
/**
 * kids_session_state (elite_content) — Save/resume functionality.
 * See Doc 17: Engagement & Accessibility Layer — Save / Resume & Error Recovery.
 */
module.exports = (sequelize, DataTypes) => {
  const KidSessionState = sequelize.define(
    'KidSessionState',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      session_id: { type: DataTypes.STRING(50), allowNull: false },
      student_id: { type: DataTypes.STRING(50), allowNull: false },
      current_item_id: { type: DataTypes.STRING(50), allowNull: false },
      current_tier: { type: DataTypes.INTEGER, allowNull: false },
      saved_state: { type: DataTypes.JSON, allowNull: false },
    },
    {
      tableName: 'kids_session_state',
      indexes: [
        { name: 'kids_session_state_session', fields: ['session_id'] },
        { name: 'kids_session_state_student', fields: ['student_id'] },
        { name: 'kids_session_state_student_session', fields: ['student_id', 'session_id'], unique: true },
      ],
    }
  );
  return KidSessionState;
};
