'use strict';
/**
 * kids_mode_locks (elite_content) — Mode lock per lesson per child or per class.
 * Hierarchy: Teacher > Parent > Child
 *
 * Per-student lock: child_admission_no is set, class_code is NULL
 * Class-wide lock:  child_admission_no = '*', class_code is set
 *   → applies to all students in that class for that lesson
 */
module.exports = (sequelize, DataTypes) => {
  const KidModeLock = sequelize.define(
    'KidModeLock',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      school_id: { type: DataTypes.STRING(20), allowNull: false },
      branch_id: { type: DataTypes.STRING(20), allowNull: false },
      child_admission_no: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '*' },
      class_code: { type: DataTypes.STRING(50), allowNull: true },
      lesson_id: { type: DataTypes.STRING(50), allowNull: false },
      locked_mode: {
        type: DataTypes.ENUM('learning', 'practice', 'test'),
        allowNull: false,
      },
      locked_by: { type: DataTypes.STRING(50), allowNull: false },
      locked_by_role: {
        type: DataTypes.ENUM('teacher', 'parent'),
        allowNull: false,
      },
      locked_by_name: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'kids_mode_locks',
      timestamps: true,
      indexes: [
        {
          name: 'uq_mode_lock_child_lesson',
          unique: true,
          fields: ['child_admission_no', 'lesson_id'],
        },
        {
          name: 'uq_mode_lock_class_lesson',
          unique: true,
          fields: ['class_code', 'lesson_id', 'school_id'],
          where: { class_code: { [sequelize.Sequelize.Op.ne]: null } },
        },
        { name: 'mode_lock_child', fields: ['child_admission_no'] },
        { name: 'mode_lock_class', fields: ['class_code'] },
        { name: 'mode_lock_school', fields: ['school_id', 'branch_id'] },
      ],
    }
  );
  return KidModeLock;
};
