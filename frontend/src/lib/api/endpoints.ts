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

  // Lessons & content
  LESSONS: {
    LIST: '/kids/lessons',
    CREATE: '/kids/lessons',
    CREATE_MANUAL: '/kids/lessons/manual',
    GET: (id: string) => `/kids/lessons/${id}`,
    GENERATE: (id: string) => `/kids/lessons/${id}/generate`,
    GAME: (id: string) => `/kids/lessons/${id}/game`,
    SCENES: (id: string) => `/kids/lessons/${id}/scenes`,
    APPROVE: (id: string) => `/kids/lessons/${id}/approve`,
    SUGGESTED_MODE: (lessonId: string, studentId: string) => `/kids/lessons/${lessonId}/suggested-mode?student_id=${encodeURIComponent(studentId)}`,
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
  },

  // Interface Onboarding (Doc 16)
  ONBOARDING: {
    STATUS: (studentId: string) => `/kids/onboarding/status?student_id=${encodeURIComponent(studentId)}`,
    COMPLETE: '/kids/onboarding/complete',
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

  // Curriculum Mapping & Library (Doc 15)
  CURRICULUM: {
    LIST: '/kids/curriculum',
    GET: (id: string) => `/kids/curriculum/${id}`,
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
} as const;
