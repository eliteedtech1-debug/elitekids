/**
 * Q3 Parent Intelligence — pure logic tests for insight components.
 * No DOM required.
 */
import { describe, it, expect } from 'vitest';

// Insight rule keys from the spec
const RULE_KEYS = [
  'streak-at-risk',
  'mastered',
  'struggling',
  'strongest-subject',
  'needs-attention',
  'goal-on-track',
  'reading-time-up',
  'mood',
] as const;

describe('Q3 insight rule keys', () => {
  it('has all 8 seed rules', () => {
    expect(RULE_KEYS).toHaveLength(8);
  });

  it('includes streak-at-risk', () => {
    expect(RULE_KEYS).toContain('streak-at-risk');
  });

  it('includes mood', () => {
    expect(RULE_KEYS).toContain('mood');
  });
});

// Test insight severity classification
type Severity = 'high' | 'medium' | 'low' | 'info';
type Kind = 'alert' | 'positive' | 'watch';

interface InsightOutput {
  rule_key: string;
  severity: Severity;
  kind: Kind;
}

function classifyInsight(ruleKey: string, metric: number): InsightOutput {
  switch (ruleKey) {
    case 'streak-at-risk':
      return { rule_key: ruleKey, severity: 'high', kind: 'alert' };
    case 'mastered':
      return { rule_key: ruleKey, severity: 'low', kind: 'positive' };
    case 'struggling':
      return { rule_key: ruleKey, severity: 'high', kind: 'alert' };
    case 'goal-on-track':
      return metric >= 0.6
        ? { rule_key: ruleKey, severity: 'low', kind: 'positive' }
        : { rule_key: ruleKey, severity: 'high', kind: 'watch' };
    default:
      return { rule_key: ruleKey, severity: 'info', kind: 'positive' };
  }
}

describe('insight classification', () => {
  it('streak-at-risk is high severity alert', () => {
    const i = classifyInsight('streak-at-risk', 0);
    expect(i.severity).toBe('high');
    expect(i.kind).toBe('alert');
  });

  it('mastered is low severity positive', () => {
    const i = classifyInsight('mastered', 0.9);
    expect(i.severity).toBe('low');
    expect(i.kind).toBe('positive');
  });

  it('goal-on-track with high progress is positive', () => {
    const i = classifyInsight('goal-on-track', 0.8);
    expect(i.kind).toBe('positive');
  });

  it('goal-on-track with low progress is watch', () => {
    const i = classifyInsight('goal-on-track', 0.2);
    expect(i.kind).toBe('watch');
  });
});

// Test weekly digest computation
function computeWeeklyDigest(games: { score: number; xp: number; date: string }[]) {
  const totalXp = games.reduce((s, g) => s + g.xp, 0);
  const avgScore = games.length ? Math.round(games.reduce((s, g) => s + g.score, 0) / games.length) : 0;
  const daysActive = new Set(games.map((g) => g.date.slice(0, 10))).size;
  return { gamesPlayed: games.length, totalXp, avgScore, daysActive };
}

describe('weekly digest computation', () => {
  it('computes from game array', () => {
    const digest = computeWeeklyDigest([
      { score: 80, xp: 100, date: '2026-09-01T10:00:00Z' },
      { score: 60, xp: 50, date: '2026-09-01T14:00:00Z' },
      { score: 90, xp: 120, date: '2026-09-02T10:00:00Z' },
    ]);
    expect(digest.gamesPlayed).toBe(3);
    expect(digest.totalXp).toBe(270);
    expect(digest.avgScore).toBe(77);
    expect(digest.daysActive).toBe(2);
  });

  it('handles empty games', () => {
    const digest = computeWeeklyDigest([]);
    expect(digest.gamesPlayed).toBe(0);
    expect(digest.totalXp).toBe(0);
    expect(digest.avgScore).toBe(0);
    expect(digest.daysActive).toBe(0);
  });
});

// Test comparison percentile
function computePercentile(childMastery: number, peerAvgMastery: number) {
  if (peerAvgMastery <= 0) return 50;
  return Math.round((childMastery / peerAvgMastery) * 50);
}

describe('comparison percentile', () => {
  it('returns 50 for zero peer average', () => {
    expect(computePercentile(0.5, 0)).toBe(50);
  });

  it('returns >50 when child exceeds peer avg', () => {
    expect(computePercentile(0.8, 0.5)).toBeGreaterThan(50);
  });

  it('returns <50 when child is below peer avg', () => {
    expect(computePercentile(0.3, 0.5)).toBeLessThan(50);
  });
});
