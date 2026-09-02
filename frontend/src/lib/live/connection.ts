/**
 * LiveConnection — singleton EliteLive instance that persists across routes.
 *
 * Initialized once when the student/teacher/parent first loads the app.
 * Components subscribe to liveEvents for real-time updates.
 */

import { EliteLive } from './audio';
import { STORAGE_KEYS } from '@/lib/utils/constants';

let instance: EliteLive | null = null;

function decodeToken(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/**
 * Get or create the shared EliteLive connection.
 * Safe to call multiple times — returns the same instance.
 */
export function getLiveConnection(): EliteLive | null {
  if (instance) return instance;

  const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) return null;

  const decoded = decodeToken(token);
  if (!decoded) return null;

  const userType = String(decoded.user_type || '').toLowerCase();
  if (userType !== 'student' && userType !== 'teacher' && userType !== 'parent') return null;

  const live = new EliteLive({});

  // Build connection query
  let query = '';
  if (userType === 'teacher') {
    const classCode = decoded.class_code || decoded.class || '';
    if (classCode) query = `class=${encodeURIComponent(classCode)}`;
  }
  // Students and parents auto-join rooms server-side

  live.connect(token, query);
  instance = live;
  return instance;
}

/** Disconnect and clear the singleton (on logout). */
export function disconnectLive() {
  instance?.disconnect();
  instance = null;
}

// EliteLive is already imported above — no re-export needed
export type { EliteLive };
