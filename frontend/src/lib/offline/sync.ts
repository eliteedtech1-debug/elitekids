/**
 * Offline sync service — EliteKids offline mode.
 *
 * When the browser is offline, API calls that modify data (progress, item
 * responses, session saves) are queued in IndexedDB. On reconnect, the
 * queue is drained in order.
 *
 * Features:
 *   - Auto-drain on network reconnect (online event)
 *   - Retry with exponential backoff (max 3 retries)
 *   - Conflict resolution: last-write-wins for progress records
 *   - Queue size limit (100 items) to prevent unbounded growth
 *
 * Usage:
 *   import { offlineSync } from '@/lib/offline/sync';
 *   offlineSync.init(); // starts listening for online events
 *   await offlineSync.enqueue({ endpoint: '/kids/progress/game-complete', method: 'POST', body: {...} });
 *   await offlineSync.drainNow(); // force drain (e.g. on app resume)
 */

import apiClient from '@/lib/api/client';
import { offlineDB, STORES } from './db';

// #4 hardening (E2 design, ecce-offline-design.md): progress records carry an
// idempotency_key and are safe to retry far more aggressively than other
// mutations — rural devices routinely drop >45s. Progress items get a 10-retry
// cap with the backoff array cycled; everything else keeps the 3-retry cap.
const MAX_RETRIES = 3;
const MAX_RETRIES_PROGRESS = 10;
const MAX_QUEUE_SIZE = 100;
const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000, 120000, 300000]; // ms

/** Endpoints whose payloads are idempotent (safe to retry long). */
const PROGRESS_ENDPOINTS = ['/kids/progress/game-complete', '/kids/progress/item'];

function isProgressEndpoint(endpoint: string): boolean {
  return PROGRESS_ENDPOINTS.some((e) => endpoint.includes(e));
}

type SyncStatus = 'idle' | 'draining' | 'error';

interface SyncListener {
  onStatusChange?: (status: SyncStatus, queueSize: number) => void;
}

class OfflineSyncService {
  private status: SyncStatus = 'idle';
  private listener: SyncListener | null = null;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  /** Initialize the sync service — starts listening for online events. */
  init(listener?: SyncListener) {
    if (this.started) return;
    this.started = true;
    this.listener = listener || null;

    if (typeof window === 'undefined') return;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    // #4: listen for background-sync nudges from the service worker.
    navigator.serviceWorker?.addEventListener('message', this.handleSWMessage);

    // If already online, attempt to drain any leftover queue
    if (navigator.onLine) {
      this.drainNow().catch(() => {});
    }
  }

  /** Cleanup — remove event listeners. */
  destroy() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    navigator.serviceWorker?.removeEventListener('message', this.handleSWMessage);
    if (this.drainTimer) clearTimeout(this.drainTimer);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.started = false;
  }

  /** SW background-sync nudge → drain the queue immediately. */
  private handleSWMessage = (event: MessageEvent) => {
    if (event.data?.type === 'ELITEKIDS_SYNC') {
      console.log('🔔 Background sync fired — draining queue');
      this.drainNow().catch(() => {});
    }
  };

  /**
   * #4: register a one-shot background sync with the service worker so a
   * reconnect drains the queue even if the tab was backgrounded.
   */
  private async registerBackgroundSync(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (!reg.sync) return; // not supported (older browsers) — fine, online-event drain covers it
      await reg.sync.register('progress-sync');
    } catch {
      // Non-fatal — periodic drain + online event are the fallbacks.
    }
  }

  private handleOnline = () => {
    console.log('🌐 Back online — draining sync queue');
    this.drainNow().catch(() => {});
    // E4: request background sync via service worker for mobile reliability
    if ('serviceWorker' in navigator && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        (reg as any).sync?.register('elitekids-sync').catch(() => {});
      });
    }
  };

  private handleOffline = () => {
    console.log('📴 Gone offline — queueing API calls');
  };

  private setStatus(status: SyncStatus, queueSize: number) {
    this.status = status;
    this.listener?.onStatusChange?.(status, queueSize);
  }

  /**
   * Enqueue an API call for later sync.
   * Returns true if enqueued, false if queue is full.
   */
  async enqueue(item: {
    endpoint: string;
    method: 'POST' | 'PUT' | 'PATCH';
    body: Record<string, unknown>;
  }): Promise<boolean> {
    const size = await offlineDB.syncQueueSize();
    if (size >= MAX_QUEUE_SIZE) {
      console.warn(`⚠️ Sync queue full (${size}/${MAX_QUEUE_SIZE}) — dropping item`);
      return false;
    }

    await offlineDB.enqueueSync(item);
    const newSize = await offlineDB.syncQueueSize();
    this.setStatus('idle', newSize);
    // #4: arm background sync so reconnect drains even from a background tab.
    this.registerBackgroundSync().catch(() => {});
    return true;
  }

  /**
   * Drain the sync queue — send all pending items to the server.
   * Called automatically on reconnect, or manually via drainNow().
   */
  async drainNow(): Promise<{ sent: number; failed: number }> {
    const queue = await offlineDB.getSyncQueue();
    if (queue.length === 0) return { sent: 0, failed: 0 };

    this.setStatus('draining', queue.length);
    console.log(`🔄 Draining sync queue: ${queue.length} items`);

    let sent = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        await apiClient({
          url: item.endpoint,
          method: item.method,
          data: item.body,
        });
        await offlineDB.dequeueSync(item.id);
        sent++;
      } catch (err: any) {
        console.warn(`⚠️ Sync item failed (${item.endpoint}):`, err?.message || err);
        failed++;

        // If it's a 4xx client error (not network), drop it — no point retrying
        if (err?.status && err.status >= 400 && err.status < 500) {
          await offlineDB.dequeueSync(item.id);
          continue;
        }

        // Network error or 5xx — increment retry count.
        // Progress endpoints get the extended cap (idempotency_key makes them
        // safe to retry); everything else keeps the conservative 3-retry cap.
        const cap = isProgressEndpoint(item.endpoint) ? MAX_RETRIES_PROGRESS : MAX_RETRIES;
        if (item.retries >= cap - 1) {
          console.warn(`❌ Dropping sync item after ${cap} retries: ${item.endpoint}`);
          await offlineDB.dequeueSync(item.id);
        } else {
          // Update retry count
          await offlineDB.put(STORES.syncQueue, item.id, {
            ...item,
            retries: item.retries + 1,
          });
        }
      }
    }

    const remaining = await offlineDB.syncQueueSize();
    this.setStatus(remaining > 0 ? 'error' : 'idle', remaining);

    // E2: capped exponential backoff — re-drain remaining items after a delay
    if (this.backoffTimer) { clearTimeout(this.backoffTimer); this.backoffTimer = null; }
    if (remaining > 0) {
      const head = (await offlineDB.getSyncQueue())[0];
      const idx = Math.min(head?.retries ?? 0, RETRY_DELAYS.length - 1);
      this.backoffTimer = setTimeout(() => {
        this.backoffTimer = null;
        if (navigator.onLine) this.drainNow().catch(() => {});
      }, RETRY_DELAYS[idx]);
    }

    if (sent > 0) {
      console.log(`✅ Synced ${sent} items, ${failed} failed, ${remaining} remaining`);
    }

    return { sent, failed };
  }

  /**
   * Start periodic drain attempts (for when the browser doesn't fire
   * online events reliably, e.g. mobile background/foreground).
   */
  startPeriodicDrain(intervalMs = 30000) {
    if (this.drainTimer) clearInterval(this.drainTimer);
    this.drainTimer = setInterval(() => {
      if (navigator.onLine) {
        this.drainNow().catch(() => {});
      }
    }, intervalMs);
  }

  /** Get current sync status. */
  getStatus(): { status: SyncStatus; queueSize: Promise<number> } {
    return {
      status: this.status,
      queueSize: offlineDB.syncQueueSize(),
    };
  }
}

/** Singleton — import and use directly. */
export const offlineSync = new OfflineSyncService();
