'use strict';
/**
 * kids_content_generation_audit (AI DB; elite_bot on the prod server) — the PERMANENT audit log.
 * Every AI generation is logged regardless of outcome: prompt, provider +
 * pinned model version, raw output, classifier score, denylist result,
 * reviewer identity, approval/publish timestamps. This is the retrievable
 * answer to "why did my child see this".
 */
module.exports = (sequelize, DataTypes) => {
  const KidContentAuditLog = sequelize.define(
    'KidContentAuditLog',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      school_id: { type: DataTypes.STRING(20), allowNull: false },
      content_type: { type: DataTypes.STRING(30), allowNull: false },
      content_id: { type: DataTypes.STRING(50), allowNull: false },
      prompt: { type: DataTypes.TEXT, allowNull: false },
      model_provider: { type: DataTypes.STRING(50), allowNull: false },
      model_version: { type: DataTypes.STRING(50), allowNull: false },
      raw_output: { type: DataTypes.TEXT('medium'), allowNull: true },
      classifier_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      classifier_passed: { type: DataTypes.TINYINT(1), allowNull: true },
      denylist_result: { type: DataTypes.STRING(20), allowNull: true }, // 'passed' | 'blocked'
      reviewer_id: { type: DataTypes.STRING(50), allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      published_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'kids_content_generation_audit',
      updatedAt: false,
      indexes: [
        { name: 'kids_audit_school_created', fields: ['school_id', 'createdAt'] },
        { name: 'kids_audit_content', fields: ['content_id'] },
      ],
    }
  );
  return KidContentAuditLog;
};
