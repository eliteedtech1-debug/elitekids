'use strict';
/**
 * kids_peer_teaching (elite_content) — Q3 Classroom Collaboration.
 * Recorded peer explanations. TEXT-ONLY in v1 (NO audio — COPPA/privacy).
 * Screened by denylist check before publish in controller.
 */
module.exports = (sequelize, DataTypes) => {
  const KidPeerTeaching = sequelize.define(
    'KidPeerTeaching',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      school_id: { type: DataTypes.STRING(40), allowNull: false },
      class_id: { type: DataTypes.STRING(50), allowNull: false },
      child_admission_no: { type: DataTypes.STRING(50), allowNull: false },
      subject: { type: DataTypes.STRING(50), allowNull: true },
      skill_key: { type: DataTypes.STRING(100), allowNull: true },
      lesson_id: { type: DataTypes.STRING(50), allowNull: true },
      explanation_text: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'approved', 'hidden'), allowNull: false, defaultValue: 'pending' },
      helps_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'kids_peer_teaching',
      timestamps: false,
      indexes: [
        { name: 'kids_peer_teaching_class', fields: ['class_id'] },
        { name: 'kids_peer_teaching_subject', fields: ['subject'] },
        { name: 'kids_peer_teaching_author', fields: ['child_admission_no'] },
        { name: 'kids_peer_teaching_status', fields: ['status'] },
      ],
    }
  );
  return KidPeerTeaching;
};
