import { describe, it, expect } from 'vitest';
import {
  DECOR_META,
  MAX_COMPACT_DECORATIONS,
  sanitizeDecorations,
} from './garden';

describe('garden decorations (G5)', () => {
  it('covers every seeded shop decoration item', () => {
    expect(Object.keys(DECOR_META).sort()).toEqual(
      ['garden_flower_bed', 'garden_fountain', 'garden_gazebo'].sort(),
    );
  });

  it('keeps only known decoration ids', () => {
    const equipped = {
      garden_decoration: { id: 'garden_fountain' },
      companion_skin: { id: 'skin_blue_fox' }, // not a decoration
      theme: { id: 'theme_ocean' }, // not a decoration
    };
    expect(sanitizeDecorations(equipped)).toEqual(['garden_fountain']);
  });

  it('ignores unknown or renamed decoration ids', () => {
    const equipped = {
      garden_decoration: { id: 'garden_does_not_exist' },
    };
    expect(sanitizeDecorations(equipped)).toEqual([]);
  });

  it('drops duplicates and respects the compact cap', () => {
    const equipped = {
      garden_decoration: { id: 'garden_flower_bed' },
      another_garden_decoration: { id: 'garden_flower_bed' },
      third_garden_decoration: { id: 'garden_gazebo' },
    };
    expect(sanitizeDecorations(equipped)).toEqual(['garden_flower_bed', 'garden_gazebo']);
    expect(MAX_COMPACT_DECORATIONS).toBe(3);
  });

  it('tolerates missing/empty input', () => {
    expect(sanitizeDecorations(undefined)).toEqual([]);
    expect(sanitizeDecorations(null)).toEqual([]);
    expect(sanitizeDecorations({})).toEqual([]);
  });
});
