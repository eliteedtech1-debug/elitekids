'use strict';
/**
 * kids_teams (elite_content) — Q3 Classroom Collaboration.
 * A learning team within a class. Members are tracked in kids_team_members.
 */
module.exports = (sequelize, DataTypes) => {
  const KidTeam = sequelize.define(
    'KidTeam',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      school_id: { type: DataTypes.STRING(40), allowNull: false },
      class_id: { type: DataTypes.STRING(50), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      age_band: { type: DataTypes.STRING(20), allowNull: true },
      created_by: { type: DataTypes.STRING(50), allowNull: true },
      status: { type: DataTypes.ENUM('active', 'closed'), allowNull: false, defaultValue: 'active' },
    },
    {
      tableName: 'kids_teams',
      indexes: [
        { name: 'kids_teams_class', fields: ['class_id'] },
        { name: 'kids_teams_class_band', fields: ['class_id', 'age_band'] },
        { name: 'kids_teams_created_by', fields: ['created_by'] },
      ],
    }
  );
  return KidTeam;
};
