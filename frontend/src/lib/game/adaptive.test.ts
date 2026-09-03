import { describe, it, expect } from 'vitest';
import { levelFromXp } from './adaptive';
import { LEVELS } from '@/lib/types/adaptive';

// G4: FE LEVELS mirrors backend economyService (14 entries). These thresholds
// are the parity contract — backend is the source of truth for XP math.
describe('levelFromXp (G4 aligned 14-entry table)', () => {
  it('starts at Beginner with progress toward L2', () => {
    const info = levelFromXp(0);
    expect(info.level).toBe(1);
    expect(info.title).toBe('Beginner');
    expect(info.isMax).toBe(false);
    expect(info.progress).toBe(0);
    expect(info.nextXp).toBe(50);
  });

  it('mid-band XP resolves to the right level, not Grandmaster', () => {
    // 600 XP: past Scholar(500), before Sage(800)
    expect(levelFromXp(600)).toMatchObject({ level: 5, title: 'Scholar', isMax: false });
    // 2000 XP: past Expert(1200), before Adept(1800) → Adept at 2000? 2000>=1800 → Adept, before Virtuoso(2500)
    expect(levelFromXp(2000)).toMatchObject({ level: 8, title: 'Adept', isMax: false });
  });

  it('levels 4/6/8/9 exist after alignment', () => {
    expect(levelFromXp(350)).toMatchObject({ level: 4, title: 'Seeker' });
    expect(levelFromXp(800)).toMatchObject({ level: 6, title: 'Sage' });
    expect(levelFromXp(1800)).toMatchObject({ level: 8, title: 'Adept' });
    expect(levelFromXp(2500)).toMatchObject({ level: 9, title: 'Virtuoso' });
  });

  it('isMax only at the final threshold (regression: any xp >= next.xp_required used to show max)', () => {
    // 5000 XP must NOT be max (was the old bug: xp >= next.xp_required → Grandmaster)
    expect(levelFromXp(5000).isMax).toBe(false);
    expect(levelFromXp(5000).level).toBe(10);
    expect(levelFromXp(99999).isMax).toBe(false);
    // At/above Grandmaster threshold → max
    expect(levelFromXp(100000)).toMatchObject({ level: 30, title: 'Grandmaster', isMax: true, progress: 1 });
    expect(levelFromXp(500000).isMax).toBe(true);
  });

  it('progress stays within 0..1 across a level span', () => {
    const info = levelFromXp(1150); // between Expert(1200)? no: 1150 < 1200 → Sage(800) span 800..1200
    expect(info.level).toBe(6);
    expect(info.progress).toBeGreaterThanOrEqual(0);
    expect(info.progress).toBeLessThanOrEqual(1);
  });

  it('FE table matches the backend parity contract (levels + thresholds)', () => {
    // Backend source of truth: backend/src/services/economyService.js LEVELS
    const backendLevels: Array<[number, number, string]> = [
      [1, 0, 'Beginner'],
      [2, 50, 'Explorer'],
      [3, 150, 'Adventurer'],
      [4, 350, 'Seeker'],
      [5, 500, 'Scholar'],
      [6, 800, 'Sage'],
      [7, 1200, 'Expert'],
      [8, 1800, 'Adept'],
      [9, 2500, 'Virtuoso'],
      [10, 5000, 'Master'],
      [15, 15000, 'Champion'],
      [20, 35000, 'Legend'],
      [25, 65000, 'Hero'],
      [30, 100000, 'Grandmaster'],
    ];
    const backendCumulative = [
      0, 50, 200, 550, 1050, 1850, 3050, 4850, 7350, 12350, 47350, 122350, 247350, 447350,
    ];
    expect(LEVELS).toHaveLength(14);
    LEVELS.forEach((row, i) => {
      expect([row.level, row.xp_required, row.title]).toEqual(backendLevels[i]);
      expect(row.cumulative_xp).toBe(backendCumulative[i]);
    });
  });
});
