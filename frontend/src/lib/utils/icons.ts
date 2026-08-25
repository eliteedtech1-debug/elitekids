/**
 * Icon/image mapping for game items — emoji-first with open-source images.
 * Uses Twemoji CDN (https://github.com/twitter/twemoji — CC-BY 4.0).
 *
 * Fallback chain: image URL → emoji → text label
 */

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

// ── Animal emojis + images ─────────────────────────────────

const ANIMAL_ICONS: Record<string, { emoji: string; codepoint: string }> = {
  cow:     { emoji: '🐄', codepoint: '1f404' },
  cat:     { emoji: '🐱', codepoint: '1f431' },
  dog:     { emoji: '🐶', codepoint: '1f436' },
  duck:    { emoji: '🦆', codepoint: '1f986' },
  pig:     { emoji: '🐷', codepoint: '1f437' },
  chicken: { emoji: '🐔', codepoint: '1f414' },
  horse:   { emoji: '🐴', codepoint: '1f434' },
  sheep:   { emoji: '🐑', codepoint: '1f411' },
  goat:    { emoji: '🐐', codepoint: '1f410' },
  rabbit:  { emoji: '🐰', codepoint: '1f430' },
  fish:    { emoji: '🐟', codepoint: '1f41f' },
  bird:    { emoji: '🐦', codepoint: '1f426' },
  lion:    { emoji: '🦁', codepoint: '1f981' },
  elephant:{ emoji: '🐘', codepoint: '1f418' },
  monkey:  { emoji: '🐵', codepoint: '1f435' },
  bear:    { emoji: '🐻', codepoint: '1f43b' },
  tiger:   { emoji: '🐯', codepoint: '1f42f' },
  zebra:   { emoji: '🦓', codepoint: '1f993' },
  giraffe: { emoji: '🦒', codepoint: '1f992' },
  frog:    { emoji: '🐸', codepoint: '1f438' },
  turtle:  { emoji: '🐢', codepoint: '1f422' },
  snake:   { emoji: '🐍', codepoint: '1f40d' },
  butterfly:{ emoji: '🦋', codepoint: '1f98b' },
  bee:     { emoji: '🐝', codepoint: '1f41d' },
  ant:     { emoji: '🐜', codepoint: '1f41c' },
  spider:  { emoji: '🕷️', codepoint: '1f577' },
  whale:   { emoji: '🐳', codepoint: '1f433' },
  dolphin: { emoji: '🐬', codepoint: '1f42c' },
  shark:   { emoji: '🦈', codepoint: '1f988' },
  penguin: { emoji: '🐧', codepoint: '1f427' },
  owl:     { emoji: '🦉', codepoint: '1f989' },
  peacock: { emoji: '🦚', codepoint: '1f99a' },
  fox:     { emoji: '🦊', codepoint: '1f98a' },
  wolf:    { emoji: '🐺', codepoint: '1f43a' },
};

// ── Fruit/food emojis + images ─────────────────────────────

const FOOD_ICONS: Record<string, { emoji: string; codepoint: string }> = {
  apple:      { emoji: '🍎', codepoint: '1f34e' },
  banana:     { emoji: '🍌', codepoint: '1f34c' },
  orange:     { emoji: '🍊', codepoint: '1f34a' },
  grapes:     { emoji: '🍇', codepoint: '1f347' },
  strawberry: { emoji: '🍓', codepoint: '1f353' },
  watermelon: { emoji: '🍉', codepoint: '1f349' },
  pineapple:  { emoji: '🍍', codepoint: '1f34d' },
  mango:      { emoji: '🥭', codepoint: '1f96d' },
  peach:      { emoji: '🍑', codepoint: '1f351' },
  cherry:     { emoji: '🍒', codepoint: '1f352' },
  lemon:      { emoji: '🍋', codepoint: '1f34b' },
  coconut:    { emoji: '🥥', codepoint: '1f965' },
  tomato:     { emoji: '🍅', codepoint: '1f345' },
  carrot:     { emoji: '🥕', codepoint: '1f955' },
  corn:       { emoji: '🌽', codepoint: '1f33d' },
  broccoli:   { emoji: '🥦', codepoint: '1f966' },
  potato:     { emoji: '🥔', codepoint: '1f954' },
  onion:      { emoji: '🧅', codepoint: '1f9c5' },
  eggplant:   { emoji: '🍆', codepoint: '1f346' },
  bread:      { emoji: '🍞', codepoint: '1f35e' },
};

// ── Shape emojis + images ──────────────────────────────────

const SHAPE_ICONS: Record<string, { emoji: string; codepoint: string }> = {
  circle:   { emoji: '⭕', codepoint: '2b55' },
  square:   { emoji: '⬜', codepoint: '2b1c' },
  triangle: { emoji: '🔺', codepoint: '1f53a' },
  star:     { emoji: '⭐', codepoint: '2b50' },
  heart:    { emoji: '❤️', codepoint: '2764' },
  diamond:  { emoji: '💎', codepoint: '1f48e' },
  crescent: { emoji: '🌙', codepoint: '1f319' },
  sun:      { emoji: '☀️', codepoint: '2600' },
  cloud:    { emoji: '☁️', codepoint: '2601' },
  rainbow:  { emoji: '🌈', codepoint: '1f308' },
  flower:   { emoji: '🌸', codepoint: '1f338' },
  leaf:     { emoji: '🍃', codepoint: '1f343' },
};

// ── Color swatches (CSS backgrounds) ─────────────────────

const COLOR_HEX: Record<string, string> = {
  red: '#FF3B30', blue: '#007AFF', yellow: '#FFCC00', green: '#34C759',
  orange: '#FF9500', purple: '#AF52DE', pink: '#FF2D55', brown: '#A2845E',
  black: '#1C1C1E', white: '#F2F2F7', gray: '#8E8E93', grey: '#8E8E93',
};

// ── Number emojis ─────────────────────────────────────────

// Keycap emojis: digit + FE0F + U+20E3 (Twemoji file "3X-20e3.png"); 🔟 = 1f51f
const NUMBER_ICONS: Record<number, { emoji: string; codepoint: string }> = {
  1: { emoji: '1️⃣', codepoint: '31-20e3' },
  2: { emoji: '2️⃣', codepoint: '32-20e3' },
  3: { emoji: '3️⃣', codepoint: '33-20e3' },
  4: { emoji: '4️⃣', codepoint: '34-20e3' },
  5: { emoji: '5️⃣', codepoint: '35-20e3' },
  6: { emoji: '6️⃣', codepoint: '36-20e3' },
  7: { emoji: '7️⃣', codepoint: '37-20e3' },
  8: { emoji: '8️⃣', codepoint: '38-20e3' },
  9: { emoji: '9️⃣', codepoint: '39-20e3' },
  10: { emoji: '🔟', codepoint: '1f51f' },
};

// ── Generic lookups ────────────────────────────────────────

function findIcon(text: string): { emoji: string; codepoint: string } | null {
  const lower = text.toLowerCase();
  for (const map of [ANIMAL_ICONS, FOOD_ICONS, SHAPE_ICONS]) {
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key)) return val;
    }
  }
  return null;
}

function findColorHex(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [name, hex] of Object.entries(COLOR_HEX)) {
    if (lower.includes(name)) return hex;
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────

export interface ItemVisual {
  emoji: string;
  imageUrl: string | null;
  label: string;
  color: string | null;
  type: 'image' | 'emoji' | 'color-swatch' | 'text';
}

/**
 * Get the best visual representation for a game item.
 * Fallback chain: image URL → emoji → color swatch → text label
 */
export function getItemVisual(label: string, providedHex?: string): ItemVisual {
  const clean = label.replace(/[^\w\s]/g, '').trim();

  // If a hex color was explicitly provided, show a color swatch
  if (providedHex) {
    return { emoji: '', imageUrl: null, label: clean, color: providedHex, type: 'color-swatch' };
  }

  // Try to find an icon with image URL
  const icon = findIcon(clean);
  if (icon) {
    return {
      emoji: icon.emoji,
      imageUrl: `${TWEMOJI_CDN}/${icon.codepoint}.png`,
      label: clean,
      color: null,
      type: 'image',
    };
  }

  // Try to find a color from the text
  const hex = findColorHex(clean);
  if (hex) {
    return { emoji: '', imageUrl: null, label: clean, color: hex, type: 'color-swatch' };
  }

  // Fallback: text only
  return { emoji: '', imageUrl: null, label: clean, color: null, type: 'text' };
}

/**
 * Get a numbered emoji for drag-sort items.
 */
export function getNumberEmoji(num: number): string {
  return NUMBER_ICONS[num]?.emoji || `${num}`;
}

/**
 * Get image URL for a number.
 */
export function getNumberImageUrl(num: number): string | null {
  return NUMBER_ICONS[num] ? `${TWEMOJI_CDN}/${NUMBER_ICONS[num].codepoint}.png` : null;
}

export { ANIMAL_ICONS, FOOD_ICONS, SHAPE_ICONS, COLOR_HEX, TWEMOJI_CDN };
