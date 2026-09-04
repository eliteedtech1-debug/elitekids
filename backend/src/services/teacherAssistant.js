'use strict';

/**
 * Q3 Teacher AI Assistant — class-level aggregation service.
 *
 * Pure helpers (DB-free, unit-testable): roll up per-child insights into
 * class-level signals, detect content gaps by NERDC strand, and run the
 * auto-assign heuristic. DB I/O lives in the controller; this module only
 * transforms structured snapshots.
 */

const { generateInsights, clamp01, STRUGGLE } = require('./insightGenerator');

/**
 * Aggregate a list of child snapshots (each with skills/subjects/...) into
 * class-level insight rows.
 * @param {Array} childSnapshots — [{ child_admission_no, name, snapshot }]
 * @returns {Array} class insight rows
 */
function aggregateClassInsights(childSnapshots) {
  const list = Array.isArray(childSnapshots) ? childSnapshots : [];
  const rows = [];

  // Struggling students (mastery < threshold on any skill)
  const struggling = list
    .map((c) => ({
      child_admission_no: c.child_admission_no,
      name: c.name,
      skills: Array.isArray(c.snapshot.skills) ? c.snapshot.skills : [],
    }))
    .map((c) => {
      const weak = c.skills.filter((s) => clamp01(s.mastery_probability) > 0 && clamp01(s.mastery_probability) < STRUGGLE);
      return { ...c, weak };
    })
    .filter((c) => c.weak.length > 0);

  if (struggling.length > 0) {
    rows.push({
      insight_type: 'struggling',
      headline: `${struggling.length} student${struggling.length === 1 ? '' : 's'} need a little help`,
      body: 'Some students are under 40% mastery on at least one skill this week.',
      severity: struggling.length >= 5 ? 'high' : 'medium',
      meta: { count: struggling.length, students: struggling.map((s) => s.child_admission_no) },
    });
  }

  // Mastery delta (drivers of change)
  const deltas = list
    .map((c) => Number(c.snapshot.mastery_delta) || 0)
    .filter((d) => Number.isFinite(d));
  if (deltas.length > 0) {
    const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    rows.push({
      insight_type: 'mastery-delta',
      headline: avg > 0.02 ? 'Class is improving' : avg < -0.02 ? 'Class dip this week' : 'Steady week',
      body: `Average mastery change: ${(avg * 100).toFixed(1)}% this week.`,
      severity: avg < -0.02 ? 'medium' : 'info',
      meta: { avg_delta: avg },
    });
  }

  // Participation / engagement
  const participations = list.filter((c) => Number(c.snapshot.engaged) ? true : false);
  rows.push({
    insight_type: 'engagement',
    headline: `${participations.length} of ${list.length} students active this week`,
    body: `${Math.round((participations.length / Math.max(1, list.length)) * 100)}% of the class played this week.`,
    severity: participations.length === 0 ? 'high' : participations.length < list.length * 0.5 ? 'medium' : 'info',
    meta: { active: participations.length, total: list.length },
  });

  return rows;
}

/**
 * Content-gap detection: compare per-strand coverage (lessons created) to an
 * expected assignment coverage.
 * @param {Array} strandCoverage — [{ class_id, strand, coverage, expected }]
 */
function detectContentGaps(strandCoverage) {
  const list = Array.isArray(strandCoverage) ? strandCoverage : [];
  return list
    .map((s) => {
      const coverage = Number(s.coverage) || 0;
      const expected = Number(s.expected) || 0;
      const pct = expected > 0 ? coverage / expected : coverage > 0 ? 1 : 0;
      return {
        class_id: s.class_id,
        strand: s.strand,
        coverage,
        expected,
        coverage_pct: Math.round(pct * 100),
        gap: Math.max(0, expected - coverage),
        priority: pct < 0.5 ? 'high' : pct < 0.75 ? 'medium' : 'low',
      };
    })
    .filter((s) => s.gap > 0)
    .sort((a, b) => b.gap - a.gap);
}

/**
 * Auto-assign heuristic (BKT-low → matching lesson; ADE struggling → review).
 * @param {Array} recommendations — [{ child_admission_no, skill_key, lesson_id?, action }]
 * @returns {Array} assignment intents [{ child_admission_no, action, lesson_id }]
 */
function autoAssignHeuristic(recommendations) {
  const list = Array.isArray(recommendations) ? recommendations : [];
  return list
    .filter((r) => r && r.child_admission_no)
    .map((r) => ({
      child_admission_no: r.child_admission_no,
      action: r.action === 'review' ? 'review' : 'assign',
      lesson_id: r.lesson_id || null,
      skill_key: r.skill_key || null,
      href: null,
    }));
}

/**
 * Weekly class report rollup — JSON-ready summary of a class week.
 */
function weeklyReport({ class_id, week_start, students, insights, suggestions }) {
  const list = Array.isArray(students) ? students : [];
  const active = list.filter((s) => Number(s.engaged) ? true : false);
  const totalXp = list.reduce((sum, s) => sum + (Number(s.xp) || 0), 0);
  const avgScore = (() => {
    const withScore = list.filter((s) => Number(s.avg_score) || 0);
    if (withScore.length === 0) return 0;
    return Math.round(withScore.reduce((sum, s) => sum + Number(s.avg_score), 0) / withScore.length);
  })();
  return {
    class_id,
    week_start,
    report_type: 'weekly',
    students_total: list.length,
    students_active: active.length,
    participation_pct: list.length ? Math.round((active.length / list.length) * 100) : 0,
    total_xp: totalXp,
    avg_score_pct: avgScore,
    insight_count: Array.isArray(insights) ? insights.length : 0,
    suggestion_count: Array.isArray(suggestions) ? suggestions.length : 0,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  aggregateClassInsights,
  detectContentGaps,
  autoAssignHeuristic,
  weeklyReport,
};
