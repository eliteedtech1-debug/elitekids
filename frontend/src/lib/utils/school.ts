// School & tenant utility functions — direct port of
// elite-cbt/src/lib/utils/school.ts (which itself mirrors elite-core Helper.tsx).
// Subdomain → school short name → school_setup lookup → branding + module gate.

import { STORAGE_KEYS } from './constants';

// ── Subdomain detection ─────────────────────────────────────────────────────
const EXCLUDED_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'portal', 'test', 'staging'];
const KNOWN_MULTI_TLDS = ['com.ng', 'co.uk', 'org.ng', 'net.ng', 'edu.ng', 'gov.ng'];

export const getSubdomain = (): string => {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('localhost')) {
    return '';
  }
  // IP addresses have no subdomains
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return '';
  const parts = hostname.split('.');
  const lastTwoParts = parts.slice(-2).join('.');
  const isMultiTLD = KNOWN_MULTI_TLDS.includes(lastTwoParts);
  const minPartsForSubdomain = isMultiTLD ? 4 : 3;
  if (parts.length < minPartsForSubdomain) return '';
  const subdomain = parts[0];
  if (EXCLUDED_SUBDOMAINS.includes(subdomain.toLowerCase())) return '';
  return subdomain;
};

export const getSchoolShortName = (): string => getSubdomain();
export const short_name = getSubdomain();

// ── Local storage helpers ───────────────────────────────────────────────────
const sanitize = (value: any): string => {
  if (!value || value === 'null' || value === 'undefined' || typeof value !== 'string') return '';
  return value.trim();
};

export const getSchoolId = (): string => {
  try {
    return sanitize(localStorage.getItem(STORAGE_KEYS.SCHOOL_ID));
  } catch {
    return '';
  }
};

export const getBranchId = (): string => {
  try {
    const stored = sanitize(localStorage.getItem(STORAGE_KEYS.BRANCH_ID));
    if (stored) return stored;
    const selectedBranch = localStorage.getItem(STORAGE_KEYS.SELECTED_BRANCH);
    if (selectedBranch) {
      const branch = JSON.parse(selectedBranch);
      if (branch?.branch_id) return sanitize(branch.branch_id);
    }
    return '';
  } catch {
    return '';
  }
};

// ── School context (school_id + branch_id) ─────────────────────────────────
export interface SchoolContext {
  school_id: string;
  branch_id: string;
  isAdmin: boolean;
}

export const getSchoolContext = (): SchoolContext => {
  try {
    const user = getCurrentUser();
    const isAdmin = (user?.user_type || '').toString().toLowerCase().includes('admin');
    const schoolLocations = (window as any).__REDUX_STATE__?.auth?.school_locations || [];

    let schoolId =
      sanitize((window as any).__REDUX_STATE__?.auth?.selected_branch?.school_id) ||
      sanitize(user?.school_id) ||
      sanitize(getSchoolId());
    if (!schoolId && schoolLocations.length > 0) schoolId = sanitize(schoolLocations[0].school_id);

    let branchId =
      sanitize((window as any).__REDUX_STATE__?.auth?.selected_branch?.branch_id) ||
      sanitize(user?.branch_id) ||
      sanitize(getBranchId());
    if (!branchId && schoolLocations.length > 0) branchId = sanitize(schoolLocations[0].branch_id);

    return { school_id: schoolId, branch_id: branchId, isAdmin };
  } catch {
    return { school_id: getSchoolId(), branch_id: getBranchId(), isAdmin: false };
  }
};

export const getCurrentUser = (): any => {
  try {
    return (window as any).__REDUX_STATE__?.auth?.user || null;
  } catch {
    return null;
  }
};

// ── Auth + tenant headers (mirrors elite-core createHeaders) ───────────────
export const createAuthHeaders = (customHeaders: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...customHeaders };
  try {
    // Read from role-specific key first, fallback to shared key
    const userData = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_DATA) || '{}');
    const userType = (userData.user_type || '').toLowerCase();
    let token: string | null = null;
    if (userType === 'student') {
      token = localStorage.getItem(STORAGE_KEYS.STUDENT_TOKEN);
    } else if (userType === 'parent') {
      token = localStorage.getItem(STORAGE_KEYS.PARENT_TOKEN);
    }
    if (!token) token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

    // Backends (elite-api / elite-cbt-api / this app) all use
    // passport-jwt's fromAuthHeaderAsBearerToken(), which REQUIRES the
    // "Bearer " scheme — the stored token has no prefix, so add it here.
    if (token) headers.authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    const ctx = getSchoolContext();
    if (ctx.school_id) headers['x-school-id'] = ctx.school_id;
    if (ctx.branch_id) headers['x-branch-id'] = ctx.branch_id;

    const cleanHeaders: Record<string, string> = {};
    Object.keys(headers).forEach((key) => {
      const value = headers[key];
      if (value !== undefined && value !== null && value !== 'undefined' && value !== 'null' && value !== '') {
        cleanHeaders[key] = String(value);
      }
    });
    return cleanHeaders;
  } catch {
    return headers;
  }
};

// ── Module access gate (Kids Stand-Alone) ──────────────────────────────────
// Mirror of elite-cbt/src/features/auth/lib/cbt-access.ts — deny by default.
export interface KidsSchoolFlags {
  kids_stand_alone?: number | string | null;
}

export function hasKidsAccess(school: KidsSchoolFlags | null | undefined): boolean {
  return (Number(school?.kids_stand_alone) || 0) >= 1;
}

export const shouldAutoDetectSchoolId = (): boolean => {
  const sn = getSubdomain();
  return !!sn && sn !== 'localhost';
};

export const shouldShowSchoolIdInput = (): boolean => !shouldAutoDetectSchoolId();
