/**
 * Milestone detection — tug-of-war rope percentage milestones.
 * When rope crosses 25%, 50%, 75%, trigger celebration.
 */

export type Milestone = 25 | 50 | 75;

const MILESTONES: Milestone[] = [25, 50, 75];

export interface MilestoneState {
  triggeredA: Set<number>;  // milestones crossed by team A
  triggeredB: Set<number>;  // milestones crossed by team B
}

export function createMilestoneState(): MilestoneState {
  return { triggeredA: new Set(), triggeredB: new Set() };
}

export function loadMilestoneState(data?: { triggeredA: number[]; triggeredB: number[] }): MilestoneState {
  return {
    triggeredA: new Set(data?.triggeredA || []),
    triggeredB: new Set(data?.triggeredB || []),
  };
}

/**
 * Check if a new milestone was just crossed.
 * Returns the milestone (25/50/75) and which team crossed it, or null.
 */
export function checkMilestone(
  ropePct: number,
  state: MilestoneState,
): { milestone: Milestone; team: 'a' | 'b' } | null {
  // Team A controls left side (0-50%), Team B controls right side (50-100%)
  // Milestone = rope crosses a threshold from A's perspective
  for (const m of MILESTONES) {
    if (ropePct >= m && !state.triggeredA.has(m)) {
      state.triggeredA.add(m);
      return { milestone: m, team: 'a' };
    }
    if (ropePct <= (100 - m) && !state.triggeredB.has(m)) {
      state.triggeredB.add(m);
      return { milestone: m, team: 'b' };
    }
  }
  return null;
}

export function getMilestoneEmoji(m: Milestone): string {
  switch (m) {
    case 25: return '🎯';
    case 50: return '⚡';
    case 75: return '🏆';
    default: return '🔥';
  }
}

export function getMilestoneText(m: Milestone, teamName: string): string {
  switch (m) {
    case 25: return `${teamName} takes the lead!`;
    case 50: return `${teamName} is dominating!`;
    case 75: return `${teamName} is almost there!`;
    default: return '';
  }
}
