// API Configuration (mirrors elite-cbt/src/lib/utils/constants.ts)
// Default '' = same-origin: nginx serves the SPA and proxies /kids,/media,... to the API.
export const API_CONFIG = {
  BASE_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
  TIMEOUT: 30000,
} as const;

// Storage Keys — must match the ecosystem (@@auth_token etc.) so a shared
// session works across elite-core / elite-cbt / elite-kids.
export const STORAGE_KEYS = {
  AUTH_TOKEN: '@@auth_token',
  SCHOOL_ID: 'school_id',
  BRANCH_ID: 'branch_id',
  SELECTED_BRANCH: 'selected_branch',
  USER_DATA: 'user_data',
} as const;

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  PLAY: '/play',
  PARENT: '/parent',
  TEACHER: '/teacher',
  APPROVALS: '/teacher/approvals',
} as const;

export const USER_ROLES = {
  ADMIN: 'Admin',
  BRANCH_ADMIN: 'branchadmin',
  TEACHER: 'Teacher',
  PARENT: 'Parent',
  STUDENT: 'Student',
  SUPERADMIN: 'superadmin',
  EXAM_OFFICER: 'exam_officer',
} as const;

/** Staff roles — matches elite-api ROLE_GROUPS.ADMIN_ROLES + teacher. */
export const STAFF_ROLES = ['admin', 'branchadmin', 'superadmin', 'teacher', 'exam_officer'] as const;
/** Admin-level roles — can manage school settings. */
export const ADMIN_ROLES = ['admin', 'branchadmin', 'superadmin'] as const;

export const AGE_LEVELS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'] as const;

// Game templates (must match game-engine/schemas/*.schema.json)
export const GAME_TEMPLATES = [
  'matching',
  'tap-recognition',
  'drag-sort',
  'quiz',
  'fill-in-blank',
  'memory-pairs',
  'puzzle-split',
  'label-diagram',
  'stage-sequence',
  'game-chain',
] as const;
