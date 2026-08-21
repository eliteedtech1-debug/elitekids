'use strict';
/**
 * kids_prescreen_log (elite_content) — classifier results per generated asset.
 * Every generated asset passes the pre-screen classifier before human review.
 */
module.exports = (sequelize, DataTypes) => {
  const KidPrescreenLog = sequelize.define(
    'KidPrescreenLog',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      content_type: { type: DataTypes.STRING(30), allowNull: false },
      content_id: { type: DataTypes.STRING(50), allowNull: false },
      age_appropriate: { type: DataTypes.TINYINT, allowNull: true },
      safe: { type: DataTypes.TINYINT, allowNull: true },
      curriculum_aligned: { type: DataTypes.TINYINT, allowNull: true },
      score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      passed: { type: DataTypes.TINYINT, allowNull: true },
      classifier_version: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      tableName: 'kids_prescreen_log',
      indexes: [{ name: 'kids_prescreen_content', fields: ['content_type', 'content_id'] }],
    }
  );
  return KidPrescreenLog;
};
