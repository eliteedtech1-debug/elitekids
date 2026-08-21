'use strict';
/**
 * kids_engagement_snapshots (elite_content) — Session engagement data.
 * See Doc 14: Pattern Tracking & Parent/Teacher Insights — Engagement signals.
 */
module.exports = (sequelize, DataTypes) => {
  const KidEngagementSnapshot = sequelize.define(
    'KidEngagementSnapshot',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      session_id: { type: DataTypes.STRING(50), allowNull: false },
      student_id: { type: DataTypes.STRING(50), allowNull: false },
      start_time: { type: DataTypes.DATE, allowNull: false },
      end_time: { type: DataTypes.DATE, allowNull: true },
      drop_off_point: { type: DataTypes.STRING(100), allowNull: true },
      content_format_breakdown: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: 'kids_engagement_snapshots',
      indexes: [
        { name: 'kids_engagement_snapshots_student', fields: ['student_id'] },
        { name: 'kids_engagement_snapshots_session', fields: ['session_id'] },
        { name: 'kids_engagement_snapshots_start', fields: ['start_time'] },
      ],
    }
  );
  return KidEngagementSnapshot;
};
