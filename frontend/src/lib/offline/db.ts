/**
 * IndexedDB wrapper — EliteKids offline mode.
 *
 * Provides a simple async key-value store backed by IndexedDB for:
 *   - Game configs (pre-downloaded per class/school)
 *   - Session state (save/resume)
 *   - Pending sync items (progress records queued while offline)
 *
 * All operations are idempotent and error-tolerant — if IndexedDB is
 * unavailable (old browser, private mode quirks), the wrapper degrades
 * gracefully and returns null/empty results.
 *
 * Usage:
 *   import { offlineDB } from '@/lib/offline/db';
 *   await offlineDB.init();
 *   await offlineDB.put('gameConfigs', 'game-123', configData);
 *   const config = await offlineDB.get('gameConfigs', 'game-123');
 *   await offlineDB.delete('gameConfigs', 'game-123');
 */

const DB_NAME = 'elitekids-offline';
const DB_VERSION = 1;

/** Store names — each is an IndexedDB objectStore. */
export const STORES = {
  /** Pre-downloaded game configs keyed by game config ID. */
  gameConfigs: 'gameConfigs',
  /** Session state for save/resume, keyed by `${studentId}:${sessionId}`. */
  sessionState: 'sessionState',
  /** Pending sync items — progress records, item responses, etc. */
  syncQueue: 'syncQueue',
  /** Pre-downloaded lesson metadata. */
  lessons: 'lessons',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

interface PendingSyncItem {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  body: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

class OfflineDB {
  private db: IDBDatabase | null = null;
  private ready: Promise<void> | null = null;

  /**
   * Initialize the database. Safe to call multiple times — subsequent calls
   * return the same promise.
   */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this._open();
    return this.ready;
  }

  private _open(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        console.warn('⚠️ IndexedDB not available — offline mode disabled');
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        for (const storeName of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('✅ IndexedDB ready:', DB_NAME);
        resolve();
      };

      request.onerror = (event) => {
        console.warn('⚠️ IndexedDB open failed:', (event.target as IDBOpenDBRequest).error);
        resolve(); // degrade gracefully
      };
    });
  }

  /** Get a value by key from a store. Returns null if not found or DB unavailable. */
  async get<T = unknown>(storeName: StoreName, key: string): Promise<T | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /** Put a value into a store (create or update). */
  async put<T = unknown>(storeName: StoreName, key: string, value: T): Promise<boolean> {
    await this.init();
    if (!this.db) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put({ id: key, value, updatedAt: Date.now() });
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /** Delete a value by key from a store. */
  async delete(storeName: StoreName, key: string): Promise<boolean> {
    await this.init();
    if (!this.db) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /** Get all values from a store. */
  async getAll<T = unknown>(storeName: StoreName): Promise<Array<{ id: string; value: T }>> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /** Get all values from the sync queue, sorted by creation time. */
  async getSyncQueue(): Promise<PendingSyncItem[]> {
    const items = await this.getAll<PendingSyncItem>(STORES.syncQueue);
    return items.map((entry) => entry.value).sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Add an item to the sync queue. */
  async enqueueSync(item: Omit<PendingSyncItem, 'id' | 'createdAt' | 'retries'>): Promise<boolean> {
    const id = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.put<Partial<PendingSyncItem>>(STORES.syncQueue, id, {
      ...item,
      id,
      createdAt: Date.now(),
      retries: 0,
    });
  }

  /** Remove an item from the sync queue after successful sync. */
  async dequeueSync(id: string): Promise<boolean> {
    return this.delete(STORES.syncQueue, id);
  }

  /** Count items in the sync queue. */
  async syncQueueSize(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORES.syncQueue, 'readonly');
        const store = tx.objectStore(STORES.syncQueue);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  }

  /** Clear all data from a specific store. */
  async clearStore(storeName: StoreName): Promise<boolean> {
    await this.init();
    if (!this.db) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /** Clear all stores (factory reset). */
  async clearAll(): Promise<void> {
    for (const storeName of Object.values(STORES)) {
      await this.clearStore(storeName);
    }
  }
}

/** Singleton — import and use directly. */
export const offlineDB = new OfflineDB();
