/**
 * Power-Up system — earned from practice, used in boss battles.
 * Stored in localStorage per child.
 */

export type PowerUpType = 'hint' | 'double_strike' | 'shield';

export interface PowerUp {
  type: PowerUpType;
  earned_at: number;
  used: boolean;
}

export interface PowerUpBank {
  hint: number;        // count of unused hint charms
  double_strike: number;
  shield: number;
}

const STORAGE_KEY = 'elitekids_powerups';

function getRaw(): Record<string, PowerUp[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveRaw(data: Record<string, PowerUp[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Award power-ups after a practice session with score >= threshold. */
export function awardPowerUps(childAdmissionNo: string, practiceScore: number): PowerUpType[] {
  if (practiceScore < 80) return []; // must score ≥80% to earn
  const data = getRaw();
  if (!data[childAdmissionNo]) data[childAdmissionNo] = [];

  const earned: PowerUpType[] = [];
  // Score 80-89: 1 hint; 90-99: hint + shield; 100: hint + shield + double_strike
  if (practiceScore >= 80) earned.push('hint');
  if (practiceScore >= 90) earned.push('shield');
  if (practiceScore >= 100) earned.push('double_strike');

  for (const type of earned) {
    data[childAdmissionNo].push({ type, earned_at: Date.now(), used: false });
  }
  saveRaw(data);
  return earned;
}

/** Get available (unused) power-ups. */
export function getAvailable(childAdmissionNo: string): PowerUpBank {
  const data = getRaw();
  const items = (data[childAdmissionNo] || []).filter((p) => !p.used);
  return {
    hint: items.filter((p) => p.type === 'hint').length,
    double_strike: items.filter((p) => p.type === 'double_strike').length,
    shield: items.filter((p) => p.type === 'shield').length,
  };
}

/** Use one power-up. Returns true if successful. */
export function usePowerUp(childAdmissionNo: string, type: PowerUpType): boolean {
  const data = getRaw();
  const items = data[childAdmissionNo] || [];
  const pu = items.find((p) => p.type === type && !p.used);
  if (!pu) return false;
  pu.used = true;
  saveRaw(data);
  return true;
}

/** Get total power-ups (used + unused) for stats. */
export function getAll(childAdmissionNo: string): PowerUp[] {
  const data = getRaw();
  return data[childAdmissionNo] || [];
}
