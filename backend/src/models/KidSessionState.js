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
      lesson_id: { type: DataTypes.STRING(100), allowNull: true },
      // prod column is `session_data` (free-form JSON). `current_item_id` /
      // `current_tier` have NO dedicated prod columns, so the controller folds
      // them INTO this blob — see C-DRIFT-01 alignment. The attribute stays
      // `saved_state` so the API response key is unchanged for callers.
      saved_state: { type: DataTypes.JSON, allowNull: false, field: 'session_data' },
      last_saved_at: { type: DataTypes.DATE, allowNull: true },
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
