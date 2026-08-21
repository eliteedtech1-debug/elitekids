'use strict';
/**
 * kids_denylist_rules (elite_content) — deterministic, human-curated denylist.
 * Checked as a hard filter on every generated asset, independent of the AI
 * classifier. Version-controlled + auditable (added_by, created_at).
 */
module.exports = (sequelize, DataTypes) => {
  const KidDenylistRule = sequelize.define(
    'KidDenylistRule',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      rule: { type: DataTypes.TEXT, allowNull: false },
      category: { type: DataTypes.STRING(50), allowNull: false },
      active: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 1 },
      added_by: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      tableName: 'kids_denylist_rules',
      updatedAt: false,
    }
  );
  return KidDenylistRule;
};
