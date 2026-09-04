import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { STORAGE_KEYS } from '@/lib/utils/constants';

/**
 * Route guard — requires a stored auth token (mirrors elite-cbt guards).
 * Unauthenticated visitors are sent to /login, remembering where they came from.
 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  let token = '';
  try {
    // Check for any valid token (role-specific or shared)
    token = localStorage.getItem(STORAGE_KEYS.STUDENT_TOKEN)
      || localStorage.getItem(STORAGE_KEYS.PARENT_TOKEN)
      || localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)
      || '';
  } catch {
    /* storage unavailable — treat as logged out */
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
