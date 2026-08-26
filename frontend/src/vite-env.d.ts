/// <reference types="vite/client" />

/**
 * #4 SW & Sync hardening — Background Sync API types.
 * lib.dom in this TS version doesn't ship the sync surface, so declare the
 * subset we use. Feature-detected at runtime (reg.sync may be undefined).
 */
interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ServiceWorkerRegistration {
  sync?: SyncManager;
}
