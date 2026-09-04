'use strict';

/**
 * Q4 Analytics Intelligence v1.
 *
 * This is an explainable baseline, not a claim of trained ML. It converts
 * existing engagement/mastery signals into bounded scores with reasons so a
 * teacher can review the evidence before acting.
 */

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function riskBand(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function predictDropoutRisk({ daysInactive = 0, attempts = 0, avgScore = 0, mastery = 0.5 } = {}) {
  const inactivity = clamp(Number(daysInactive) / 14);
  const lowActivity = attempts === 0 ? 1 : clamp(1 - Number(attempts) / 8);
  const lowPerformance = clamp(1 - Number(avgScore) / 100);
  const lowMastery = clamp(1 - Number(mastery));
  const score = clamp(inactivity * 0.4 + lowActivity * 0.25 + lowPerformance * 0.2 + lowMastery * 0.15);
  const reasons = [];
  if (daysInactive >= 7) reasons.push('inactive for 7 or more days');
  if (attempts < 2) reasons.push('limited recent practice data');
  if (avgScore < 50) reasons.push('recent average score below 50%');
  if (mastery < 0.4) reasons.push('mastery signal below 40%');
  return { score: Number(score.toFixed(2)), band: riskBand(score), reasons };
}

function predictMastery({ mastery = 0, avgScore = 0, attempts = 0 } = {}) {
  const bkt = clamp(mastery);
  const scoreSignal = clamp(Number(avgScore) / 100);
  const evidence = clamp(Number(attempts) / 5);
  const probability = clamp(bkt * 0.55 + scoreSignal * 0.3 + evidence * 0.15);
  const confidence = clamp(Number(attempts) / 10);
  return {
    probability: Number(probability.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    band: probability >= 0.75 ? 'mastered' : probability >= 0.5 ? 'developing' : 'needs_support',
  };
}

function predictChild(input = {}) {
  const mastery = predictMastery(input);
  const dropout = predictDropoutRisk({ ...input, mastery: mastery.probability });
  return {
    child_admission_no: input.child_admission_no,
    dropout_risk: dropout,
    mastery: { ...mastery, skill_key: input.skill_key || null },
    explanation: 'Explainable v1 estimate from recent activity and mastery signals; a teacher should review before intervention.',
  };
}

function aggregatePopulation(rows = []) {
  const values = rows.map((r) => Number(r.score) || 0);
  const active = rows.filter((r) => Number(r.attempts) > 0).length;
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const atRisk = rows.filter((r) => predictDropoutRisk(r).band === 'high').length;
  return {
    learners: rows.length,
    active_learners: active,
    average_score_pct: Math.round(average),
    high_risk_learners: atRisk,
    risk_rate_pct: rows.length ? Math.round((atRisk / rows.length) * 100) : 0,
  };
}

function scoreContent(rows = []) {
  return rows.map((r) => ({
    lesson_id: r.lesson_id,
    title: r.title || r.lesson_id,
    attempts: Number(r.attempts) || 0,
    unique_students: Number(r.unique_students) || 0,
    average_score_pct: Math.round(Number(r.average_score) || 0),
    completion_rate_pct: Math.round(clamp(Number(r.completion_rate) || 0, 0, 1) * 100),
    effectiveness: Number((clamp((Number(r.average_score) || 0) / 100) * 0.7 + clamp(Number(r.completion_rate) || 0) * 0.3).toFixed(2)),
  }));
}

module.exports = {
  clamp,
  riskBand,
  predictDropoutRisk,
  predictMastery,
  predictChild,
  aggregatePopulation,
  scoreContent,
};
