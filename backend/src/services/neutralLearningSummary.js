'use strict';

/**
 * No-LLM summary builder for the practical-first rollout. It deliberately
 * keeps digital and teacher evidence separate and frames the next action from
 * the most recent observation.
 */

const FORBIDDEN = /\b(weak|stupid|dumb|delayed|gifted|below peers|behind|diagnos(?:is|ed)|intelligence quotient|iq)\b/i;

function safeText(value) {
  const text = String(value || '').trim();
  return FORBIDDEN.test(text) ? '[Teacher note withheld from summary]' : text;
}

function buildNeutralLearningSummary({ bridge = null, digital = {}, observations = [] } = {}) {
  const latest = [...(Array.isArray(observations) ? observations : [])]
    .sort((a, b) => new Date(b.observed_at || b.createdAt || 0) - new Date(a.observed_at || a.createdAt || 0))[0] || null;
  const teacherEvidence = latest ? {
    observed_at: latest.observed_at || latest.createdAt || null,
    observation_level: latest.observation_level,
    response_route: latest.response_route,
    prompt_level: latest.prompt_level,
    context: latest.context || null,
    what_was_seen: safeText(latest.note),
    next_step: safeText(latest.next_step),
  } : null;

  return {
    child_display_name: 'A child',
    outcome: bridge ? { id: bridge.outcome_id, objective: safeText(bridge.objective) } : null,
    digital_evidence: {
      sessions: Number(digital.sessions) || 0,
      games_played: Number(digital.games_played) || 0,
      attempt_count: Number(digital.attempt_count) || 0,
      last_played_at: digital.last_played_at || null,
    },
    teacher_evidence: teacherEvidence,
    next_opportunity: teacherEvidence?.next_step || safeText(bridge?.transfer_activity || bridge?.home_connection) || null,
    language_rules: {
      relative_to_own_history: true,
      peer_comparison: false,
      diagnostic_label: false,
      composite_score: false,
    },
  };
}

module.exports = { FORBIDDEN, buildNeutralLearningSummary };
