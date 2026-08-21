/**
 * Offline mode barrel export — EliteKids.
 *
 * Import everything offline-related from here:
 *   import { offlineDB, offlineSync, offlineContent, offlineApi, useOfflineStore } from '@/lib/offline';
 */

export { offlineDB, STORES } from './db';
export type { StoreName } from './db';
export { offlineSync } from './sync';
export { offlineContent } from './content';
export { offlineApi } from './api';
export { useOfflineStore } from './store';
