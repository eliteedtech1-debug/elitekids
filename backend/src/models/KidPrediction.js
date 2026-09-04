'use strict';

module.exports = (sequelize, DataTypes) => sequelize.define(
  'KidPrediction',
  {
    id: { type: DataTypes.STRING(50), primaryKey: true },
    school_id: { type: DataTypes.STRING(50), allowNull: false },
    child_admission_no: { type: DataTypes.STRING(80), allowNull: false },
    prediction_type: { type: DataTypes.STRING(40), allowNull: false },
    score: { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0 },
    band: { type: DataTypes.STRING(20), allowNull: true },
    confidence: { type: DataTypes.DECIMAL(5, 4), allowNull: true },
    reasons: { type: DataTypes.JSON, allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: true },
    generated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'kids_predictions',
    indexes: [
      { fields: ['school_id', 'child_admission_no'] },
      { fields: ['prediction_type', 'generated_at'] },
    ],
  },
);
