/**
 * Combo Chain tracking — fire chains during boss battles.
 * Consecutive correct answers build the chain; wrong breaks it.
 */

export interface ComboState {
  current: number;
  max: number;
  rageCounter: number;    // counts toward rage activation
  rageActive: boolean;    // rage mode on (double damage)
  rageRemaining: number;  // questions left in rage mode
}

export const RAGE_THRESHOLD = 3;   // correct in a row to activate rage
export const RAGE_DURATION = 3;    // questions with double damage

export function createCombo(): ComboState {
  return { current: 0, max: 0, rageCounter: 0, rageActive: false, rageRemaining: 0 };
}

export function recordCorrect(combo: ComboState): { combo: ComboState; justRaged: boolean; damageMultiplier: number } {
  let justRaged = false;
  combo.current += 1;
  if (combo.current > combo.max) combo.max = combo.current;

  // Rage logic
  if (combo.rageActive) {
    combo.rageRemaining -= 1;
    if (combo.rageRemaining <= 0) {
      combo.rageActive = false;
      combo.rageRemaining = 0;
      combo.rageCounter = 0;
    }
  } else {
    combo.rageCounter += 1;
    if (combo.rageCounter >= RAGE_THRESHOLD) {
      combo.rageActive = true;
      combo.rageRemaining = RAGE_DURATION;
      combo.rageCounter = 0;
      justRaged = true;
    }
  }

  const damageMultiplier = combo.rageActive ? 2 : 1;
  return { combo: { ...combo }, justRaged, damageMultiplier };
}

export function recordIncorrect(combo: ComboState): { combo: ComboState; brokeChain: boolean } {
  const brokeChain = combo.current > 0;
  combo.current = 0;
  combo.rageCounter = 0;
  // Rage mode persists through wrong answers (doesn't break rage)
  return { combo: { ...combo }, brokeChain };
}

export function getComboFireLevel(current: number): number {
  if (current >= 10) return 5;
  if (current >= 7) return 4;
  if (current >= 5) return 3;
  if (current >= 3) return 2;
  if (current >= 1) return 1;
  return 0;
}
