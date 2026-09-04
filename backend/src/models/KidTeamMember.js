'use strict';
/**
 * kids_team_members (elite_content) — Q3 Classroom Collaboration.
 * Many-to-many: child ↔ team. role = leader/member.
 */
module.exports = (sequelize, DataTypes) => {
  const KidTeamMember = sequelize.define(
    'KidTeamMember',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      team_id: { type: DataTypes.BIGINT, allowNull: false },
      child_admission_no: { type: DataTypes.STRING(50), allowNull: false },
      role: { type: DataTypes.ENUM('leader', 'member'), allowNull: false, defaultValue: 'member' },
      joined_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'kids_team_members',
      indexes: [
        { name: 'uq_kids_team_members_unique', unique: true, fields: ['team_id', 'child_admission_no'] },
        { name: 'kids_team_members_child', fields: ['child_admission_no'] },
        { name: 'kids_team_members_team', fields: ['team_id'] },
      ],
    }
  );
  return KidTeamMember;
};
