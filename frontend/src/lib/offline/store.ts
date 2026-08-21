/**
 * Zustand store — offline mode state.
 *
 * Tracks:
 *   - Online/offline status
 *   - Pending sync queue size
 *   - Whether offline mode is enabled
 *   - Cache status (lessons cached, game configs cached)
 *
 * Usage:
 *   import { useOfflineStore } from '@/lib/offline/store';
 *   const { isOnline, pendingSyncCount, isOfflineModeEnabled } = useOfflineStore();
 */

import { create } from 'zustand';
import { offlineDB, STORES } from './db';
import { offlineSync } from './sync';

interface OfflineState {
  /** Whether the browser is currently online. */
  isOnline: boolean;
  /** Number of items waiting in the sync queue. */
  pendingSyncCount: number;
  /** Whether offline mode is enabled (can be toggled by parent/teacher). */
  isOfflineModeEnabled: boolean;
  /** Number of lessons cached offline. */
  cachedLessonCount: number;
  /** Whether a sync is currently in progress. */
  isSyncing: boolean;
  /** Last sync attempt result. */
  lastSyncResult: { sent: number; failed: number } | null;

  // Actions
  setOnline: (online: boolean) => void;
  updatePendingCount: () => Promise<void>;
  setOfflineModeEnabled: (enabled: boolean) => void;
  updateCacheStats: () => Promise<void>;
  triggerSync: () => Promise<void>;
  init: () => void;
  destroy: () => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingSyncCount: 0,
  isOfflineModeEnabled: true, // enabled by default
  cachedLessonCount: 0,
  isSyncing: false,
  lastSyncResult: null,

  setOnline: (online) => set({ isOnline: online }),

  updatePendingCount: async () => {
    const count = await offlineDB.syncQueueSize();
    set({ pendingSyncCount: count });
  },

  setOfflineModeEnabled: (enabled) => set({ isOfflineModeEnabled: enabled }),

  updateCacheStats: async () => {
    const lessons = await offlineDB.getAll(STORES.lessons);
    set({ cachedLessonCount: lessons.length });
  },

  triggerSync: async () => {
    set({ isSyncing: true });
    try {
      const result = await offlineSync.drainNow();
      set({ lastSyncResult: result });
      await get().updatePendingCount();
    } finally {
      set({ isSyncing: false });
    }
  },

  init: () => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      set({ isOnline: true });
      get().updatePendingCount();
      // Auto-sync on reconnect
      get().triggerSync();
    };
    const handleOffline = () => {
      set({ isOnline: false });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial state
    get().updatePendingCount();
    get().updateCacheStats();

    // Store cleanup function
    (useOfflineStore as any)._cleanup = () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  },

  destroy: () => {
    const cleanup = (useOfflineStore as any)._cleanup;
    if (cleanup) cleanup();
  },
}));
