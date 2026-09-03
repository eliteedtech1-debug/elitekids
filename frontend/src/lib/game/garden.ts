// Q1 G5: Equipped garden decorations → rendering helpers.
// Pure module (no imports) so it is unit-testable without component mocks.
// Mirrors the Shop.tsx SKIN_META / THEME_HEADER pattern for companion skins
// and themes. Item ids mirror backend/src/services/shopService.js DEFAULT_ITEMS.

export interface EquippedDecoration {
  id: string;
  name?: string;
  [key: string]: unknown;
}

/** decoration id → emoji + emoji size class for the garden scene. */
export const DECOR_META: Record<string, { emoji: string; sizeClass: string }> = {
  garden_flower_bed: { emoji: '🌺', sizeClass: 'text-base' },
  garden_fountain: { emoji: '⛲', sizeClass: 'text-lg' },
  garden_gazebo: { emoji: '⛱️', sizeClass: 'text-lg' },
};

/** Max decorations rendered in the compact scene strip. */
export const MAX_COMPACT_DECORATIONS = 3;

/**
 * Keep only known decoration ids, drop duplicates, cap at `max`.
 * StudentHome's equipped map is keyed by item TYPE (e.g. 'garden_decoration'),
 * so iterate the map values and validate each value's id against DECOR_META.
 * Unknown/renamed ids are ignored rather than rendered as fallback emoji.
 */
export function sanitizeDecorations(
  equipped: Record<string, any> | undefined | null,
  max: number = MAX_COMPACT_DECORATIONS,
): string[] {
  if (!equipped) return [];
  const seen = new Set<string>();
  for (const item of Object.values(equipped)) {
    const id = (item as EquippedDecoration | null | undefined)?.id;
    if (typeof id === 'string' && DECOR_META[id] && !seen.has(id)) {
      seen.add(id);
      if (seen.size >= max) break;
    }
  }
  return [...seen];
}
