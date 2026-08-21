'use strict';
/**
 * kids_garden_state (elite_content) — Visual progress metaphor (garden).
 * See Doc 17: Engagement & Accessibility Layer — Visual Progress Metaphor.
 */
module.exports = (sequelize, DataTypes) => {
  const KidGardenState = sequelize.define(
    'KidGardenState',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      garden_elements: { type: DataTypes.JSON, allowNull: false },
    },
    {
      tableName: 'kids_garden_state',
      indexes: [
        { name: 'kids_garden_state_student', fields: ['student_id'], unique: true },
      ],
    }
  );
  return KidGardenState;
};
