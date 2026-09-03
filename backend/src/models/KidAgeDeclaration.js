'use strict';

/**
 * kids_age_declarations (elite_content) — child-declared age from the
 * welcome-tour "How old are you?" step (one row per child, upsert on re-pick).
 *
 * Purpose: kids_children is only populated for kids-app-native children, but
 * SMS-imported nursery students (elite_db.students) have no row — so the age
 * band can be unresolvable for them. The declared age gives the age-band
 * resolver a kid-friendly, self-service source of truth (see ageBand.js
 * resolveChildBandWithFallback order: kids_children → declaration → students).
 */
module.exports = (sequelize, DataTypes) => {
  const KidAgeDeclaration = sequelize.define(
    'KidAgeDeclaration',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      child_admission_no: { type: DataTypes.STRING(64), allowNull: false },
      school_id: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      age_years: { type: DataTypes.TINYINT, allowNull: false },
      source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'tour' },
    },
    {
      tableName: 'kids_age_declarations',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [{ name: 'uq_kids_age_child', unique: true, fields: ['child_admission_no'] }],
    }
  );
  return KidAgeDeclaration;
};
