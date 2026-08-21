'use strict';
/**
 * school_setup (main shared school DB) — READ-ONLY mirror. Never sync'd.
 * Provides branding (badge_url, school_name, motto) + the module gate
 * (kids_stand_alone) added by database/migrate.js.
 */
module.exports = (sequelize, DataTypes) => {
  const SchoolSetup = sequelize.define(
    'SchoolSetup',
    {
      school_id: { type: DataTypes.STRING(20), primaryKey: true },
      school_name: { type: DataTypes.STRING(500), allowNull: true },
      short_name: { type: DataTypes.STRING(20), allowNull: true },
      school_motto: { type: DataTypes.STRING(300), allowNull: true },
      badge_url: { type: DataTypes.STRING(500), allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: true },
      nursery_section: { type: DataTypes.TINYINT(1), allowNull: true },
      kids_stand_alone: { type: DataTypes.TINYINT(1), allowNull: true },
      kids_url: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      tableName: 'school_setup',
      timestamps: false,
      sync: { force: false, alter: false },
    }
  );
  return SchoolSetup;
};
