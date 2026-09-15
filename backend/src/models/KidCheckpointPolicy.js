'use strict';
/**
 * kids_checkpoint_policies (KIDS_DB_NAME) — who may confirm a jump-ahead.
 *
 * The assessment is identical for every school (same games, same threshold, same
 * per-unit coverage). What a school controls is only WHO confirms a pass:
 *
 *   auto_approve = 0  a passing checkpoint is a recommendation; a teacher/admin
 *                     must confirm it (close supervision, consistent monitoring)
 *   auto_approve = 1  a passing checkpoint confirms itself and unlocks at once
 *                     (self-paced runs, advanced learners who already work ahead)
 *
 * Scope resolution is most-specific-wins:
 *   child → class → school → platform default
 * so a school can run supervised by default and hand auto-jump to a selected
 * child, or run self-paced and hold one child back under review.
 *
 * `school_id` is always recorded (even for a child scope) so a tenant can only
 * ever list and change its own rows.
 *
 * Schema is owned by database/kids-checkpoint-exams-migration.js and is
 * intentionally absent from KIDS_CONTENT_TABLES: the running service never runs
 * this DDL.
 */
module.exports = (sequelize, DataTypes) => {
  const KidCheckpointPolicy = sequelize.define(
    'KidCheckpointPolicy',
    {
      id: { type: DataTypes.STRING(64), primaryKey: true },
      // school | class | child
      scope: { type: DataTypes.STRING(10), allowNull: false },
      scope_id: { type: DataTypes.STRING(100), allowNull: false },
      school_id: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      auto_approve: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      set_by: { type: DataTypes.STRING(64), allowNull: true },
      note: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'kids_checkpoint_policies',
      indexes: [
        { name: 'kids_checkpoint_policies_school', fields: ['school_id'] },
        { name: 'kids_checkpoint_policies_scope', fields: ['scope', 'scope_id'], unique: true },
      ],
    }
  );
  return KidCheckpointPolicy;
};
