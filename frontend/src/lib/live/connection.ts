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

  // Read from role-specific keys, decode JWT to find the right role
  const candidates = [
    localStorage.getItem(STORAGE_KEYS.STUDENT_TOKEN),
    localStorage.getItem(STORAGE_KEYS.PARENT_TOKEN),
    localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
  ].filter(Boolean);

  let token: string | null = null;
  let userType = '';
  for (const t of candidates) {
    const decoded = decodeToken(t!);
    if (decoded) {
      const role = String(decoded.user_type || '').toLowerCase();
      if (role === 'student' || role === 'teacher' || role === 'parent') {
        token = t!;
        userType = role;
        break;
      }
    }
  }
  if (!token && candidates.length) {
    token = candidates[0];
    const decoded = decodeToken(token!);
    userType = String(decoded?.user_type || '').toLowerCase();
  }
  if (!token) return null;
  if (userType !== 'student' && userType !== 'teacher' && userType !== 'parent') return null;

  const live = new EliteLive({});

  // Build connection query
  let query = '';
  if (userType === 'teacher') {
    const payload = decodeToken(token);
    const classCode = payload?.class_code || payload?.class || '';
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
