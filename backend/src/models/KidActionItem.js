'use strict';
/**
 * kids_action_items (elite_content) — Q3 Parent Intelligence.
 * Recommended actions surfaced with an insight; ack state tracked for the
 * "insights actioned" success metric.
 */
module.exports = (sequelize, DataTypes) => {
  const KidActionItem = sequelize.define(
    'KidActionItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      child_admission_no: { type: DataTypes.STRING(50), allowNull: false },
      insight_id: { type: DataTypes.BIGINT, allowNull: true },
      action_text: { type: DataTypes.TEXT, allowNull: false },
      nudge: { type: DataTypes.STRING(120), allowNull: true },
      ack_status: { type: DataTypes.ENUM('pending', 'ack', 'done'), allowNull: false, defaultValue: 'pending' },
      acked_at: { type: DataTypes.DATE, allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'kids_action_items',
      timestamps: false,
      indexes: [
        { name: 'kids_action_items_child', fields: ['child_admission_no'] },
        { name: 'kids_action_items_child_ack', fields: ['child_admission_no', 'ack_status'] },
        { name: 'kids_action_items_insight', fields: ['insight_id'] },
      ],
    }
  );
  return KidActionItem;
};
