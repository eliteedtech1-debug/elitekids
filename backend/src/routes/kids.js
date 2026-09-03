const passport = require('passport');
const {
  listChildrenForParent,
  getChild,
  createChild,
  createChildForParent,
  updateChild,
  deleteChild,
  linkChildForParent,
  createLesson,
  createLessonManual,
  getPublishedGame,
  getGamePreview,
  getPublishedScenes,
  getSceneLibrary,
  getStoryTemplates,
  getGenerationJob,
  listGenerationJobs,
  recordGameComplete,
  syncBatch,
  childProgress,
  decideApproval,
  approveLesson,
  listApprovals,
  listParentActivities,
  listLessons,
  getPuzzleDifficultyStatus,
  nerdcReport,
} = require('../controllers/kids');
const {
  createSeries,
  listSeries,
  getSeries,
  getCurriculum,
  createUnit,
  updateUnit,
  getUnitLockStatus,
  getUnitSuggestedMode,
  getLearningPath,
} = require('../controllers/kidsSeries');
const { getLessonNextUp } = require('../controllers/kidsSeries');
const { getChildGoal, setChildGoal } = require('../controllers/kidsGoals');
const { domesticateSeries, listDomestications } = require('../controllers/kidsModeLock');
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
const { getModeLock, setModeLock, removeModeLock, listModeLocks, convertTestScores } = require('../controllers/kidsModeLock');
// Flagship `elite` model school + subscriptions (spec: FLAGSHIP-ELITE-SCHOOL-SPEC.md)
const subCtrl = require('../controllers/kidsSubscription');
const { requireKidsEntitlement } = require('../controllers/kidsSubscription');

const auth = passport.authenticate('jwt', { session: false });
const { getLeaderboard, getMyStatus, getMyBadges } = require('../controllers/kidsLeaderboard');
const { getWeekendTest } = require('../controllers/e3fWeekend');
const { getPublicKey, subscribe: pushSubscribe, blastWeekendPush, startPushScheduler } = require('../controllers/e3fPush');
const { createCompetition, listCompetitions, endCompetition, getActive } = require('../controllers/e3fArena');
// E5+E6 Phase 0: Competition engine + Boss battles + Adaptive
const { setCompetitionGames, getCompetitionGames, getDashboard, markStarted, trackProgress } = require('../controllers/kidsCompetition');
const { createRaid, getRaidDashboard, getActiveRaid, submitDamage, listRaids, setRaidGames, GUARDIANS } = require('../controllers/kidsBoss');
// v1 ADE (kidsAdaptive) + SRE (kidsSpacedRep) controllers removed (Q1 Phase 4
// cleanup) — ADE_V2 (BKT) + SRE_V2 (SM-2+) are the only engines.
// ── Q1 2027: NGEd-game — ADE v2 / SRE v2 / Economy / Shop ──
const adeV2 = require('../controllers/kidsAdaptiveV2');
const sreV2 = require('../controllers/kidsSpacedRepV2');
const econCtrl = require('../controllers/kidsEconomy');
const shopCtrl = require('../controllers/kidsShop');
// Phase 3: Parent Dashboard + Festival of Guardians
const parentCtrl = require('../controllers/kidsParent');
const festivalCtrl = require('../controllers/kidsFestival');
// Phase 4: Quick-Create + Analytics + Match History
const quickCreateCtrl = require('../controllers/kidsQuickCreate');
const analyticsCtrl = require('../controllers/kidsAnalytics');
const matchHistoryCtrl = require('../controllers/kidsMatchHistory');
// E4: Voice Notes (async teacher audio)
const { voiceNoteUploadMW, createVoiceNote, listVoiceNotes, listMyVoiceNotes, streamVoiceNoteAudio } = require("../controllers/e4VoiceNotes");

module.exports = (app) => {
  // ── Parent read-only activity feed ──────────────────────────────────────
  app.get('/kids/parent/activities', auth, listParentActivities);

  // ── Lessons (listing for students/parents + CRUD for staff) ──────────────
  app.get('/kids/lessons', auth, listLessons);
  app.get('/kids/nerdc/report', auth, requireStaff, nerdcReport);
  // ── FB-17 weekly competition ───────────────────────────────────────────
  app.get('/kids/leaderboard/me', auth, getMyStatus);
  app.get('/kids/leaderboard', auth, getLeaderboard);
  app.get('/kids/badges', auth, getMyBadges);
  // ── E3f: Weekend Challenge (personalized weekly review test) ───────────
  app.get('/kids/weekend-test', auth, getWeekendTest);
  // ── E3f: weekend push notifications (web-push VAPID) ────────────────────
  app.get('/kids/push/public-key', auth, getPublicKey);
  app.post('/kids/push/subscribe', auth, pushSubscribe);
  blastWeekendPush(false).catch((e) => console.error('e3fPush boot check:', e.message));
  startPushScheduler();
  // ── E3f: Class Arena (tug-of-war & trophy competitions) ─────────────────
  app.get('/kids/arena/active', auth, getActive);
  app.post('/kids/arena/create', auth, requireStaff, createCompetition);
  app.get('/kids/arena/list', auth, requireStaff, listCompetitions);
  app.post('/kids/arena/:id/end', auth, requireStaff, endCompetition);
  app.post('/kids/lessons', auth, requireStaff, createLesson);
  app.post('/kids/lessons/manual', auth, requireStaff, createLessonManual);

  // ── Children ────────────────────────────────────────────────────────────
  app.get('/kids/children', auth, listChildrenForParent);
  app.post('/kids/children', auth, requireStaff, createChild);
  app.post('/kids/children/create-for-parent', auth, createChildForParent);
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
  app.get('/kids/lessons/:id/game', auth, requireKidsEntitlement, getPublishedGame);
  app.get('/kids/lessons/:id/game/preview', auth, requireStaff, getGamePreview);
  app.get('/kids/lessons/:id/scenes', auth, requireKidsEntitlement, getPublishedScenes);
  app.get('/kids/scene-library', auth, requireStaff, getSceneLibrary);
  app.get('/kids/story-templates', auth, requireStaff, getStoryTemplates);
  app.get('/kids/learning-path', auth, requireKidsEntitlement, getLearningPath);
  app.get('/kids/goals/:admissionNo', auth, getChildGoal);
  app.post('/kids/goals/:admissionNo', auth, setChildGoal);

  // ── Generation job status (teacher/admin polling) ────────────────────────
  app.get('/kids/generation-jobs', auth, listGenerationJobs);
  app.get('/kids/generation-jobs/:id', auth, getGenerationJob);

  // ── Progress ────────────────────────────────────────────────────────────
  app.post('/kids/progress/game-complete', auth, (req, res, next) => {
    const denied = denyForeignChildData(req);
    if (denied) return res.status(denied.status).json(denied.body);
    next();
  }, recordGameComplete);
  // E2: offline queue drain — batch progress posts
  app.post('/kids/sync/batch', auth, syncBatch);
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
  app.get('/kids/series', auth, requireKidsEntitlement, listSeries);
  app.get('/kids/series/:id', auth, requireKidsEntitlement, getSeries);
  // E3: subject-grouped curriculum map w/ sequential gating
  app.get('/kids/curriculum', auth, getCurriculum);
  app.post('/kids/series/:id/units', auth, requireStaff, createUnit);
  app.put('/kids/series/:id/units/:unitId', auth, requireStaff, updateUnit);
  app.get('/kids/units/:id/lock-status', auth, getUnitLockStatus);
  app.get('/kids/lessons/:id/suggested-mode', auth, getUnitSuggestedMode);
  app.get('/kids/lessons/:id/next-up', auth, getLessonNextUp);

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
  app.post('/kids/test-scores/convert', auth, convertTestScores);
  app.post('/kids/series/:id/domesticate', auth, requireStaff, domesticateSeries);
  app.get('/kids/series-domestications', auth, requireStaff, listDomestications);

  // ── Parental Controls (Doc 17) ────────────────────────────────────
  app.get('/kids/parental-controls', auth, getParentalControls);
  app.post('/kids/parental-controls', auth, setParentalControls);
  app.get('/kids/parental-controls/check', auth, checkPlayAllowed);

  // ── E5 Phase 0: Competition Engine (enhanced arena) ────────────────────
  app.post('/kids/arena/:id/games', auth, requireStaff, setCompetitionGames);
  app.get('/kids/arena/:id/games', auth, getCompetitionGames);
  app.get('/kids/arena/:id/dashboard', auth, requireStaff, getDashboard);
  app.post('/kids/arena/:id/participants/start', auth, markStarted);
  app.post('/kids/arena/:id/participants/progress', auth, trackProgress);

  // ── E6 Phase 0: Boss Battles ───────────────────────────────────────────
  app.get('/kids/boss/raid/active', auth, getActiveRaid);
  app.post('/kids/boss/raid/create', auth, requireStaff, createRaid);
  app.get('/kids/boss/raids', auth, requireStaff, listRaids);
  app.get('/kids/boss/raid/:id/dashboard', auth, requireStaff, getRaidDashboard);
  app.post('/kids/boss/raid/:id/damage', auth, submitDamage);
  app.post('/kids/boss/raid/:id/games', auth, requireStaff, setRaidGames);
  app.get('/kids/boss/guardians', auth, (req, res) => {
    res.json({ success: true, data: GUARDIANS });
  });

  // ── Q1 2027: NGEd-game — ADE v2 (BKT) ───────────────────────────────
  app.post('/kids/adaptive/v2/update', auth, adeV2.updateProfile);
  app.get('/kids/adaptive/v2/profile', auth, adeV2.getProfile);
  app.get('/kids/adaptive/v2/next-item', auth, adeV2.getNextItems);
  app.get('/kids/adaptive/v2/skills', auth, adeV2.getSkills);

  // ── Q1 2027: NGEd-game — SRE v2 (SM-2+) ─────────────────────────────
  app.get('/kids/reviews/v2/today', auth, sreV2.getTodayReviews);
  app.post('/kids/reviews/v2/complete', auth, sreV2.completeReview);
  app.get('/kids/reviews/v2/stats', auth, sreV2.getStats);

  // ── Q1 2027: NGEd-game — Economy ────────────────────────────────────
  app.get('/kids/economy/balance', auth, econCtrl.getBalance);
  app.post('/kids/economy/earn', auth, econCtrl.earnXP);
  app.post('/kids/economy/streak/record', auth, econCtrl.recordStreak);

  // ── Q1 2027: NGEd-game — Shop ───────────────────────────────────────
  app.get('/kids/economy/shop', auth, shopCtrl.getShop);
  app.post('/kids/economy/shop/buy', auth, shopCtrl.buyItem);
  app.post('/kids/economy/shop/equip', auth, shopCtrl.equipItem);

  // ── Q2 2027: NGEd-game — Voice-First Learning (speech) ─────────────
  const speechCtrl = require('../controllers/kidsSpeech');
  app.post('/kids/speech/assess', auth, speechCtrl.assess);
  app.get('/kids/speech/progress', auth, speechCtrl.progress);

  // ── Revision (reinforcement-based) ────────────────────────────────────
  const revision = require('../controllers/kidsRevision');
  app.get('/kids/revision/status', auth, revision.getRevisionStatus);
  app.get('/kids/revision/nudges', auth, revision.getNudges);
  app.get('/kids/revision/failed-items', auth, revision.getFailedItems);
  app.post('/kids/revision/failed', auth, revision.recordFailed);
  app.post('/kids/revision/retry-correct', auth, revision.markRetryCorrect);
  app.get('/kids/revision/weekly', auth, revision.getWeeklySummary);

  // ── Phase 3: Parent Dashboard ──────────────────────────────────────────
  app.post('/kids/parent/login', parentCtrl.login);
  app.post('/kids/parent/register', parentCtrl.register);
  app.get('/kids/parent/children', auth, parentCtrl.getChildren);
  app.get('/kids/parent/child/:adm/progress', auth, parentCtrl.getChildProgress);
  app.get('/kids/parent/child/:adm/achievements', auth, parentCtrl.getChildAchievements);
  app.get('/kids/parent/child/:adm/controls', auth, parentCtrl.getChildControls);
  app.get('/kids/parent/child/:adm/report', auth, parentCtrl.getChildReport);
  app.get('/kids/parent/notifications', auth, parentCtrl.getNotifications);
  app.post('/kids/parent/notifications/:id/read', auth, parentCtrl.markRead);

  // ── Phase 3: Festival of Guardians ─────────────────────────────────────
  app.get('/kids/festival/active', auth, festivalCtrl.getActiveFestival);
  app.post('/kids/festival/create', auth, requireStaff, festivalCtrl.createFestival);
  app.post('/kids/festival/:id/damage', auth, festivalCtrl.dealDamage);
  app.get('/kids/festival/history', auth, festivalCtrl.getFestivalHistory);
  app.get('/kids/festival/guardians', auth, festivalCtrl.listGuardians);

  // ── Phase 4: Teacher Quick-Create ───────────────────────────────────────
  app.post('/kids/teacher/quizzes', auth, requireStaff, quickCreateCtrl.createQuiz);
  app.get('/kids/teacher/quizzes', auth, requireStaff, quickCreateCtrl.listQuizzes);
  app.get('/kids/teacher/quizzes/:id/questions', auth, requireStaff, quickCreateCtrl.getQuizQuestions);
  app.post('/kids/teacher/quizzes/:id/questions', auth, requireStaff, quickCreateCtrl.addQuestions);
  app.post('/kids/teacher/quizzes/:id/publish', auth, requireStaff, quickCreateCtrl.publishQuiz);
  app.post('/kids/teacher/quizzes/:id/unpublish', auth, requireStaff, quickCreateCtrl.unpublishQuiz);
  app.delete('/kids/teacher/quizzes/:id', auth, requireStaff, quickCreateCtrl.deleteQuiz);

  // ── Phase 4: Multi-School Analytics ─────────────────────────────────────
  app.get('/kids/analytics/overview', auth, requireStaff, analyticsCtrl.getOverview);
  app.get('/kids/analytics/classes', auth, requireStaff, analyticsCtrl.getClassComparison);
  app.get('/kids/analytics/struggling', auth, requireStaff, analyticsCtrl.getStrugglingStudents);
  app.get('/kids/analytics/games', auth, requireStaff, analyticsCtrl.getGameEngagement);
  app.get('/kids/analytics/leaderboard', auth, requireStaff, analyticsCtrl.getTopPerformers);

  // ── Flagship `elite` + subscriptions (spec C) ───────────────────────────
  app.get('/kids/subscription/plans', subCtrl.listPlans);              // public
  app.get('/kids/subscription/status', auth, subCtrl.getStatus);
  app.post('/kids/subscription/initiate', auth, subCtrl.initiate);
  app.post('/kids/subscription/verify', auth, subCtrl.verify);
  // Session-free checkout for the login wall (locked-school admins aren't logged in)
  app.post('/kids/subscription/public-initiate', subCtrl.publicInitiate);
  app.post('/kids/subscription/public-verify', subCtrl.publicVerify);
  // req.rawBody is captured by the global express.json({ verify }) in app.js
  app.post('/kids/paystack/webhook', subCtrl.webhook);

  // ── Phase 4: Match History ──────────────────────────────────────────────
  app.get('/kids/match-history', auth, matchHistoryCtrl.getMatchHistory);
  app.get('/kids/match-history/rivalry', auth, matchHistoryCtrl.getRivalry);
  // ── E4: Voice Notes (async teacher audio) ────────────────────────────────
  app.post("/kids/voice-notes", auth, requireStaff, voiceNoteUploadMW, createVoiceNote);
  app.get("/kids/voice-notes", auth, listVoiceNotes);
  app.get("/kids/voice-notes/mine", auth, requireStaff, listMyVoiceNotes);
  app.get("/kids/voice-notes/:id/audio", auth, streamVoiceNoteAudio);

  // ── Parent↔Child Chat ─────────────────────────────────────────────────
  const chatCtrl = require('../controllers/kidsChat');
  app.get('/kids/chat/:adm/messages', auth, chatCtrl.getMessages);
  app.post('/kids/chat/:adm/read', auth, chatCtrl.markRead);
  app.get('/kids/chat/:adm/unread', auth, chatCtrl.unreadCount);

  app.get('/kids/match-history/stats', auth, requireStaff, matchHistoryCtrl.getMatchStats);
};
