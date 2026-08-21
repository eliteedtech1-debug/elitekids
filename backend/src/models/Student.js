'use strict';
/**
 * students (main shared school DB) — READ-ONLY mirror. Never sync'd/created.
 * Nursery children are real rows in this table (admission_no + school_id);
 * kids_children (elite_content) links to them by admission_no.
 */
module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define(
    'Student',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      admission_no: { type: DataTypes.STRING(50), allowNull: true },
      school_id: { type: DataTypes.STRING(20), allowNull: true },
      branch_id: { type: DataTypes.STRING(20), allowNull: true },
      student_name: { type: DataTypes.STRING(191), allowNull: true },
      class_code: { type: DataTypes.STRING(50), allowNull: true },
      user_type: { type: DataTypes.STRING(50), allowNull: true },
    },
    {
      tableName: 'students',
      timestamps: false,
      sync: { force: false, alter: false },
    }
  );
  return Student;
};
