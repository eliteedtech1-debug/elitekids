'use strict';
/**
 * users (main shared school DB) — READ-ONLY mirror. This model is never
 * sync'd and never altered by elite-kids-api. It exists so passport auth and
 * parent lookups can query the shared table with the rest of the app's code.
 */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      name: { type: DataTypes.STRING(191), allowNull: true },
      email: { type: DataTypes.STRING(191), allowNull: true },
      password: { type: DataTypes.STRING(255), allowNull: true },
      role: { type: DataTypes.STRING(50), allowNull: true },
      user_type: { type: DataTypes.STRING(50), allowNull: true },
      school_id: { type: DataTypes.STRING(20), allowNull: true },
      branch_id: { type: DataTypes.STRING(20), allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: true },
      is_activated: { type: DataTypes.TINYINT(1), allowNull: true },
    },
    {
      tableName: 'users',
      timestamps: false,
      // Belt-and-braces: this model must never create/alter the shared table.
      sync: { force: false, alter: false },
    }
  );
  return User;
};
