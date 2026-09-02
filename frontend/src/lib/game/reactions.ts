/**
 * Social Reactions — light reactions during competitions.
 * Kids tap 👏🔥💪 to react to a score. No chat (safety).
 * Reactions are ephemeral (5s TTL), broadcast via WebSocket.
 */

import { liveEvents } from '@/lib/live/events';

export type ReactionEmoji = '👏' | '🔥' | '💪' | '🎉' | '⭐';

export interface Reaction {
  id: string;
  from_name: string;
  emoji: ReactionEmoji;
  created_at: number;
}

const REACTION_TTL = 5000; // 5 seconds

let listeners: ((reactions: Reaction[]) => void)[] = [];
let activeReactions: Reaction[] = [];
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export const COMPETITION_REACTIONS: ReactionEmoji[] = ['👏', '🔥', '💪', '🎉', '⭐'];

/** Send a reaction via WebSocket (reaches all peers in the class). */
export function sendReaction(
  _competitionId: string,
  fromName: string,
  _toAdm: string,
  emoji: ReactionEmoji,
  classCode?: string,
): void {
  // Import dynamically to avoid circular deps
  import('@/lib/live/connection').then(({ getLiveConnection }) => {
    const live = getLiveConnection();
    if (live) {
      live.sendReaction(emoji, classCode);
    }
  }).catch(() => {});

  // Also add locally for immediate feedback
  const reaction: Reaction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from_name: fromName,
    emoji,
    created_at: Date.now(),
  };
  activeReactions.push(reaction);
  notifyListeners(getActiveReactions());
  ensureCleanup();
}

/** Get non-expired reactions. */
export function getActiveReactions(): Reaction[] {
  const now = Date.now();
  return activeReactions.filter((r) => now - r.created_at < REACTION_TTL);
}

/** Subscribe to reaction updates (local + remote). */
export function onReactions(callback: (reactions: Reaction[]) => void): () => void {
  listeners.push(callback);
  return () => { listeners = listeners.filter((l) => l !== callback); };
}

function notifyListeners(reactions: Reaction[]) {
  listeners.forEach((l) => l(reactions));
}

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    activeReactions = activeReactions.filter((r) => now - r.created_at < REACTION_TTL);
    if (activeReactions.length === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 1000);
}

// Subscribe to remote reactions from WebSocket
liveEvents.on('reaction', (d: { emoji: string; from: string; ts: number }) => {
  const reaction: Reaction = {
    id: `${d.ts}-${Math.random().toString(36).slice(2, 8)}`,
    from_name: d.from,
    emoji: d.emoji as ReactionEmoji,
    created_at: d.ts,
  };
  activeReactions.push(reaction);
  notifyListeners(getActiveReactions());
  ensureCleanup();
});
