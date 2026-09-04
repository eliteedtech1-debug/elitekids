// API Endpoint constants — match 02-ELITE-INTEGRATION/03-API-CONTRACT.md

export const ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: (type: 'users' | 'students') => `/${type}/login`,
    VERIFY_TOKEN: '/verify-token',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    PARENT_SIGNUP: '/auth/parent-signup',
  },

  // School (branding + module gate)
  SCHOOL: {
    GET_DETAILS: '/schools/get-details',
  },

  // Children — admission numbers contain slashes (e.g. 213232/1/0029),
  // so we use query params (?admission_no=X) instead of path params.
  CHILDREN: {
    LIST: '/kids/children',
    GET: (admissionNo: string) => `/kids/children/detail?admission_no=${encodeURIComponent(admissionNo)}`,
    CREATE: '/kids/children',
    CREATE_FOR_PARENT: '/kids/children/create-for-parent',
    UPDATE: (admissionNo: string) => `/kids/children/detail?admission_no=${encodeURIComponent(admissionNo)}`,
    DELETE: (admissionNo: string) => `/kids/children/detail?admission_no=${encodeURIComponent(admissionNo)}`,
    LINK: '/kids/children/link',
  },

  // NERDC curriculum compliance
  NERDC: {
    REPORT: '/kids/nerdc/report',
    REPORT_CSV: '/kids/nerdc/report?format=csv',
  },

  // Lessons & content
  LESSONS: {
    LIST: '/kids/lessons',
    CREATE: '/kids/lessons',
    CREATE_MANUAL: '/kids/lessons/manual',
    GET: (id: string) => `/kids/lessons/${id}`,
    GENERATE: (id: string) => `/kids/lessons/${id}/generate`,
    GAME: (id: string) => `/kids/lessons/${id}/game`,
    GAME_PREVIEW: (id: string) => `/kids/lessons/${id}/game/preview`,
    SCENES: (id: string) => `/kids/lessons/${id}/scenes`,
    APPROVE: (id: string) => `/kids/lessons/${id}/approve`,
    SUGGESTED_MODE: (lessonId: string, studentId: string) => `/kids/lessons/${lessonId}/suggested-mode?student_id=${encodeURIComponent(studentId)}`,
    NEXT_UP: (lessonId: string, studentId: string) => `/kids/lessons/${lessonId}/next-up?student_id=${encodeURIComponent(studentId)}`,
  },

  // Progress — same query-param pattern for admission numbers
  PROGRESS: {
    GAME_COMPLETE: '/kids/progress/game-complete',
    CHILD: (admissionNo: string) => `/kids/progress/child?admission_no=${encodeURIComponent(admissionNo)}`,
    LESSON: (lessonId: string) => `/kids/progress/lesson/${lessonId}`,
    PUZZLE_DIFFICULTY: (childId: string, lessonId: string) => `/kids/progress/puzzle-difficulty?child_admission_no=${encodeURIComponent(childId)}&lesson_id=${encodeURIComponent(lessonId)}`,
  },

  // Generation jobs (teacher polling)
  GENERATION_JOBS: {
    LIST: '/kids/generation-jobs',
    GET: (id: string) => `/kids/generation-jobs/${id}`,
  },

  // Review & safety
  APPROVALS: {
    LIST: '/kids/approvals',
    DECIDE: (id: string) => `/kids/approvals/${id}/decide`,
  },

  // Game Series & Unit Sequencing (Doc 12)
  SERIES: {
    LIST: '/kids/series',
    GET: (id: string) => `/kids/series/${id}`,
    CREATE: '/kids/series',
    CREATE_UNIT: (seriesId: string) => `/kids/series/${seriesId}/units`,
    UPDATE_UNIT: (seriesId: string, unitId: string) => `/kids/series/${seriesId}/units/${unitId}`,
    LOCK_STATUS: (unitId: string, studentId: string) => `/kids/units/${unitId}/lock-status?student_id=${encodeURIComponent(studentId)}`,
    DOMESTICATE: (seriesId: string) => `/kids/series/${seriesId}/domesticate`,
    DOMESTICATIONS: '/kids/series-domestications',
  },

  // Interface Onboarding (Doc 16)
  ONBOARDING: {
    STATUS: (studentId: string) => `/kids/onboarding/status?student_id=${encodeURIComponent(studentId)}`,
    COMPLETE: '/kids/onboarding/complete',
  },

  // Age declaration ("How old are you?" tour step)
  AGE: {
    GET: '/kids/age',
    SET: '/kids/age',
  },

  // Retry / Adaptive Difficulty (Doc 16)
  RETRY: {
    TEST_COMPLETE: '/kids/retry/test-complete',
    STATUS: (studentId: string, itemId: string) => `/kids/retry/status?student_id=${encodeURIComponent(studentId)}&item_id=${encodeURIComponent(itemId)}`,
    TEACHER_FLAGS: '/kids/retry/teacher-flags',
  },

  // Pattern Tracking (Doc 14)
  TRACKING: {
    ITEM_RESPONSE: '/kids/tracking/item-response',
    SESSION_SNAPSHOT: '/kids/tracking/session-snapshot',
    PROGRESS: (studentId: string) => `/kids/tracking/progress?student_id=${encodeURIComponent(studentId)}`,
    DIGEST: (studentId: string) => `/kids/tracking/digest?student_id=${encodeURIComponent(studentId)}`,
  },

  // Garden & Companion (Doc 17)
  GARDEN: {
    GET: (studentId: string) => `/kids/garden?student_id=${encodeURIComponent(studentId)}`,
    INITIALIZE: '/kids/garden/initialize',
    GROW: '/kids/garden/grow',
  },
  COMPANION: {
    GET: (studentId: string) => `/kids/companion?student_id=${encodeURIComponent(studentId)}`,
    CHOOSE: '/kids/companion/choose',
    CUSTOMIZE: '/kids/companion/customize',
  },

  // Save / Resume (Doc 17)
  SESSION: {
    SAVE: '/kids/session/save',
    RESUME: (studentId: string) => `/kids/session/resume?student_id=${encodeURIComponent(studentId)}`,
    DELETE: (id: string) => `/kids/session/${id}`,
  },

  // E3f: weekend push notifications
  PUSH: {
    KEY: '/kids/push/public-key',
    SUBSCRIBE: '/kids/push/subscribe',
  },

  // Learning path + weekly goals (TECH-SPEC-LEARNING-PATH §2.2/§2.3)
  LEARNING_PATH: (studentId: string) => `/kids/learning-path?student_id=${encodeURIComponent(studentId)}`,
  GOALS: {
    GET: (admissionNo: string) => `/kids/goals/${encodeURIComponent(admissionNo)}`,
    POST: (admissionNo: string) => `/kids/goals/${encodeURIComponent(admissionNo)}`,
  },

  // E3f: Class Arena competitions
  ARENA: {
    ACTIVE: '/kids/arena/active',
    LIST: '/kids/arena/list',
    CREATE: '/kids/arena/create',
    END: (id: string) => `/kids/arena/${id}/end`,
  },

  // Curriculum Mapping & Library (Doc 15)
  CURRICULUM: {
    LIST: '/kids/curriculum',
    GET: (id: string) => `/kids/curriculum/${id}`,
    WEEKEND_TEST: '/kids/weekend-test',
  },
  LIBRARY: {
    LIST: '/kids/library',
    GET: (id: string) => `/kids/library/${id}`,
    ASSIGN: '/kids/library/assign',
    CUSTOMIZE: '/kids/library/customize',
  },
  VARIANTS: {
    LIST: (classId: string) => `/kids/variants?class_id=${encodeURIComponent(classId)}`,
  },

  // Mode Lock (Teacher > Parent > Child hierarchy)
  MODE_LOCK: {
    GET: (childAdmissionNo: string, lessonId: string, classCode?: string) =>
      `/kids/mode-lock?child_admission_no=${encodeURIComponent(childAdmissionNo)}&lesson_id=${encodeURIComponent(lessonId)}${classCode ? `&class_code=${encodeURIComponent(classCode)}` : ''}`,
    LIST: (childAdmissionNo: string) => `/kids/mode-locks?child_admission_no=${encodeURIComponent(childAdmissionNo)}`,
    LIST_CLASS: (classCode: string) => `/kids/mode-locks?class_code=${encodeURIComponent(classCode)}`,
    SET: '/kids/mode-lock',
    REMOVE: '/kids/mode-lock',
  },

  // FB-13: publish class-test scores into weekly_scores (CA/EXAM via ca_setup)
  TEST_SCORES: {
    CONVERT: '/kids/test-scores/convert',
  },

  // FB-17: weekly leaderboard, badges, free-week reward
  LEADERBOARD: {
    BOARD: '/kids/leaderboard',
    ME: '/kids/leaderboard/me',
    BADGES: '/kids/badges',
  },

  // Parental Controls (Doc 17)
  PARENTAL: {
    GET: (studentId: string) => `/kids/parental-controls?student_id=${encodeURIComponent(studentId)}`,
    SET: '/kids/parental-controls',
    CHECK: (studentId: string) => `/kids/parental-controls/check?student_id=${encodeURIComponent(studentId)}`,
  },

  // Open-source media library (save to our bucket)
  MEDIA: {
    SAVE_OPENSOURCE: '/media/save-opensource',
    SAVE_BATCH: '/media/save-opensource-batch',
    OPENSOURCE_ASSETS: '/media/opensource-assets',
  },

  // Illustrated story scenes (Phase 3): approved backgrounds/characters +
  // per-game-type story scaffolds.
  STORY: {
    SCENE_LIBRARY: '/kids/scene-library',
    TEMPLATES: (template?: string) =>
      `/kids/story-templates${template ? `?template=${encodeURIComponent(template)}` : ''}`,
  },

  // E5 Phase 0: Adaptive Difficulty
  // E4 Phase 0: Voice Notes
  VOICE: {
    LIST: '/kids/voice-notes',
    MINE: '/kids/voice-notes/mine',
    AUDIO: (id: string) => `/kids/voice-notes/${id}/audio`,
  },

  // v1 ADAPTIVE + REVIEWS endpoints removed (Q1 Phase 4 cleanup) — FE uses
  // ADE_V2 (BKT) and REVIEWS_V2 (SM-2+). See takeover-progress.md.

  // Revision (reinforcement-based)
  REVISION: {
    STATUS: '/kids/revision/status',
    NUDGES: '/kids/revision/nudges',
    FAILED_ITEMS: '/kids/revision/failed-items',
    RECORD_FAILED: '/kids/revision/failed',
    RETRY_CORRECT: '/kids/revision/retry-correct',
    WEEKLY: '/kids/revision/weekly',
  },

  // E5+E6 Phase 0: Enhanced Arena
  ARENA_GAMES: {
    SET: (id: string) => `/kids/arena/${id}/games`,
    GET: (id: string) => `/kids/arena/${id}/games`,
    DASHBOARD: (id: string) => `/kids/arena/${id}/dashboard`,
  },

  // E6 Phase 0: Boss Battles
  BOSS: {
    RAID_ACTIVE: '/kids/boss/raid/active',
    RAID_CREATE: '/kids/boss/raid/create',
    RAIDS: '/kids/boss/raids',
    RAID_DASHBOARD: (id: string) => `/kids/boss/raid/${id}/dashboard`,
    RAID_DAMAGE: (id: string) => `/kids/boss/raid/${id}/damage`,
    RAID_GAMES: (id: string) => `/kids/boss/raid/${id}/games`,
    GUARDIANS: '/kids/boss/guardians',
  },

  // E5 Phase 0: Power-Ups (client-side localStorage, but backend for persistence)
  POWER_UPS: {
    AVAILABLE: '/kids/power-ups',
    USE: '/kids/power-ups/use',
  },


  // Phase 4: Teacher Quick-Create
  QUICK_CREATE: {
    LIST: '/kids/teacher/quizzes',
    CREATE: '/kids/teacher/quizzes',
    QUESTIONS: (id: string) => `/kids/teacher/quizzes/${id}/questions`,
    PUBLISH: (id: string) => `/kids/teacher/quizzes/${id}/publish`,
    UNPUBLISH: (id: string) => `/kids/teacher/quizzes/${id}/unpublish`,
    DELETE: (id: string) => `/kids/teacher/quizzes/${id}`,
  },

  // Phase 4: Multi-School Analytics
  ANALYTICS: {
    OVERVIEW: '/kids/analytics/overview',
    CLASSES: '/kids/analytics/classes',
    STRUGGLING: '/kids/analytics/struggling',
    GAMES: '/kids/analytics/games',
    LEADERBOARD: '/kids/analytics/leaderboard',
  },

  // Q1 2027: NGEd-game — Adaptive Difficulty Engine (v2, BKT)
  ADE_V2: {
    UPDATE: '/kids/adaptive/v2/update',
    PROFILE: (skillKey: string) => `/kids/adaptive/v2/profile?skill_key=${encodeURIComponent(skillKey)}`,
    NEXT_ITEM: (subject?: string, count?: number) =>
      `/kids/adaptive/v2/next-item${subject ? `?subject=${encodeURIComponent(subject)}` : ''}${count ? `${subject ? '&' : '?'}count=${count}` : ''}`,
    SKILLS: '/kids/adaptive/v2/skills',
  },

  // Q1 2027: NGEd-game — Spaced Repetition Engine (v2, SM-2+)
  REVIEWS_V2: {
    TODAY: '/kids/reviews/v2/today',
    COMPLETE: '/kids/reviews/v2/complete',
    STATS: '/kids/reviews/v2/stats',
  },

  // Q1 2027: NGEd-game — Engagement Economy
  ECONOMY: {
    BALANCE: '/kids/economy/balance',
    EARN: '/kids/economy/earn',
    STREAK_RECORD: '/kids/economy/streak/record',
    SHOP: '/kids/economy/shop',
    SHOP_BUY: '/kids/economy/shop/buy',
    SHOP_EQUIP: '/kids/economy/shop/equip',
  },

  // Phase 4: Match History
  MATCH_HISTORY: {
    LIST: '/kids/match-history',
    RIVALRY: '/kids/match-history/rivalry',
    STATS: '/kids/match-history/stats',
  },

  // Q3 2027: Classroom Collaboration (The Village §3.1)
  COLLAB: {
    TEAMS_CREATE: '/kids/teams/create',
    TEAMS_MINE: '/kids/teams/mine',
    TEAMS_GET: (id: string) => `/kids/teams/${encodeURIComponent(id)}`,
    TEAMS_JOIN: (id: string) => `/kids/teams/${encodeURIComponent(id)}/join`,
    TEAMS_CHALLENGE: (id: string) => `/kids/teams/${encodeURIComponent(id)}/challenge`,
    TEAMS_CHALLENGE_SUBMIT: (id: string) => `/kids/teams/${encodeURIComponent(id)}/challenge/submit`,
    PEER_TEACH_RECORD: '/kids/peer-teach/record',
    PEER_TEACH_BOARD: '/kids/peer-teach/board',
    CLASS_QUEST_ACTIVE: '/kids/class-quest/active',
    CLASS_QUEST_CONTRIBUTE: '/kids/class-quest/contribute',
    CLASS_QUEST_LEADERBOARD: '/kids/class-quest/leaderboard',
  },

  // Q3 2027: Parent Intelligence (§3.2)
  PARENT_INTEL: {
    INSIGHTS: (childId: string) => `/kids/parent/insights/${encodeURIComponent(childId)}`,
    WEEKLY_DIGEST: (childId: string) => `/kids/parent/weekly-digest/${encodeURIComponent(childId)}`,
    COMPARISON: (childId: string) => `/kids/parent/comparison/${encodeURIComponent(childId)}`,
    ACTION_ACK: '/kids/parent/action-ack',
    OPT_IN: '/kids/parent/opt-in',
  },

  // Q4 2027: Content Marketplace (§2.13)
  MARKETPLACE: {
    LISTINGS: '/kids/marketplace/listings',
    LISTING: (id: string) => `/kids/marketplace/listings/${encodeURIComponent(id)}`,
    INITIATE: '/kids/marketplace/initiate',
    VERIFY: '/kids/marketplace/purchase/verify',
    REVIEW: '/kids/marketplace/review',
  },

  // Q4 2027: Analytics Intelligence (§2.15)
  PREDICTIVE: {
    PREDICTIONS: (childId: string, classId: string) => `/kids/analytics/predictions/${encodeURIComponent(childId)}?class_id=${encodeURIComponent(classId)}`,
    EARLY_WARNINGS: (classId: string) => `/kids/analytics/early-warnings?class_id=${encodeURIComponent(classId)}`,
    POPULATION: (classId: string) => `/kids/analytics/population?class_id=${encodeURIComponent(classId)}`,
    CONTENT_EFFECTIVENESS: (classId: string) => `/kids/analytics/content-effectiveness?class_id=${encodeURIComponent(classId)}`,
  },

  // Q4 2027: Offline-first delta sync (§2.14)
  SYNC: {
    DELTA: '/kids/sync/delta',
    SCHEMA: '/kids/sync/schema',
  },

  // Q3 2027: Teacher AI Assistant (§3.3)
  TEACHER_AI: {
    INSIGHTS: '/kids/teacher/insights',
    SUGGESTIONS: '/kids/teacher/suggestions',
    AUTO_ASSIGN: '/kids/teacher/auto-assign',
    WEEKLY_REPORT: '/kids/teacher/weekly-report',
    STRUGGLING: '/kids/teacher/struggling',
  },

} as const;
