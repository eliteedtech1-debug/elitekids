'use strict';
/**
 * kids_interface_onboarding (elite_content) — Tracks one-time interface onboarding.
 * See Doc 16: Gamification Depth — Interface Onboarding.
 */
module.exports = (sequelize, DataTypes) => {
  const KidInterfaceOnboarding = sequelize.define(
    'KidInterfaceOnboarding',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      student_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      completed_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'kids_interface_onboarding',
      indexes: [
        { name: 'kids_interface_onboarding_student', fields: ['student_id'], unique: true },
      ],
    }
  );
  return KidInterfaceOnboarding;
};
