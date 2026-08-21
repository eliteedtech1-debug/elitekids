'use strict';
/**
 * kids_content_approvals (elite_content) — the human review queue.
 * Approving flips the referenced content's content_state → approved → published.
 */
module.exports = (sequelize, DataTypes) => {
  const KidContentApproval = sequelize.define(
    'KidContentApproval',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      school_id: { type: DataTypes.STRING(20), allowNull: false },
      branch_id: { type: DataTypes.STRING(20), allowNull: false },
      content_type: {
        type: DataTypes.ENUM('lesson', 'game_config', 'scene_script', 'story', 'audio'),
        allowNull: false,
      },
      content_id: { type: DataTypes.STRING(50), allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewed_by: { type: DataTypes.STRING(50), allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'kids_content_approvals',
      indexes: [
        { name: 'kids_approvals_school_status', fields: ['school_id', 'status'] },
        { name: 'kids_approvals_content', fields: ['content_type', 'content_id'] },
      ],
    }
  );
  return KidContentApproval;
};
