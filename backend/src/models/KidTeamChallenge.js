'use strict';
/**
 * kids_team_challenges (elite_content) — Q3 Classroom Collaboration.
 * Real-time challenge session rows for a team: one active session per team.
 */
module.exports = (sequelize, DataTypes) => {
  const KidTeamChallenge = sequelize.define(
    'KidTeamChallenge',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      team_id: { type: DataTypes.BIGINT, allowNull: false },
      lesson_id: { type: DataTypes.STRING(50), allowNull: false },
      subject: { type: DataTypes.STRING(50), allowNull: true },
      status: { type: DataTypes.ENUM('lobby', 'active', 'ended', 'cancelled'), allowNull: false, defaultValue: 'lobby' },
      started_at: { type: DataTypes.DATE, allowNull: true },
      ended_at: { type: DataTypes.DATE, allowNull: true },
      max_questions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      current_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      scores: { type: DataTypes.JSON, allowNull: true },
      created_by: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      tableName: 'kids_team_challenges',
      indexes: [
        { name: 'kids_team_challenges_team', fields: ['team_id'] },
        { name: 'kids_team_challenges_team_status', fields: ['team_id', 'status'] },
      ],
    }
  );
  return KidTeamChallenge;
};
