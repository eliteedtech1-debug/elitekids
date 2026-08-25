'use strict';
/**
 * kids_lessons (elite_content) — a teacher-created lesson, AI-enriched.
 * content_state is the safety gate: child-facing queries filter 'published'.
 */
module.exports = (sequelize, DataTypes) => {
  const KidLesson = sequelize.define(
    'KidLesson',
    {
      id: { type: DataTypes.STRING(50), primaryKey: true },
      school_id: { type: DataTypes.STRING(20), allowNull: false },
      branch_id: { type: DataTypes.STRING(20), allowNull: false },
      title: { type: DataTypes.STRING(191), allowNull: false },
      subject: { type: DataTypes.STRING(100), allowNull: false },
      age_level: {
        type: DataTypes.ENUM('Creche', 'Nursery', 'KG1', 'KG2', 'Primary'),
        allowNull: false,
      },
      lesson_text: { type: DataTypes.TEXT, allowNull: true },
      created_by: { type: DataTypes.STRING(50), allowNull: false }, // elite_db.users.id
      content_state: {
        type: DataTypes.ENUM(
          'generated',
          'pre_screened',
          'pending_human_review',
          'approved',
          'published',
          'recalled'
        ),
        allowNull: false,
        defaultValue: 'generated',
      },
      lesson_type: {
        type: DataTypes.ENUM('game', 'video', 'story', 'song', 'worksheet'),
        allowNull: false,
        defaultValue: 'game',
      },
      duration_target_sec: { type: DataTypes.INTEGER, allowNull: true },
      is_global: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
      published_at: { type: DataTypes.DATE, allowNull: true },
      // NERDC curriculum compliance (#1)
      nerdc_code: { type: DataTypes.STRING(100), allowNull: true },
      nerdc_strand: { type: DataTypes.STRING(100), allowNull: true },
      nerdc_sub_strand: { type: DataTypes.STRING(100), allowNull: true },
    },
    {
      tableName: 'kids_lessons',
      indexes: [
        { name: 'kids_lessons_school_branch', fields: ['school_id', 'branch_id'] },
        { name: 'kids_lessons_state', fields: ['content_state'] },
        { name: 'kids_lessons_age', fields: ['age_level'] },
      ],
    }
  );
  return KidLesson;
};
