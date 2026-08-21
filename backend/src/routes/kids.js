const passport = require('passport');
const {
  listChildrenForParent,
  getChild,
  createChild,
  updateChild,
  deleteChild,
  linkChildForParent,
  createLesson,
  getPublishedGame,
  getPublishedScenes,
  getGenerationJob,
  listGenerationJobs,
  recordGameComplete,
  childProgress,
  decideApproval,
  approveLesson,
  listApprovals,
  listParentActivities,
  listLessons,
  getPuzzleDifficultyStatus,
} = require('../controllers/kids');
const {
  createSeries,
  listSeries,
  getSeries,
  createUnit,
  updateUnit,
  getUnitLockStatus,
  getUnitSuggestedMode,
} = require('../controllers/kidsSeries');
const {
  getOnboardingStatus,
  completeOnboarding,
} = require('../controllers/kidsOnboarding');
const {
  recordTestComplete,
  getRetryStatus,
  getTeacherFlags,
} = require('../controllers/kidsRetry');
const {
  recordItemResponse,
  recordSessionSnapshot,
  getProgress,
  getDigest,
} = require('../controllers/kidsTracking');
const {
  getGarden,
  initializeGarden,
  addGardenElement,
  getCompanion,
  chooseCompanion,
  customizeCompanion,
} = require('../controllers/kidsGarden');
const {
  saveSession,
  resumeSession,
  deleteSession,
} = require('../controllers/kidsSession');
const {
  listCurriculumPoints,
  getCurriculumPoint,
  listLibraryGames,
  getLibraryGame,
  assignLibraryGame,
  customizeLibraryGame,
  listClassVariants,
} = require('../controllers/kidsCurriculum');
const {
  getParentalControls,
  setParentalControls,
  checkPlayAllowed,
} = require('../controllers/kidsParental');
const { denyForeignChildData, requireStaff } = require('../services/routesHelper');
const { getModeLock, setModeLock, removeModeLock, listModeLocks } = require('../controllers/kidsModeLock');

const auth = passport.authenticate('jwt', { session: false });

module.exports = (app) => {
  // ── Parent read-only activity feed ──────────────────────────────────────
  app.get('/kids/parent/activities', auth, listParentActivities);

  // ── Lessons (listing for students/parents + CRUD for staff) ──────────────
  app.get('/kids/lessons', auth, listLessons);
  app.post('/kids/lessons', auth, requireStaff, createLesson);

  // ── Children ────────────────────────────────────────────────────────────
  app.get('/kids/children', auth, listChildrenForParent);
  app.post('/kids/children', auth, requireStaff, createChild);
  // Parent self-service linking (registered before any POST :param route).
  app.post('/kids/children/link', auth, linkChildForParent);
  // Admission numbers contain slashes (e.g. 213232/1/0029), so we use query
  // params instead of path params.  Both :admissionNo (legacy) and ?admission_no=
  // are accepted.
  app.get('/kids/children/detail', auth, getChild);
  app.put('/kids/children/detail', auth, updateChild);
  app.delete('/kids/children/detail', auth, deleteChild);
  // Legacy path-param routes (for simple admission numbers without slashes)
  app.get('/kids/children/:admissionNo', auth, getChild);
  app.put('/kids/children/:admissionNo', auth, updateChild);
  app.delete('/kids/children/:admissionNo', auth, deleteChild);

  // ── Lessons & content (moved above, POST /kids/lessons now uses requireStaff) ──
  // Child-facing published content (parent/teacher/student auth required)
  app.get('/kids/lessons/:id/game', auth, getPublishedGame);
  app.get('/kids/lessons/:id/scenes', auth, getPublishedScenes);

  // ── Generation job status (teacher/admin polling) ────────────────────────
  app.get('/kids/generation-jobs', auth, listGenerationJobs);
  app.get('/kids/generation-jobs/:id', auth, getGenerationJob);

  // ── Progress ────────────────────────────────────────────────────────────
  app.post('/kids/progress/game-complete', auth, (req, res, next) => {
    const denied = denyForeignChildData(req);
    if (denied) return res.status(denied.status).json(denied.body);
    next();
  }, recordGameComplete);
  // Query-param route for admission numbers with slashes
  app.get('/kids/progress/child', auth, (req, res, next) => {
    const denied = denyForeignChildData(req);
    if (denied) return res.status(denied.status).json(denied.body);
    next();
  }, childProgress);
  // Legacy path-param route (for simple admission numbers without slashes)
  app.get('/kids/progress/child/:admissionNo', auth, (req, res, next) => {
    const denied = denyForeignChildData(req);
    if (denied) return res.status(denied.status).json(denied.body);
    next();
  }, childProgress);

  // ── Puzzle difficulty lock status ──────────────────────────────────────
  app.get('/kids/progress/puzzle-difficulty', auth, getPuzzleDifficultyStatus);

  // ── Review & safety pipeline (staff-only: approve/reject content) ─────
  app.get('/kids/approvals', auth, listApprovals);
  app.post('/kids/approvals/:id/decide', auth, requireStaff, decideApproval);
  app.post('/kids/lessons/:id/approve', auth, requireStaff, approveLesson);

  // ── Game Series & Unit Sequencing (Doc 12) ──────────────────────────
  app.post('/kids/series', auth, requireStaff, createSeries);
  app.get('/kids/series', auth, listSeries);
  app.get('/kids/series/:id', auth, getSeries);
  app.post('/kids/series/:id/units', auth, requireStaff, createUnit);
  app.put('/kids/series/:id/units/:unitId', auth, requireStaff, updateUnit);
  app.get('/kids/units/:id/lock-status', auth, getUnitLockStatus);
  app.get('/kids/lessons/:id/suggested-mode', auth, getUnitSuggestedMode);

  // ── Interface Onboarding (Doc 16) ───────────────────────────────────
  app.get('/kids/onboarding/status', auth, getOnboardingStatus);
  app.post('/kids/onboarding/complete', auth, completeOnboarding);

  // ── Retry / Adaptive Difficulty (Doc 16) ────────────────────────────
  app.post('/kids/retry/test-complete', auth, recordTestComplete);
  app.get('/kids/retry/status', auth, getRetryStatus);
  app.get('/kids/retry/teacher-flags', auth, getTeacherFlags);

  // ── Pattern Tracking (Doc 14) ───────────────────────────────────────
  app.post('/kids/tracking/item-response', auth, recordItemResponse);
  app.post('/kids/tracking/session-snapshot', auth, recordSessionSnapshot);
  app.get('/kids/tracking/progress', auth, getProgress);
  app.get('/kids/tracking/digest', auth, getDigest);

  // ── Garden & Companion (Doc 17) ────────────────────────────────────
  app.get('/kids/garden', auth, getGarden);
  app.post('/kids/garden/initialize', auth, initializeGarden);
  app.post('/kids/garden/grow', auth, addGardenElement);
  app.get('/kids/companion', auth, getCompanion);
  app.post('/kids/companion/choose', auth, chooseCompanion);
  app.post('/kids/companion/customize', auth, customizeCompanion);

  // ── Save / Resume (Doc 17) ─────────────────────────────────────────
  app.post('/kids/session/save', auth, saveSession);
  app.get('/kids/session/resume', auth, resumeSession);
  app.delete('/kids/session/:id', auth, deleteSession);

  // ── Curriculum Mapping & Library (Doc 15) ──────────────────────────
  app.get('/kids/curriculum', auth, listCurriculumPoints);
  app.get('/kids/curriculum/:id', auth, getCurriculumPoint);
  app.get('/kids/library', auth, listLibraryGames);
  app.get('/kids/library/:id', auth, getLibraryGame);
  app.post('/kids/library/assign', auth, requireStaff, assignLibraryGame);
  app.post('/kids/library/customize', auth, requireStaff, customizeLibraryGame);
  app.get('/kids/variants', auth, listClassVariants);

  // ── Mode Lock (Teacher > Parent > Child hierarchy) ────────────────
  app.get('/kids/mode-lock', auth, getModeLock);
  app.get('/kids/mode-locks', auth, listModeLocks);
  app.post('/kids/mode-lock', auth, setModeLock);
  app.delete('/kids/mode-lock', auth, removeModeLock);

  // ── Parental Controls (Doc 17) ────────────────────────────────────
  app.get('/kids/parental-controls', auth, getParentalControls);
  app.post('/kids/parental-controls', auth, setParentalControls);
  app.get('/kids/parental-controls/check', auth, checkPlayAllowed);
};
