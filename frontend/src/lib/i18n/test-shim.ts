/**
 * Test-only shim: install `window` + minimal `localStorage` BEFORE the i18n
 * store module is imported, so zustand v5 persist (which reads
 * `window.localStorage`) can hydrate/write during tests. Import this file
 * FIRST in any i18n test (no jsdom dependency in this project).
 */
const memStore = new Map<string, string>();

(globalThis as any).window = (globalThis as any).window || globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, String(v)),
  removeItem: (k: string) => void memStore.delete(k),
};
