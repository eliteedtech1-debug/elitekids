'use strict';

/**
 * Q3 Parent Intelligence — deterministic rule-based insight engine.
 *
 * 8 seed rules (no LLM in v1 — child-safe, warm, deterministic):
 *   1. streak-at-risk      — lastPlayDate == yesterday && current streak >= 3
 *   2. mastered            — mastery_probability >= 0.85 for any skill
 *   3. struggling          — mastery_probability < 0.40 for 2+ sessions
 *   4. strongest-subject   — argmax(my mastery) over the week
 *   5. needs-attention     — subject flat mastery for 2+ weeks
 *   6. goal-on-track       — goal done/target projection vs week remaining
 *   7. reading-time-up     — session_duration_ms delta week-over-week
 *   8. mood                — engaged/bored heuristic from frequency + accuracy
 *
 * All helpers are PURE: they take a snapshot object (child data for a week)
 * and return insight rows. No DB access.
 */

const MASTERED = 0.85;
const STRUGGLE = 0.40;

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Round a Date/string to 'YYYY-MM-DD' UTC. */
function toDay(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return null;
  const p = String(d.getUTCDate()).padStart(2, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${p}`;
}

/** 1. Streak at risk — played yesterday, hasn't played today. */
function streakAtRisk({ streak }) {
  if (!streak) return [];
  const current = Number(streak.current) || 0;
  if (current < 3) return [];
  const last = toDay(streak.lastPlayDate || streak.last_play_date);
  if (!last) return [];

  const now = toDay(new Date());
  const yesterday = toDay(new Date(Date.now() - 86400000));
  const todayMasked = streak.played_today === true || streak.played_today === 1;

  if (last === yesterday && !todayMasked) {
    return [{
      rule_key: 'streak-at-risk',
      title: 'Streak at risk',
      body: `${current}-day streak! Play today to keep it going.`,
      severity: 'high',
      kind: 'alert',
      meta: { current: current, lastPlayDate: last },
    }];
  }
  return [];
}

/** 2. Mastered — any skill at/above mastery threshold. */
function mastered({ skills }) {
  const list = Array.isArray(skills) ? skills : [];
  const out = [];
  for (const s of list) {
    if (clamp01(s.mastery_probability) >= MASTERED) {
      out.push({
        rule_key: 'mastered',
        title: `Mastered: ${s.skill_key || 'a skill'}`,
        body: `We think this one is fully learned now. Great job!`,
        severity: 'low',
        kind: 'positive',
        meta: { skill_key: s.skill_key, mastery_probability: s.mastery_probability },
      });
    }
  }
  return out;
}

/** 3. Struggling — mastery < 0.40 with 2+ sessions in a week. */
function struggling({ skills }) {
  const list = Array.isArray(skills) ? skills : [];
  const out = [];
  for (const s of list) {
    const mp = clamp01(s.mastery_probability);
    const sessions = Number(s.sessions_this_week || s.total_attempts) || 0;
    if (mp > 0 && mp < STRUGGLE && sessions >= 2) {
      out.push({
        rule_key: 'struggling',
        title: `Needs a little help: ${s.skill_key || 'this skill'}`,
        body: 'Practice together and try again — every try counts.',
        severity: 'high',
        kind: 'alert',
        meta: { skill_key: s.skill_key, mastery_probability: mp, sessions: sessions },
      });
    }
  }
  return out;
}

/** 4. Strongest subject — argmax mastery across subject-average keys. */
function strongestSubject({ subjects }) {
  const list = Array.isArray(subjects) ? subjects : [];
  if (list.length === 0) return [];
  const best = list.reduce((a, b) => (clamp01(b.mastery) > clamp01(a.mastery) ? b : a), list[0]);
  if (clamp01(best.mastery) <= 0) return [];
  return [{
    rule_key: 'strongest-subject',
    title: `Strongest subject: ${best.subject || 'this subject'}`,
    body: `Your child shines here this week!`,
    severity: 'info',
    kind: 'positive',
    meta: { subject: best.subject, mastery: clamp01(best.mastery) },
  }];
}

/** 5. Needs attention — subject flat mastery (no change) for 2+ weeks. */
function needsAttention({ subjects }) {
  const list = Array.isArray(subjects) ? subjects : [];
  const out = [];
  for (const s of list) {
    const change = Number(s.weeks_change) || 0;
    if (s.flat_weeks >= 2 && clamp01(s.mastery) > 0) {
      out.push({
        rule_key: 'needs-attention',
        title: `A little encouragement: ${s.subject || 'this subject'}`,
        body: 'Learning can slow sometimes. A fun game together helps!',
        severity: 'medium',
        kind: 'watch',
        meta: { subject: s.subject, flat_weeks: s.flat_weeks, change: change },
      });
    }
  }
  return out;
}

/** 6. Goal on track — done/target vs week remaining. */
function goalOnTrack({ goal }) {
  if (!goal) return [];
  const target = Math.max(1, Number(goal.target) || 1);
  const done = Math.max(0, Number(goal.done) || 0);
  const pct = done / target;
  const onTrack = pct >= 0.6 ? 'on track' : pct >= 0.3 ? 'getting there' : 'needs a push';
  return [{
    rule_key: 'goal-on-track',
    title: `Weekly goal: ${onTrack}`,
    body: `${done} of ${target} games done this week.`,
    severity: pct >= 0.6 ? 'low' : pct >= 0.3 ? 'medium' : 'high',
    kind: pct >= 0.6 ? 'positive' : 'watch',
    meta: { done, target, pct: Math.round(pct * 100) },
  }];
}

/** 7. Reading time up — session duration delta week-over-week. */
function readingTimeUp({ reading }) {
  if (!reading) return [];
  const delta = Number(reading.delta_ms_week_over_week) || 0;
  const percent = Number(reading.percent_change) || 0;
  if (delta > 0) {
    return [{
      rule_key: 'reading-time-up',
      title: 'Reading time is up',
      body: `Nice increase in learning time this week (${Math.round(delta / 60000)} min).`,
      severity: 'low',
      kind: 'positive',
      meta: { delta_ms: delta, percent_change: percent },
    }];
  }
  return [];
}

/** 8. Mood — engaged/bored heuristic from frequency + accuracy. */
function mood({ engagement }) {
  if (!engagement) return [];
  const frequency = Number(engagement.frequency) || 0;
  const accuracy = Number(engagement.accuracy_pct) || 0;
  const engaged = frequency >= 3 && accuracy >= 60;
  return [{
    rule_key: 'mood',
    title: engaged ? 'Looks engaged' : 'A little quiet this week',
    body: engaged
      ? 'Learning feels fun and steady. Keep it up!'
      : 'Fewer games this week — sometimes breaks help, then we come back.',
    severity: engaged ? 'low' : 'medium',
    kind: engaged ? 'positive' : 'watch',
    meta: { engagement_score: Math.max(0, frequency) },
  }];
}

/**
 * Run all 8 rules over a child snapshot.
 * @param {Object} snapshot — { streak, skills[], subjects[], goal, reading, engagement }
 * @returns {Array} insight rows (rule_key, title, body, severity, kind, meta, week_start)
 */
function generateInsights(snapshot, { week_start = toDay(new Date()) } = {}) {
  const rules = [
    streakAtRisk,
    mastered,
    struggling,
    strongestSubject,
    needsAttention,
    goalOnTrack,
    readingTimeUp,
    mood,
  ];
  const insights = [];
  for (const rule of rules) {
    const rows = rule(snapshot || {});
    for (const r of rows) {
      insights.push({ ...r, week_start });
    }
  }
  return insights;
}

/** Deterministic rule registry (for tests + teacher rollups). */
const RULES = {
  'streak-at-risk': streakAtRisk,
  mastered,
  struggling,
  'strongest-subject': strongestSubject,
  'needs-attention': needsAttention,
  'goal-on-track': goalOnTrack,
  'reading-time-up': readingTimeUp,
  mood,
};

module.exports = {
  generateInsights,
  RULES,
  clamp01,
  toDay,
  MASTERED,
  STRUGGLE,
};
