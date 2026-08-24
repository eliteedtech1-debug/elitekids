/**
 * Dice-Roll Team Assignment — animated random team pick.
 * Used when creating tug-of-war matches.
 */

import { playDiceRoll } from './sound-effects';

export type TeamName = string;

export interface DiceRollResult {
  teamA: TeamName;
  teamB: TeamName;
  assignments: Map<string, 'A' | 'B'>;
}

const TEAM_OPTIONS: [string, string][] = [
  ['🦁 Team Lion', '🦅 Team Eagle'],
  ['🐘 Team Elephant', '🦒 Team Giraffe'],
  ['🐬 Team Dolphin', '🦈 Team Shark'],
  ['⚽ Team Kicks', '🏀 Team Hoops'],
];

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Assign students to teams with dice-roll animation.
 * Returns the assignment map and team names.
 * The animation callback fires for each student assignment.
 */
export async function diceRollAssign(
  studentAdms: string[],
  onAssign?: (adm: string, team: 'A' | 'B', index: number) => void,
): Promise<DiceRollResult> {
  const [teamA, teamB] = TEAM_OPTIONS[Math.floor(Math.random() * TEAM_OPTIONS.length)];
  const shuffled = shuffle(studentAdms);
  const assignments = new Map<string, 'A' | 'B'>();

  playDiceRoll();

  // Stagger assignments for visual effect
  for (let i = 0; i < shuffled.length; i++) {
    const team: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
    assignments.set(shuffled[i], team);
    if (onAssign) {
      onAssign(shuffled[i], team, i);
      await new Promise((r) => setTimeout(r, 80)); // 80ms between each assignment
    }
  }

  return { teamA, teamB, assignments };
}

/** Get a deterministic assignment (for reproducibility). */
export function deterministicAssign(
  studentAdms: string[],
  seed: string,
): { teamA: string; teamB: string; assignments: Map<string, 'A' | 'B'> } {
  const [teamA, teamB] = TEAM_OPTIONS[seedHashCode(seed) % TEAM_OPTIONS.length];
  const sorted = [...studentAdms].sort();
  const assignments = new Map<string, 'A' | 'B'>();
  sorted.forEach((adm, i) => {
    assignments.set(adm, i % 2 === 0 ? 'A' : 'B');
  });
  return { teamA, teamB, assignments };
}

function seedHashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
