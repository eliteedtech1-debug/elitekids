'use strict';
/**
 * students (main shared school DB) — READ-ONLY mirror. Never sync'd/created.
 * Nursery children are real rows in this table (admission_no + school_id);
 * kids_children (elite_content) links to them by admission_no.
 *
 * class_name / current_class are REQUIRED by services/ageBand
 * (resolveBandForAdmission step 1 reads student.class_name → current_class →
 * class_code). Sequelize selects only declared attributes, so omitting these
 * made `student.class_name` undefined for every real school, dropping children
 * to the class_code fallback — where the normalizer deliberately strips the
 * synthetic `CLS####` codes, so no band resolved at all and the G6 age ceiling
 * in /kids/lessons silently never applied (found live 2026-09-15: admissions
 * 004 @ SCH/28 and 109 @ SCH/11 each received the full 1718-lesson catalog
 * instead of their 1085 / 1356 at-or-below-band lessons). Declaring them is a
 * SELECT widening only — this model is never written to.
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
      class_name: { type: DataTypes.STRING(191), allowNull: true },
      current_class: { type: DataTypes.STRING(191), allowNull: true },
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
