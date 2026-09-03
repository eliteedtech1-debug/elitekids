/**
 * Illustrated scene scripts — normalizer + library helpers (L2-FE Phase 3).
 *
 * Legacy AI-generated scene cards were `{id, sceneId|id, text|narrationText,
 * sceneType|type}`. Canonical v2 cards (scene-script.schema.json) add
 * background / image / characters / narrationAudio / durationSec / transition
 * / subtitles / gameId and use `type` + `text` + `id`. The storage layer is
 * pass-through, so this module NORMALIZES at render/edit time.
 *
 * All functions are pure (no React/browser), so vitest covers the legacy → v2
 * fallback chain and the visual-story detection without a DOM.
 */

export type SceneType = 'intro' | 'teach' | 'reinforce' | 'recap' | 'game_checkpoint';

export const SCENE_TYPES: SceneType[] = ['intro', 'teach', 'reinforce', 'recap', 'game_checkpoint'];

export const SCENE_TRANSITIONS = ['fade', 'slide', 'none'] as const;
export type SceneTransition = (typeof SCENE_TRANSITIONS)[number];

export interface SceneCharacter {
  name: string;
  emoji?: string;
  image?: string | null;
  /** Key into the approved character library, e.g. buddy-the-fox. */
  rigId?: string;
  animation?: string;
  position?: 'left' | 'center' | 'right';
}

/** Canonical v2 card (post-normalization). */
export interface NormalizedScene {
  id: string;
  type: SceneType;
  text: string;
  image?: string;
  background?: string;
  characters?: SceneCharacter[];
  narrationAudio?: string | null;
  durationSec?: number;
  transition?: SceneTransition;
  subtitles: boolean;
  gameId?: string;
  /** true when the card came from a legacy shape (text-only). */
  legacy: boolean;
}

/** Any stored card (legacy or v2) — the normalizer accepts both. */
export type RawScene = Record<string, any>;

/** Approved library payload from GET /kids/scene-library. */
export interface SceneLibrary {
  backgrounds?: { key: string; label: string; emoji: string; palette?: string[]; tags?: string[] }[];
  characters?: { key: string; name: string; emoji: string; defaultAnimation?: string; defaultPosition?: string; tags?: string[] }[];
  transitions?: { key: string; label: string }[];
}

export const DEFAULT_BACKGROUNDS: NonNullable<SceneLibrary['backgrounds']> = [
  { key: 'farm-daytime', label: 'Farm — daytime', emoji: '🌾', palette: ['#a8e063', '#56ab2f'] },
  { key: 'classroom', label: 'Classroom', emoji: '🏫', palette: ['#fdfbfb', '#ebedee'] },
  { key: 'garden', label: 'Garden', emoji: '🪴', palette: ['#c9e265', '#4a7c59'] },
  { key: 'kitchen', label: 'Kitchen', emoji: '🍲', palette: ['#ffe8c2', '#f6d365'] },
  { key: 'space', label: 'Outer space', emoji: '🚀', palette: ['#0f0c29', '#302b63'] },
  { key: 'park', label: 'Park / playground', emoji: '🌳', palette: ['#d4fc79', '#96e6a1'] },
  { key: 'market', label: 'Market', emoji: '🛒', palette: ['#ffecd2', '#fcb69f'] },
  { key: 'home', label: 'Home', emoji: '🏠', palette: ['#fdfcfb', '#e2d1c3'] },
];

export const DEFAULT_CHARACTERS: NonNullable<SceneLibrary['characters']> = [
  { key: 'maya-the-farmer', name: 'Maya', emoji: '👩🏾‍🌾' },
  { key: 'buddy-the-fox', name: 'Buddy', emoji: '🦊' },
  { key: 'tobi-the-boy', name: 'Tobi', emoji: '👦🏾' },
  { key: 'zara-the-girl', name: 'Zara', emoji: '👧🏾' },
  { key: 'koko-the-bird', name: 'Koko', emoji: '🐦' },
  { key: 'milo-the-cat', name: 'Milo', emoji: '🐱' },
  { key: 'auntie-nkechi', name: 'Auntie Nkechi', emoji: '👩🏾' },
  { key: 'papa-ade', name: 'Papa Ade', emoji: '👨🏾' },
];

export const DEFAULT_TRANSITIONS: NonNullable<SceneLibrary['transitions']> = [
  { key: 'fade', label: 'Fade' },
  { key: 'slide', label: 'Slide' },
  { key: 'none', label: 'None (instant)' },
];

const LEGACY_TYPES = new Set(['intro', 'teach', 'reinforce', 'match']);

function toSceneType(v: unknown): SceneType {
  const s = String(v || '').toLowerCase();
  if ((SCENE_TYPES as string[]).includes(s)) return s as SceneType;
  if (LEGACY_TYPES.has(s)) return (s === 'match' ? 'reinforce' : s) as SceneType;
  return 'intro';
}

function validTransition(v: unknown): SceneTransition | undefined {
  const s = String(v || '').toLowerCase();
  return (SCENE_TRANSITIONS as readonly string[]).includes(s) ? (s as SceneTransition) : undefined;
}

/**
 * Normalize any stored card into canonical v2 shape.
 * - legacy `{id,text,type}` / `{sceneId, narrationText, sceneType}` tolerated
 * - missing visual fields get safe defaults (no image → plain backdrop)
 * - unknown backgrounds/characters fall back to library-safe entries
 */
export function normalizeScene(raw: RawScene | undefined | null): NormalizedScene {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type = toSceneType(src.type ?? src.sceneType);
  const id = String(src.id ?? src.sceneId ?? '');
  const text = String(src.text ?? src.narration ?? src.narrationText ?? '');
  const transition = validTransition(src.transition) ?? 'fade';
  const characters: SceneCharacter[] = Array.isArray(src.characters)
    ? src.characters
        .filter((c: any) => c && typeof c === 'object')
        .slice(0, 4)
        .map((c: any) => ({
          name: String(c.name ?? ''),
          emoji: c.emoji ? String(c.emoji) : undefined,
          image: c.image != null ? String(c.image) : undefined,
          rigId: c.rigId ? String(c.rigId) : undefined,
          animation: c.animation ? String(c.animation) : 'idle',
          position: c.position === 'left' || c.position === 'right' ? c.position : 'center',
        }))
    : [];
  const hasVisual =
    !!src.image || !!src.background || characters.length > 0 || !!src.narrationAudio;
  return {
    id: id || (hasVisual ? `scene-${Math.random().toString(36).slice(2, 8)}` : ''),
    type,
    text,
    image: src.image ? String(src.image) : undefined,
    background: src.background ? String(src.background) : undefined,
    characters,
    narrationAudio: src.narrationAudio != null ? String(src.narrationAudio) : null,
    durationSec:
      typeof src.durationSec === 'number' && src.durationSec >= 3
        ? Math.min(60, src.durationSec)
        : undefined,
    transition,
    subtitles: src.subtitles !== false,
    gameId: src.gameId ? String(src.gameId) : undefined,
    legacy: !hasVisual,
  };
}

/** Guess an auto-advance duration (sec) for a card that has none. */
export function estimateDurationSec(scene: Pick<NormalizedScene, 'text' | 'durationSec' | 'type'>): number {
  if (typeof scene.durationSec === 'number' && scene.durationSec >= 3) return scene.durationSec;
  if (scene.type === 'game_checkpoint') return 8;
  const words = (scene.text || '').trim().split(/\s+/).filter(Boolean).length;
  // ~2.3 words/sec TTS + reading cushion, clamped 3–14s.
  return Math.max(3, Math.min(14, Math.ceil(words / 2.3) + 2));
}

/** True when a story contains at least one visually-authored (v2) card. */
export function isVisualStory(scenes: RawScene[] | NormalizedScene[]): boolean {
  if (!Array.isArray(scenes) || scenes.length === 0) return false;
  return scenes.some((s) => {
    if (!s || typeof s !== 'object') return false;
    if (s.gameId || s.narrationAudio) return true;
    if (s.image || s.background || (Array.isArray(s.characters) && s.characters.length > 0)) return true;
    if (typeof s.durationSec === 'number' && s.durationSec >= 3) return true;
    const type = toSceneType(s.type ?? s.sceneType);
    // A checkpoint needs the embedded-game button → pager mode.
    if (type === 'game_checkpoint') return true;
    // Text-only recap/intro/teach cards (pure legacy) are NOT visual: the old
    // stacked-page story keeps playing unchanged.
    return false;
  });
}

/** Flatten the wrapper/array shapes the API returns into one ordered card list. */
export function flattenScenes(payload: unknown): NormalizedScene[] {
  const out: NormalizedScene[] = [];
  const data: any[] = Array.isArray(payload) ? payload : [];
  for (const item of data) {
    if (Array.isArray(item)) {
      item.forEach((s) => out.push(normalizeScene(s)));
    } else if (item && typeof item === 'object' && Array.isArray(item.scenes)) {
      (item.scenes as any[]).forEach((s) => out.push(normalizeScene(s)));
    } else if (item && typeof item === 'object') {
      out.push(normalizeScene(item));
    }
  }
  return out;
}

export interface LibraryEntry {
  key: string;
  label?: string;
  emoji?: string;
  palette?: string[];
  tags?: string[];
  name?: string;
}

/** Library lookup with safe built-in fallbacks (never renders broken). */
export function libraryEntry(
  library: SceneLibrary | undefined | null,
  kind: 'backgrounds' | 'characters',
  key: string | undefined,
): LibraryEntry | undefined {
  if (!key) return undefined;
  const defaults = (kind === 'backgrounds' ? DEFAULT_BACKGROUNDS : DEFAULT_CHARACTERS) || [];
  const pool: LibraryEntry[] = ((library?.[kind]?.length ? library[kind] : defaults) || defaults) as LibraryEntry[];
  return pool.find((e) => e.key === key);
}

/** Background render info for a card (gradient + emoji pattern). */
export function backgroundVisual(
  library: SceneLibrary | undefined | null,
  key: string | undefined,
): { emoji: string; palette: string[]; label: string } {
  if (key) {
    const hit = libraryEntry(library, 'backgrounds', key);
    if (hit?.emoji) return { emoji: hit.emoji, palette: hit.palette?.length ? hit.palette : ['#E7EEF6', '#ffffff'], label: hit.label || '' };
  }
  return { emoji: '🌤️', palette: ['#c9d6ff', '#E7EEF6'], label: '' };
}
