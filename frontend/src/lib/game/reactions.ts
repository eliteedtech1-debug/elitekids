/**
 * Social Reactions — light reactions during competitions.
 * Kids tap 👏🔥💪 to react to a score. No chat (safety).
 * Reactions are ephemeral (5s TTL), broadcast via polling.
 */

export type ReactionEmoji = '👏' | '🔥' | '💪' | '🎉' | '⭐';

export interface Reaction {
  id: string;
  from_name: string;
  emoji: ReactionEmoji;
  to_adm: string;  // recipient (anonymized server-side)
  created_at: number;
}

const REACTION_TTL = 5000; // 5 seconds
const REACTIONS_KEY = 'elitekids_reactions';

let listeners: ((reactions: Reaction[]) => void)[] = [];

export const COMPETITION_REACTIONS: ReactionEmoji[] = ['👏', '🔥', '💪', '🎉', '⭐'];

/** Send a reaction (stores locally, would POST to server in production). */
export function sendReaction(
  competitionId: string,
  fromName: string,
  toAdm: string,
  emoji: ReactionEmoji,
): void {
  const reaction: Reaction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from_name: fromName,
    emoji,
    to_adm: toAdm,
    created_at: Date.now(),
  };

  // In production: POST /kids/arena/:id/reactions { emoji, to_adm }
  // For now, local broadcast via storage event
  try {
    const key = `${REACTIONS_KEY}_${competitionId}`;
    const existing: Reaction[] = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push(reaction);
    localStorage.setItem(key, JSON.stringify(existing));
    notifyListeners(getActiveReactions(competitionId));
  } catch { /* noop */ }
}

/** Get non-expired reactions for a competition. */
export function getActiveReactions(competitionId: string): Reaction[] {
  try {
    const key = `${REACTIONS_KEY}_${competitionId}`;
    const all: Reaction[] = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();
    return all.filter((r) => now - r.created_at < REACTION_TTL);
  } catch { return []; }
}

/** Subscribe to reaction updates. */
export function onReactions(callback: (reactions: Reaction[]) => void): () => void {
  listeners.push(callback);
  return () => { listeners = listeners.filter((l) => l !== callback); };
}

function notifyListeners(reactions: Reaction[]) {
  listeners.forEach((l) => l(reactions));
}

/** Cleanup expired reactions (call periodically). */
export function cleanupReactions(competitionId: string) {
  try {
    const key = `${REACTIONS_KEY}_${competitionId}`;
    const all: Reaction[] = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();
    const active = all.filter((r) => now - r.created_at < REACTION_TTL);
    localStorage.setItem(key, JSON.stringify(active));
  } catch { /* noop */ }
}
