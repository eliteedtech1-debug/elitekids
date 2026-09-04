/**
 * Q3 Teacher AI — pure logic tests for teacher assistant components.
 * No DOM required.
 */
import { describe, it, expect } from 'vitest';

// Test class insight aggregation logic
interface StudentSnapshot {
  child_admission_no: string;
  name: string;
  skills: { skill_key: string; mastery_probability: number; total_attempts: number }[];
  engaged?: boolean;
}

function aggregateStruggling(students: StudentSnapshot[], threshold = 0.4) {
  return students.filter((s) =>
    s.skills.some((sk) => sk.mastery_probability > 0 && sk.mastery_probability < threshold)
  );
}

function computeEngagement(students: StudentSnapshot[]) {
  const active = students.filter((s) => s.engaged).length;
  return {
    active,
    total: students.length,
    pct: students.length ? Math.round((active / students.length) * 100) : 0,
  };
}

describe('teacher insight aggregation', () => {
  const students: StudentSnapshot[] = [
    { child_admission_no: 'a', name: 'Ada', skills: [{ skill_key: 'math', mastery_probability: 0.3, total_attempts: 2 }], engaged: true },
    { child_admission_no: 'b', name: 'Bola', skills: [{ skill_key: 'math', mastery_probability: 0.9, total_attempts: 1 }], engaged: true },
    { child_admission_no: 'c', name: 'Chidi', skills: [{ skill_key: 'math', mastery_probability: 0.2, total_attempts: 3 }], engaged: false },
  ];

  it('flags struggling students below threshold', () => {
    const struggling = aggregateStruggling(students);
    expect(struggling).toHaveLength(2);
    expect(struggling.map((s) => s.child_admission_no)).toContain('a');
    expect(struggling.map((s) => s.child_admission_no)).toContain('c');
  });

  it('does not flag students above threshold', () => {
    const struggling = aggregateStruggling(students);
    expect(struggling.map((s) => s.child_admission_no)).not.toContain('b');
  });

  it('computes engagement correctly', () => {
    const eng = computeEngagement(students);
    expect(eng.active).toBe(2);
    expect(eng.total).toBe(3);
    expect(eng.pct).toBe(67);
  });

  it('handles empty student list', () => {
    expect(aggregateStruggling([])).toEqual([]);
    expect(computeEngagement([]).pct).toBe(0);
  });
});

// Test content gap detection
interface StrandCoverage {
  strand: string;
  coverage: number;
  expected: number;
}

function detectGaps(strands: StrandCoverage[]) {
  return strands
    .map((s) => ({
      ...s,
      gap: Math.max(0, s.expected - s.coverage),
      priority: s.coverage / s.expected < 0.5 ? 'high' : s.coverage / s.expected < 0.75 ? 'medium' : 'low',
    }))
    .filter((s) => s.gap > 0)
    .sort((a, b) => b.gap - a.gap);
}

describe('content gap detection', () => {
  it('detects gaps with priority', () => {
    const gaps = detectGaps([
      { strand: 'Numbers', coverage: 2, expected: 10 },
      { strand: 'Letters', coverage: 9, expected: 10 },
    ]);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].strand).toBe('Numbers');
    expect(gaps[0].priority).toBe('high');
    expect(gaps[1].priority).toBe('low');
  });

  it('excludes fully covered strands', () => {
    const gaps = detectGaps([{ strand: 'Colors', coverage: 12, expected: 10 }]);
    expect(gaps).toEqual([]);
  });
});

// Test weekly report rollup
function weeklyReport(students: { engaged: boolean; xp: number; avg_score: number }[]) {
  const active = students.filter((s) => s.engaged).length;
  const totalXp = students.reduce((s, st) => s + st.xp, 0);
  const withScore = students.filter((s) => s.avg_score > 0);
  const avgScore = withScore.length
    ? Math.round(withScore.reduce((s, st) => s + st.avg_score, 0) / withScore.length)
    : 0;
  return {
    total: students.length,
    active,
    participationPct: students.length ? Math.round((active / students.length) * 100) : 0,
    totalXp,
    avgScore,
  };
}

describe('weekly report rollup', () => {
  it('computes correct rollup', () => {
    const r = weeklyReport([
      { engaged: true, xp: 100, avg_score: 80 },
      { engaged: true, xp: 50, avg_score: 60 },
      { engaged: false, xp: 0, avg_score: 0 },
    ]);
    expect(r.total).toBe(3);
    expect(r.active).toBe(2);
    expect(r.participationPct).toBe(67);
    expect(r.totalXp).toBe(150);
    expect(r.avgScore).toBe(70);
  });

  it('handles empty students', () => {
    const r = weeklyReport([]);
    expect(r.total).toBe(0);
    expect(r.participationPct).toBe(0);
  });
});

// Test auto-assign intent mapping
interface AssignIntent {
  child_admission_no: string;
  skill_key: string;
  action: 'assign' | 'review';
  lesson_id?: string;
}

function mapAssignIntents(intents: AssignIntent[]) {
  return intents
    .filter((i) => i.child_admission_no)
    .map((i) => ({
      child_admission_no: i.child_admission_no,
      action: i.action === 'review' ? 'review' : 'assign',
      lesson_id: i.lesson_id || null,
    }));
}

describe('auto-assign intent mapping', () => {
  it('maps intents correctly', () => {
    const result = mapAssignIntents([
      { child_admission_no: 'a', skill_key: 'math', action: 'assign', lesson_id: 'l1' },
      { child_admission_no: 'b', skill_key: 'phonics', action: 'review' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe('assign');
    expect(result[0].lesson_id).toBe('l1');
    expect(result[1].action).toBe('review');
    expect(result[1].lesson_id).toBeNull();
  });

  it('drops entries without child_admission_no', () => {
    expect(mapAssignIntents([{ child_admission_no: '', skill_key: 'x', action: 'assign' }])).toEqual([]);
  });
});
