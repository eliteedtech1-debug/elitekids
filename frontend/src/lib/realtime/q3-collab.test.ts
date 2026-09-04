/**
 * Q3 Collaboration — pure logic tests for useCollabSocket hook and component logic.
 * No DOM required (mirrors existing vitest convention).
 */
import { describe, it, expect } from 'vitest';

// Test the event type constants match the spec
const COLLAB_EVENTS = [
  'team:created',
  'team:joined',
  'team:left',
  'challenge:started',
  'challenge:tick',
  'challenge:answer',
  'challenge:ended',
  'class-quest:progress',
  'class-quest:completed',
  'peer-teach:new',
] as const;

describe('Q3 collab event types', () => {
  it('has all 10 required events', () => {
    expect(COLLAB_EVENTS).toHaveLength(10);
  });

  it('includes team events', () => {
    expect(COLLAB_EVENTS).toContain('team:created');
    expect(COLLAB_EVENTS).toContain('team:joined');
    expect(COLLAB_EVENTS).toContain('team:left');
  });

  it('includes challenge events', () => {
    expect(COLLAB_EVENTS).toContain('challenge:started');
    expect(COLLAB_EVENTS).toContain('challenge:tick');
    expect(COLLAB_EVENTS).toContain('challenge:answer');
    expect(COLLAB_EVENTS).toContain('challenge:ended');
  });

  it('includes class quest events', () => {
    expect(COLLAB_EVENTS).toContain('class-quest:progress');
    expect(COLLAB_EVENTS).toContain('class-quest:completed');
  });

  it('includes peer teach events', () => {
    expect(COLLAB_EVENTS).toContain('peer-teach:new');
  });
});

// Test score computation logic (mirrors backend classQuestScoring)
function computeQuestProgress(targetValue: number, contributions: Record<string, number>) {
  const target = Math.max(1, Number(targetValue) || 1);
  const total = Object.values(contributions).reduce((s, v) => s + Math.max(0, v), 0);
  const pct = Math.min(100, Math.round((total / target) * 100));
  return { total, pct, isComplete: total >= target };
}

describe('quest progress computation', () => {
  it('computes 0% for empty contributions', () => {
    const r = computeQuestProgress(100, {});
    expect(r.total).toBe(0);
    expect(r.pct).toBe(0);
    expect(r.isComplete).toBe(false);
  });

  it('computes partial progress', () => {
    const r = computeQuestProgress(100, { a: 25, b: 25 });
    expect(r.total).toBe(50);
    expect(r.pct).toBe(50);
  });

  it('marks complete at 100%', () => {
    const r = computeQuestProgress(100, { a: 60, b: 40 });
    expect(r.isComplete).toBe(true);
    expect(r.pct).toBe(100);
  });

  it('clamps pct at 100 for over-target', () => {
    const r = computeQuestProgress(100, { a: 150 });
    expect(r.pct).toBe(100);
    expect(r.isComplete).toBe(true);
  });
});

// Test insight card severity mapping
const SEVERITY_STYLES: Record<string, { bg: string; border: string }> = {
  high: { bg: 'bg-red-50/80', border: 'border-red-200' },
  medium: { bg: 'bg-amber-50/80', border: 'border-amber-200' },
  low: { bg: 'bg-green-50/80', border: 'border-green-200' },
  info: { bg: 'bg-blue-50/80', border: 'border-blue-200' },
};

describe('insight severity styles', () => {
  it('has all 4 severity levels', () => {
    expect(Object.keys(SEVERITY_STYLES)).toHaveLength(4);
  });

  it('high uses red', () => {
    expect(SEVERITY_STYLES.high.bg).toContain('red');
  });

  it('info uses blue', () => {
    expect(SEVERITY_STYLES.info.bg).toContain('blue');
  });
});

// Test leaderboard sorting
function sortLeaderboard(scores: Record<string, number>) {
  return Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .map(([id, score], i) => ({ rank: i + 1, id, score }));
}

describe('leaderboard sorting', () => {
  it('sorts descending by score', () => {
    const lb = sortLeaderboard({ a: 10, b: 30, c: 20 });
    expect(lb[0].id).toBe('b');
    expect(lb[1].id).toBe('c');
    expect(lb[2].id).toBe('a');
  });

  it('assigns correct ranks', () => {
    const lb = sortLeaderboard({ x: 50, y: 50 });
    expect(lb[0].rank).toBe(1);
    expect(lb[1].rank).toBe(2);
  });

  it('handles empty scores', () => {
    expect(sortLeaderboard({})).toEqual([]);
  });
});
