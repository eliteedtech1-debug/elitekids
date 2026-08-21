'use strict';
/**
 * kids_children (elite_content) — child profile for the nursery student.
 * Linked to the shared `students` table by admission_no (main DB, read-only).
 */
module.exports = (sequelize, DataTypes) => {
  const KidChild = sequelize.define(
    'KidChild',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      admission_no: { type: DataTypes.STRING(50), allowNull: false, unique: 'uq_admission_school' },
      school_id: { type: DataTypes.STRING(20), allowNull: false, unique: 'uq_admission_school' },
      branch_id: { type: DataTypes.STRING(20), allowNull: false },
      full_name: { type: DataTypes.STRING(191), allowNull: false },
      age_level: {
        type: DataTypes.ENUM('Creche', 'Nursery', 'KG1', 'KG2', 'Primary'),
        allowNull: false,
        defaultValue: 'Nursery',
      },
      class_code: { type: DataTypes.STRING(50), allowNull: true },
      avatar_url: { type: DataTypes.STRING(500), allowNull: true },
      parent_user_id: { type: DataTypes.STRING(50), allowNull: true }, // elite_db.users.id (user_type=parent)
      parent_phone: { type: DataTypes.STRING(20), allowNull: true },
      status: {
        type: DataTypes.ENUM('Active', 'Inactive'),
        allowNull: false,
        defaultValue: 'Active',
      },
    },
    {
      tableName: 'kids_children',
      indexes: [
        { name: 'kids_children_school_branch', fields: ['school_id', 'branch_id'] },
        { name: 'kids_children_admission', fields: ['admission_no'] },
        { name: 'kids_children_parent', fields: ['parent_user_id'] },
      ],
    }
  );
  return KidChild;
};
