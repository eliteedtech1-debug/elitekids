/**
 * LiveEventBus — shared pub/sub for real-time events from EliteLive.
 *
 * The EliteLive instance in StudentHome pushes events here.
 * Any component (BossBattleOverlay, TeacherArena, etc.) can subscribe.
 */

type Listener<T = any> = (data: T) => void;

class LiveEventBus {
  private listeners = new Map<string, Set<Listener>>();

  on<T = any>(event: string, fn: Listener<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => { this.listeners.get(event)?.delete(fn); };
  }

  emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach((fn) => {
      try { fn(data); } catch { /* subscriber error — don't break */ }
    });
  }
}

export const liveEvents = new LiveEventBus();
