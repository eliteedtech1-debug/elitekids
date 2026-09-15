import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flame,
  Gamepad2,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  ShoppingBag,
  Route,
  Star,
  Zap,
  BookOpen,
  Trophy,
  RotateCcw,
  Swords,
  Sparkles,
  Mic,
  ChevronDown,
  Users,
  Home,
  TrendingUp,
} from 'lucide-react';

/* ── Lazy-loaded tab components (code-split per tab) ────────── */
const HomeTab = lazy(() => import('./tabs/HomeTab'));
const PlayTab = lazy(() => import('./tabs/PlayTab'));
const PathTab = lazy(() => import('./tabs/PathTab'));
const StatsTab = lazy(() => import('./tabs/StatsTab'));
const TeamsTab = lazy(() => import('./tabs/TeamsTab'));
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import RevisionCard from '@/components/RevisionCard';
import CheckpointTestOut from '@/components/CheckpointTestOut';
import BossBattleOverlay from '@/components/BossBattleOverlay';
import ReviewZone from '@/components/ReviewZone';
import OfflineIndicator from '@/components/OfflineIndicator';
import { playTap } from '@/lib/utils/sound';
import A11ySettings from '@/components/A11ySettings';
import SpeechSettings from '@/components/SpeechSettings';
import AppSwitcher from '@/components/AppSwitcher';
import OnboardingTour from '@/components/OnboardingTour';
import WelcomeSpotlight from '@/components/WelcomeSpotlight';
import CompanionSelect, { CompanionBubble } from '@/components/CompanionSelect';
import GardenScene from '@/components/GardenScene';
import KidPageBackground from '@/components/KidPageBackground';
import StudentLeaderboardPanel from './StudentLeaderboardPanel';
import StudentFestival from '@/components/StudentFestival';
import StudentLiveBar from '@/components/StudentLiveBar';
import StudentQuickNav from '@/components/StudentQuickNav';
import PlacementQuiz from '@/components/PlacementQuiz';
import PlacementIntro from '@/components/PlacementIntro';
import { AGE_LEVEL_COLORS } from '@/lib/utils/accessibility';
import { useA11yStore } from '@/lib/utils/a11y-store';
import { recordPlayDay, getStreakLocal, getStreakEmoji } from '@/lib/utils/streak';
import XPBar from '@/components/XPBar';
import StreakCounter from '@/components/StreakCounter';
import StreakReminder, { hasPlayedToday } from '@/components/StreakReminder';
import Shop, { SKIN_META, THEME_HEADER } from '@/components/Shop';
import ReviewDueBadge from '@/components/ReviewDueBadge';
import { warmCache, extractCacheableUrls } from '@/lib/utils/asset-cache';
import { offlineContent } from '@/lib/offline/content';
import { t, tN } from '@/lib/i18n';
import LearningPath from '@/components/LearningPath';
import GoalCard from '@/components/GoalCard';
import {
  classToAgeLevel,
  filterInBand,
  flattenUnits,
  ageLevelLabel,
  nerdcBandToAgeLevel,
  type GameMode,
  type LearningPathData,
  type WeeklyGoal,
} from '@/lib/utils/learningPath';
import TeamChallenge from '@/components/TeamChallenge';
import PeerTeachingBoard from '@/components/PeerTeachingBoard';
import ClassQuest from '@/components/ClassQuest';
import CollaborationBadge from '@/components/CollaborationBadge';

/* ── Types ────────────────────────────────────────────────────── */

interface LessonCard {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  created_at: string;
  has_games: boolean;
  nerdc_code?: string;
  nerdc_strand?: string;
  nerdc_sub_strand?: string;
}

interface GameStat {
  times_played: number;
  best_score: number;
  avg_score: number;
  total_stars: number;
}

interface ProgressData {
  total_xp: number;
  total_stars: number;
  games_completed: number;
  game_stats: Record<string, GameStat>;
  games: any[];
}

/* ── Tab definitions ────────────────────────────────────────── */

interface Tab {
  key: string;
  labelKey: string;
  icon: React.ReactNode;
  /** 'path' renders the LearningPath dashboard; 'grid' tabs list lessons. */
  view: 'path' | 'grid' | 'special';
  filter: (l: LessonCard) => boolean;
}

// Home = info dashboard (garden, companion, streak). Play = games grid.
// Path = learning path. Stats = review stats & per-game progress.
const TABS: Tab[] = [
  { key: 'home', labelKey: 'student.tab.home', icon: <Home className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'play', labelKey: 'student.tab.play', icon: <Gamepad2 className="h-4 w-4" />, view: 'grid', filter: () => true },
  { key: 'path', labelKey: 'student.tab.path', icon: <Route className="h-4 w-4" />, view: 'path', filter: () => false },
  { key: 'stats', labelKey: 'student.tab.stats', icon: <TrendingUp className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'festival', labelKey: 'student.tab.festival', icon: <Swords className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'leaderboard', labelKey: 'student.tab.leaderboard', icon: <Trophy className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'teams', labelKey: 'collab.myTeam', icon: <Users className="h-4 w-4" />, view: 'special', filter: () => true },
];

/**
 * Subject chips for the Home grid — the old per-subject tabs, minus the tabs.
 * Same predicates, so every in-band game stays reachable from one screen.
 */
const SUBJECT_FILTERS: Array<{ key: string; labelKey: string; test: (l: LessonCard) => boolean }> = [
  { key: 'all', labelKey: 'student.filter.all', test: () => true },
  { key: 'numbers', labelKey: 'student.tab.numbers', test: (l) => /count|number|math|drag-sort/i.test(l.subject + l.title) },
  { key: 'letters', labelKey: 'student.tab.letters', test: (l) => /abc|letter|english|phon/i.test(l.subject + l.title) },
  { key: 'colors', labelKey: 'student.tab.colors', test: (l) => /color|art|creati/i.test(l.subject + l.title) },
  { key: 'shapes', labelKey: 'student.tab.shapes', test: (l) => /shape|pattern|geom/i.test(l.subject + l.title) },
  { key: 'animals', labelKey: 'student.tab.animals', test: (l) => /animal|pet|farm/i.test(l.subject + l.title) },
  { key: 'food', labelKey: 'student.tab.food', test: (l) => /fruit|veggie|food|eat/i.test(l.subject + l.title) },
];

/** Home grid sections — the progression order a child is meant to meet them in. */
const HOME_SECTION_LABEL: Record<string, string> = {
  next: 'student.home.sectionNext',
  open: 'student.home.sectionUnlocked',
  locked: 'student.home.sectionLocked',
};

type HomeGridItem =
  | {
      kind: 'section';
      key: string;
      count: number;
      /** Subjects present in a locked group — each gets a test-out offer. */
      seriesIds?: string[];
    }
  | {
      kind: 'lesson';
      lesson: LessonCard;
      locked: boolean;
      lockedReason: string | null;
      passed: boolean;
      /** Satisfied by an approved test-out — done for the lock, not mastered. */
      exempt: boolean;
      seriesId: string | null;
      isNext: boolean;
    };

/* ── Age-level badge colors (from accessibility palette) ── */

function getAgeColor(ageLevel: string, colorblind: boolean): string {
  const entry = AGE_LEVEL_COLORS[ageLevel];
  if (!entry) return 'bg-gray-100 text-gray-600';
  return colorblind ? entry.colorblind : entry.standard;
}

/* ── Floating decoration for game feel ─────────────────────── */
function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-20 ${className}`} />
  );
}

/* ── Main Component ─────────────────────────────────────────── */

function decodeToken(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export default function StudentHome() {
  const navigate = useNavigate();
  const [student, setStudent] = useState<Record<string, any> | null>(null);
  const [lessons, setLessons] = useState<LessonCard[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  // Subject chip on the Home grid — 'all' lists every in-band game.
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [pathData, setPathData] = useState<LearningPathData | null>(null);
  const [showBossRaid, setShowBossRaid] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWelcomeSpotlight, setShowWelcomeSpotlight] = useState(false);
  const [companion, setCompanion] = useState<any>(null);
  const [showCompanionSelect, setShowCompanionSelect] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [streak, setStreak] = useState(() => getStreakLocal());
  const [showShop, setShowShop] = useState(false);
  // Q4: placement quiz — offered on empty catalog (elder/unmapped classes).
  const [showPlacementQuiz, setShowPlacementQuiz] = useState(false);
  // Flagship placement gate: flagship kids measure + place BEFORE the dashboard
  // (backend outranks class_name for them). Non-flagship → denied → dashboard.
  const [placement, setPlacement] = useState<{
    loaded: boolean;
    denied: boolean;
    placed: boolean;
    nerdc_band: string | null;
  }>({ loaded: false, denied: true, placed: false, nerdc_band: null });
  // Sequential board: level/streak DETAILS stay collapsed until the kid taps
  // the summary chip (the 4-stat row already shows streak+XP — no dupe text).
  const [showProgressDetail, setShowProgressDetail] = useState(false);
  // Q1: equipped shop items (keyed by item_type) — applied to rendering below.
  const [equippedItems, setEquippedItems] = useState<Record<string, any>>({});
  const [reviewDue, setReviewDue] = useState(0);
  const [economy, setEconomy] = useState<{
    xp_total: number;
    level: number;
    level_name: string | null;
    streak: { current: number; longest: number; freeze_count: number };
    multiplier: number;
    title: string | null;
  } | null>(null);
  const { colorblindMode } = useA11yStore();

  /* ── Live feed: tabs with new content since last viewed ──────── */
  const [tabFeeds, setTabFeeds] = useState<Record<string, { hasNew: boolean; count: number; viewed?: boolean }>>({});
  const lastViewedRef = useState<Record<string, number>>({} )[0];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setOfflineMode(false);
    let lessonsData: any[] = [];
    let offlineHydrated = false;
    let decoded: Record<string, any> | null = null;
    try {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
      decoded = decodeToken(token);
      setStudent(decoded);

      const admissionNo = decoded?.admission_no || decoded?.id;

      // Discover the student's team from the server so the collaboration tab
      // remains reachable even when the JWT predates Q3 team membership.
      if (admissionNo && String(decoded?.user_type || '').toLowerCase() === 'student') {
        const teamRes = await apiClient.get(ENDPOINTS.COLLAB.TEAMS_MINE).catch(() => null);
        const team = teamRes?.data?.data;
        if (team) {
          const nextStudent = { ...decoded, team_id: team.id, class_code: team.class_id || decoded?.class_code };
          decoded = nextStudent;
          setStudent(nextStudent);
        }
      }

      // Flagship placement gate decision (student users only — the server
      // denies placement for non-flagship schools, which clears the gate).
      if (admissionNo && String(decoded?.user_type || '').toLowerCase() === 'student') {
        try {
          const plRes = await apiClient.get(ENDPOINTS.PLACEMENT.STATUS);
          const pl = plRes.data?.data;
          setPlacement({
            loaded: true,
            denied: false,
            placed: Boolean(pl?.placed),
            nerdc_band: pl?.nerdc_band ?? null,
          });
        } catch {
          // Non-flagship or unreachable — never block the dashboard on it.
          setPlacement({ loaded: true, denied: true, placed: false, nerdc_band: null });
        }
      }

      // Welcome tour: gate on server-side onboarding status independently of
      // catalog/offline state so first-time students always see the tour right
      // after login (the tour was previously only triggered if the catalog
      // fetch hydrated fresh, which skipped it for any cache hit).
      if (admissionNo) {
        const onbRes = await apiClient
          .get(ENDPOINTS.ONBOARDING.STATUS(admissionNo))
          .catch(() => ({ data: { data: { completed: false } } }));
        const completed = Boolean(onbRes.data?.data?.completed);
        if (!completed) {
          setShowOnboarding(true);
        } else {
          // Returning-and-already-played user only — the weekly-goal
          // spotlight is meaningless for a brand-new student who hasn't
          // completed a game yet. New students go straight to the path.
          const progRes = await apiClient
            .get(ENDPOINTS.PROGRESS.CHILD(admissionNo))
            .catch(() => null);
          const prog = progRes?.data?.data || {};
          const isReturning =
            Number(prog?.games_completed || 0) > 0 ||
            Number(prog?.total_stars || 0) > 0 ||
            Number(prog?.total_xp || 0) > 0;
          if (isReturning) {
            const welcomeSeen = sessionStorage.getItem('welcome-spotlight-seen');
            if (!welcomeSeen) {
              setShowWelcomeSpotlight(true);
              sessionStorage.setItem('welcome-spotlight-seen', '1');
            }
          }
          const compRes = await apiClient
            .get(ENDPOINTS.COMPANION.GET(admissionNo))
            .catch(() => ({ data: { data: null } }));
          if (compRes.data?.data) {
            setCompanion(compRes.data.data);
          } else {
            setShowCompanionSelect(true);
          }
        }
      }

      const lessonsRes = await apiClient
        .get(ENDPOINTS.LESSONS.LIST, { params: { content_state: 'published' } })
        .catch(() => null);
      if (lessonsRes) {
        lessonsData = lessonsRes.data?.data || [];
        setLessons(lessonsData);
        offlineContent.saveCatalog(lessonsData).catch(() => {});
      } else {
        const cachedLessons = await offlineContent.loadCatalog().catch(() => null);
        if (cachedLessons && cachedLessons.length > 0) {
          lessonsData = cachedLessons as any[];
          setLessons(lessonsData);
          setOfflineMode(true);
          offlineHydrated = true;
        }
      }

      if (admissionNo) {
        try {
          const progressRes = await apiClient.get(ENDPOINTS.PROGRESS.CHILD(admissionNo));
          const progressData = progressRes.data?.data || {
            total_xp: 0,
            total_stars: 0,
            games_completed: 0,
            game_stats: {},
            games: [],
          };
          setProgress(progressData);
          offlineContent.saveProgress(String(admissionNo), progressData).catch(() => {});
        } catch (progressErr: any) {
          const cachedProgress = await offlineContent
            .loadProgress(String(admissionNo))
            .catch(() => null);
          if (cachedProgress) {
            setProgress(cachedProgress as ProgressData);
          } else if (!offlineHydrated) {
            throw progressErr;
          }
        }

        // Q1 engagement economy: balance (XP/level/streak) for XPBar + StreakCounter
        apiClient
          .get(ENDPOINTS.ECONOMY.BALANCE)
          .then((r) => {
            const d = r.data?.data;
            if (d) {
              setEconomy({
                xp_total: Number(d.xp_total) || 0,
                level: Number(d.level) || 1,
                level_name: d.level_name ?? null,
                streak: {
                  current: Number(d.streak?.current) || 0,
                  longest: Number(d.streak?.longest) || 0,
                  freeze_count: Number(d.streak?.freeze_count) || 0,
                },
                multiplier: Number(d.multiplier) || 1,
                title: d.title ?? null,
              });
            }
          })
          .catch(() => {});

        // Q1 reviews v2: due-count for the ReviewDueBadge (scrolls to ReviewZone)
        apiClient
          .get(ENDPOINTS.REVIEWS_V2.TODAY)
          .then((r) => setReviewDue(Number(r.data?.data?.due_count) || 0))
          .catch(() => {});

        // Learning path + embedded weekly goal (server band-caps, locks and
        // orders spill-over first). Falls back to the cached snapshot offline.
        const pathRes = await apiClient
          .get(ENDPOINTS.LEARNING_PATH(String(admissionNo)))
          .catch(() => null);
        if (pathRes?.data?.data) {
          setPathData(pathRes.data.data);
          offlineContent.saveLearningPath(String(admissionNo), pathRes.data.data).catch(() => {});
        } else {
          const cachedPath = await offlineContent.loadLearningPath(String(admissionNo)).catch(() => null);
          if (cachedPath) {
            setPathData(cachedPath as LearningPathData);
            setOfflineMode(true);
            offlineHydrated = true;
          }
        }

        if (!offlineHydrated) {
          // (onboarding + companion already handled above, independently of
          // catalog/offline hydration state, so the tour fires reliably.)
        }
      }
    } catch (err: any) {
      setError(err?.message || t('student.home.loadFailed'));
    } finally {
      setLoading(false);
      const admissionNo = student?.admission_no || student?.id || '';
      recordPlayDay(admissionNo).then(setStreak).catch(() => {});
      try {
        if (!navigator.onLine) throw new Error('offline — skipping cache warm');
        const allUrls: string[] = [];
        for (const lesson of lessonsData) {
          const gameRes = await apiClient.get(ENDPOINTS.LESSONS.GAME(lesson.id)).catch(() => ({ data: null }));
          const gameData: any = (gameRes.data as any)?.data || gameRes.data;
          if (gameData?.template) {
            offlineContent.saveGamePayload(lesson.id, gameData).catch(() => {});
          }
          if (gameData?.config_json) {
            allUrls.push(...extractCacheableUrls(gameData.config_json));
          }
        }
        if (allUrls.length > 0) {
          warmCache(allUrls).then((r) => {
            if (r.cached > 0) console.log(`[AssetCache] Warmed ${r.cached} assets`);
          });
        }
      } catch {
        // Non-blocking — cache warming is optional
      }
      const schoolId = String(decoded?.school_id || '');
      if (schoolId && navigator.onLine) {
        offlineContent.prefetchAll(schoolId).then((n) => {
          if (n > 0) console.log(`[Offline] Prefetched ${n} lessons`);
        }).catch(() => {});
      }
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Live feed polling: check for new content every 30s ─────── */
  useEffect(() => {
    if (!student) return;
    const admissionNo = String(student?.admission_no || student?.id || '');
    if (!admissionNo) return;

    const checkFeeds = async () => {
      try {
        // Check for new reviews due
        const reviewRes = await apiClient.get(ENDPOINTS.REVIEWS_V2.TODAY).catch(() => null);
        const newReviewDue = Number(reviewRes?.data?.data?.due_count) || 0;
        
        // Check for new team activity
        const teamRes = await apiClient.get(ENDPOINTS.COLLAB.TEAMS_MINE).catch(() => null);
        const hasTeam = Boolean(teamRes?.data?.data);
        
        // Check for new path updates (new units unlocked)
        const pathRes = await apiClient.get(ENDPOINTS.LEARNING_PATH(admissionNo)).catch(() => null);
        const newPathData = pathRes?.data?.data;
        const newUnitsUnlocked = newPathData?.path?.some((s: any) => 
          s.units?.some((u: any) => !u.locked && u.lessons?.some((l: any) => l.state === 'new'))
        ) || false;

        setTabFeeds(prev => ({
          ...prev,
          reviews: { 
            hasNew: newReviewDue > (prev.reviews?.count || 0) && newReviewDue > 0, 
            count: newReviewDue 
          },
          teams: { 
            hasNew: hasTeam && !prev.teams?.viewed, 
            count: hasTeam ? 1 : 0 
          },
          path: { 
            hasNew: newUnitsUnlocked && !prev.path?.viewed, 
            count: newUnitsUnlocked ? 1 : 0 
          },
        }));
      } catch {
        // Non-blocking — feed updates are optional
      }
    };

    // Initial check after 5s
    const initialTimer = setTimeout(checkFeeds, 5000);
    // Then every 30s
    const interval = setInterval(checkFeeds, 30000);
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [student]);

  // Mark tab as viewed when opened
  const handleTabChange = useCallback((tabKey: string) => {
    playTap();
    setActiveTab(tabKey);
    setTabFeeds(prev => ({
      ...prev,
      [tabKey]: { ...prev[tabKey], hasNew: false, viewed: true },
    }));
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.PARENT_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.STUDENT_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
    localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_BRANCH);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    navigate('/login');
  }, [navigate]);

  // Band source depends on the student type (mirrors the server):
  //   flagship kids — the placement result is the measure (outranks class_name);
  //   every other kid — class_name → classToAgeLevel, exactly as before.
  const studentBand = useMemo(() => {
    if (placement.placed && placement.nerdc_band) {
      const legacy = nerdcBandToAgeLevel(placement.nerdc_band);
      if (legacy) return legacy;
    }
    return classToAgeLevel(student?.class_name);
  }, [placement.placed, placement.nerdc_band, student?.class_name]);

  const isStudent = String(student?.user_type || '').toLowerCase() === 'student';
  const isFlagshipStudent = isStudent && placement.loaded && !placement.denied;
  // No placement-gate for non-flagship kids — their level comes from class_name.
  const showPlacementGate = isFlagshipStudent && !placement.placed;

  // A "returning" student has at least one completed game or any prior
  // progress row. New students see the OnboardingTour + CompanionSelect +
  // LearningPath only — no weekly goal until they've actually played.
  const isReturningStudent = useMemo(() => {
    const completed = Number(progress?.games_completed || 0);
    const stars = Number(progress?.total_stars || 0);
    const xp = Number(progress?.total_xp || 0);
    return completed > 0 || stars > 0 || xp > 0;
  }, [progress?.games_completed, progress?.total_stars, progress?.total_xp]);

  // Truly-empty catalog = NO published lessons exist at all (absence of
  // data). Distinguishes the "check back soon" case (teacher hasn't created
  // content) from the age-band case (data exists but filtered out — which
  // must NEVER be empty per the review/remedial guarantee).
  const catalogEmpty = lessons.length === 0;

  // Subject tabs list ONLY lessons at-or-below the child's band — a hard
  // ceiling, no exact → adjacent → ALL fallback (the live list is already
  // band-capped server-side; this keeps the offline catalog honest too).
  const bandLessons = useMemo(() => filterInBand(lessons, studentBand), [lessons, studentBand]);
  const gridLessons = useMemo(() => {
    const tab = TABS.find((x) => x.key === activeTab);
    const base = tab && tab.view === 'grid' ? bandLessons.filter(tab.filter) : bandLessons;
    if (activeTab !== 'play') return base;
    const chip = SUBJECT_FILTERS.find((f) => f.key === subjectFilter);
    return chip ? base.filter(chip.test) : base;
  }, [bandLessons, activeTab, subjectFilter]);

  /**
   * Lesson lock state, straight from the server path: the lock lives on the
   * UNIT (E3f gate — a unit opens once every prerequisite lesson has practice
   * AND a passed test) and its lessons inherit it. Lessons the path doesn't
   * cover (e.g. an offline catalog) are treated as open so nothing silently
   * disappears from the child's screen.
   */
  const lessonLock = useMemo(() => {
    const map = new Map<
      string,
      {
        locked: boolean;
        reason: string | null;
        passed: boolean;
        exempt: boolean;
        order: number;
        seriesId: string | null;
      }
    >();
    let order = 0;
    for (const { series, unit } of flattenUnits(pathData)) {
      for (const l of unit.lessons) {
        map.set(l.lesson_id, {
          locked: unit.locked,
          reason: unit.locked_reason,
          // 'tested_out' counts as done for the lock, but never as a pass — the
          // card gets its own badge rather than a green tick.
          passed: l.state === 'passed',
          exempt: l.state === 'tested_out',
          order: order++,
          seriesId: series.series_id ?? null,
        });
      }
    }
    return map;
  }, [pathData]);

  /**
   * Home lists the games by progression rather than as one flat dump:
   * Up Next (the game the path says is due) → Unlocked → Locked (with the
   * prerequisite reason), all still narrowed by the subject chip.
   */
  const homeItems = useMemo<HomeGridItem[]>(() => {
    const decorated = gridLessons
      .map((lesson) => {
        const p = lessonLock.get(lesson.id);
        return {
          lesson,
          locked: p?.locked ?? false,
          lockedReason: p?.reason ?? null,
          passed: p?.passed ?? false,
          exempt: p?.exempt ?? false,
          seriesId: p?.seriesId ?? null,
          order: p?.order ?? Number.MAX_SAFE_INTEGER,
        };
      })
      // Path order first (what the child is actually up to), then any game the
      // path doesn't cover. Stable, so the grid never reshuffles between renders.
      .sort((a, b) => a.order - b.order);

    // No path data (offline / first paint) → plain list, no lock furniture.
    if (lessonLock.size === 0) {
      return decorated.map((d) => ({
        kind: 'lesson' as const,
        lesson: d.lesson,
        locked: false,
        lockedReason: null,
        passed: d.passed,
        exempt: d.exempt,
        seriesId: d.seriesId,
        isNext: false,
      }));
    }

    // A tested-out game is not the child's next step — they have just jumped
    // past it. It stays visible and playable, just never 'Up Next'.
    const next = decorated.filter((d) => !d.locked && !d.passed && !d.exempt).slice(0, 1);
    const nextIds = new Set(next.map((d) => d.lesson.id));
    const open = decorated.filter((d) => !d.locked && !nextIds.has(d.lesson.id));
    const locked = decorated.filter((d) => d.locked);

    const items: HomeGridItem[] = [];
    const section = (key: string, cards: typeof decorated) => {
      if (!cards.length) return;
      // The locked group is where a jump-ahead belongs: offer it per subject so
      // an advanced child can challenge exactly the chain that is holding them.
      const seriesIds =
        key === 'locked'
          ? [...new Set(cards.map((d) => d.seriesId).filter((id): id is string => !!id))]
          : undefined;
      items.push({ kind: 'section', key, count: cards.length, seriesIds });
      for (const d of cards) {
        items.push({ kind: 'lesson', ...d, isNext: key === 'next' });
      }
    };
    section('next', next);
    section('open', open);
    section('locked', locked);
    return items;
  }, [gridLessons, lessonLock]);

  /** Open a lesson from the path in the mode its state calls for. */
  const openLesson = useCallback((lessonId: string, mode: GameMode) => {
    playTap();
    navigate(`/student/game/${lessonId}?mode=${mode}`);
  }, [navigate]);

  /** Subject names for the test-out offers, keyed by series id. */
  const seriesNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of pathData?.path || []) map.set(s.series_id, s.name);
    return map;
  }, [pathData]);

  /** Re-read the path after a test-out unlocks the chain. */
  const refreshPath = useCallback(async () => {
    const admissionNo = String(student?.admission_no || student?.id || '');
    if (!admissionNo) return;
    const res = await apiClient.get(ENDPOINTS.LEARNING_PATH(admissionNo)).catch(() => null);
    if (res?.data?.data) {
      setPathData(res.data.data);
      offlineContent.saveLearningPath(admissionNo, res.data.data).catch(() => {});
    }
  }, [student]);

  /** Keep the path payload's embedded goal in sync after a child sets it. */
  const handleGoalUpdated = useCallback((goal: WeeklyGoal) => {
    setPathData((prev) => (prev ? { ...prev, goal } : prev));
  }, []);

  const scrollToReviewZone = useCallback(() => {
    playTap();
    document.getElementById('review-zone')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleShopBalance = useCallback((newBalance: number) => {
    setEconomy((prev) => (prev ? { ...prev, xp_total: newBalance } : prev));
  }, []);

  // Q1: equipped state applied to rendering — refetch when the shop closes
  // (equip happens inside the modal) and on mount.
  const loadEquippedItems = useCallback(async () => {
    try {
      const { data } = await apiClient.get(ENDPOINTS.ECONOMY.SHOP);
      const cats: any[] = data?.data?.categories || [];
      const map: Record<string, any> = {};
      cats.forEach((c: any) =>
        (c.items || []).forEach((it: any) => {
          if (it.equipped) map[it.type || it.item_type] = it;
        }),
      );
      setEquippedItems(map);
    } catch { /* non-fatal — default look */ }
  }, []);

  useEffect(() => {
    loadEquippedItems();
  }, [loadEquippedItems, showShop]);

  // Companion skin + theme derived from equipped items.
  const equippedSkin = equippedItems['companion_skin'];
  const skin = equippedSkin
    ? {
        name: equippedSkin.name,
        ...(SKIN_META[equippedSkin.id] || { emoji: '🦊', ringClass: 'ring-amber-300 bg-amber-50' }),
      }
    : null;
  const equippedTheme = equippedItems['theme'];
  const headerTheme = equippedTheme ? THEME_HEADER[equippedTheme.id] || null : null;

  const displayName = student?.student_name || student?.name || student?.admission_no || t('student.home.defaultName');
  const summary = progress || { total_xp: 0, total_stars: 0, games_completed: 0, game_stats: {} } as ProgressData;
  const gameStats = progress?.game_stats || {};
  // Per-game progress now lives on the Progress tab instead of on every card.
  const playedLessons = useMemo(
    () =>
      bandLessons
        .map((lesson) => ({ lesson, stat: gameStats[lesson.id] }))
        .filter((x): x is { lesson: LessonCard; stat: GameStat } => !!x.stat && (x.stat.times_played || 0) > 0)
        .sort((a, b) => (b.stat.times_played || 0) - (a.stat.times_played || 0)),
    [bandLessons, gameStats],
  );

  // Flagship children without a completed placement result get a dedicated,
  // isolated "find your level" screen instead of the dashboard (no skip).
  if (showPlacementGate) {
    return (
      <div className="min-h-screen relative overflow-x-clip">
        <PlacementIntro
          onStart={() => setShowPlacementQuiz(true)}
          onSignOut={handleLogout}
        />
        {/* The quiz itself stays an overlay so a mid-quiz close returns to
            the intro, never to the dashboard. */}
        <PlacementQuiz
          open={showPlacementQuiz}
          onClose={() => setShowPlacementQuiz(false)}
          onPlaced={() => {
            void loadData();
          }}
        />
      </div>
    );
  }

  return (
    // overflow-x-clip: no page-level horizontal scroll on mobile (decorative
    // blobs and tight header rows must never push the layout wider).
    <div className="min-h-screen relative overflow-x-clip">
      <KidPageBackground />
      {/* Floating quick-nav FAB — direct child of the page root so its z-index
          is scoped here, above the header/live-bar contexts below. */}
      <StudentQuickNav
        onOpenShop={() => setShowShop(true)}
        onOpenGames={() => {
          setActiveTab('path');
          document.getElementById('welcome-learning-path')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const firstGridTab = TABS.find((tb) => tb.view === 'grid' && bandLessons.filter(tb.filter).length > 0);
          if (firstGridTab) {
            setActiveTab(firstGridTab.key);
            document.getElementById('welcome-learning-path')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }

          const gridEl = document.getElementById('games-grid-anchor');
          if (gridEl) {
            setTimeout(() => gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
            return;
          }
          setTimeout(() => {
            document.getElementById('games-grid-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }}
        onOpenReview={scrollToReviewZone}
      />
      {/* Onboarding Tour (first-time only) */}
      {showOnboarding && (
        <OnboardingTour onComplete={() => {
          setShowOnboarding(false);
          if (!companion) setShowCompanionSelect(true);
          // The tour's "How old are you?" step may have just declared the
          // child's age band — reload so the path/lessons reflect it.
          loadData();
          // No welcome spotlight for first-time students — the goal/spotlight
          // is a returning-student affordance. They see the path immediately
          // and the spotlight will fire on the next login if they play.
        }} />
      )}
      {/* Returning-student welcome spotlight (post-login hint at the goal) */}
      {showWelcomeSpotlight && !showOnboarding && (
        <WelcomeSpotlight onClose={() => setShowWelcomeSpotlight(false)} />
      )}
      {/* Companion Select (first-time choosing) */}
      {showCompanionSelect && (
        <CompanionSelect onComplete={() => {
          setShowCompanionSelect(false);
          const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
          try {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
            const id = decoded.admission_no || decoded.id;
            apiClient.get(ENDPOINTS.COMPANION.GET(id)).then((r) => setCompanion(r.data?.data)).catch(() => {});
          } catch {}
        }} />
      )}

      {/* Header — game-style glassmorphism with gradient */}
      {/* STACKING FIX: the header itself used to carry backdrop-blur +
          overflow-hidden, which made it a stacking context AND the containing
          block for the fixed dropdown panels (Settings/Speech/Apps). They were
          therefore painted under later siblings (main z-10, StudentLiveBar
          z-40) and were unclickable. The header element is now a plain
          'relative' box; blur + decoration live on an inner pointer-events-none
          layer, and the content row gets an explicit z-30 so dropdowns escape
          the header cleanly. */}
      <header className="relative border-b border-white/20">
        <div className="pointer-events-none absolute inset-0">
          <div className={`absolute inset-0 bg-gradient-to-r backdrop-blur-xl ${headerTheme || 'from-[#0F4D92]/90 via-[#0F4D92]/85 to-[#0d9488]/90'}`} />
          <FloatingDeco className="absolute -right-10 -top-10 h-32 w-32 bg-gradient-to-br from-[#0d9488] to-emerald-400" />
          <FloatingDeco className="absolute -left-8 -bottom-8 h-24 w-24 bg-gradient-to-br from-[#C90016] to-red-400" />
        </div>
        <div className="relative z-30 mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div className="relative">
              <img src="/logo.svg" alt={t('login.brand')} className="h-12 w-12 rounded-2xl object-contain shadow-xl shadow-black/20 ring-2 ring-white/30" />
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 border-2 border-white shadow-sm animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base sm:text-lg font-extrabold leading-tight text-white drop-shadow-md animate-game-slide-left">{t('login.brand')}</h1>
              <p className="truncate text-[11px] sm:text-xs text-white/70 font-medium">{t('student.home.hello', { name: displayName })}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <ReviewDueBadge dueCount={reviewDue} onClick={scrollToReviewZone} />
            <button
              onClick={() => { playTap(); navigate('/student/speech'); }}
              aria-label={t('student.home.speak')}
              title={t('student.home.speakDesc')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-2 py-2 sm:px-3 text-sm font-medium text-white transition hover:bg-white/25 hover:shadow-md active:scale-95"
            >
              <Mic className="h-5 w-5" />
              <span className="hidden sm:inline">{t('student.home.speak')}</span>
            </button>
            <button
              onClick={() => { playTap(); setShowShop(true); }}
              aria-label={t('student.home.shop')}
              title={t('student.home.shopDesc')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-2 py-2 sm:px-3 text-sm font-medium text-white transition hover:bg-white/25 hover:shadow-md active:scale-95"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="hidden sm:inline">{t('student.home.shop')}</span>
            </button>
            <AppSwitcher />
            <A11ySettings />
            <SpeechSettings />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-2 py-2 sm:px-3 text-sm font-medium text-white transition hover:bg-white/25 hover:shadow-md active:scale-95"
            >
              <LogOut className="h-5 w-5" /> <span className="hidden sm:inline">{t('dashboard.signOut')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Live audio bar */}
      <StudentLiveBar />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* ── Home (info) tab: companion, streak, garden ── */}
        {activeTab === 'home' && (
          <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
            <HomeTab
              companion={companion}
              equippedItems={equippedItems}
              streak={streak}
              economy={economy}
              isReturningStudent={isReturningStudent}
              showOnboarding={showOnboarding}
              showCompanionSelect={showCompanionSelect}
              pathData={pathData}
              skin={skin}
              headerTheme={headerTheme}
              showWelcomeSpotlight={showWelcomeSpotlight}
            />
          </Suspense>
        )}

        {/* ── Stats tab: progress summary + per-game stats ── */}
        {activeTab === 'progress' && (
          <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
            <StatsTab
              progress={progress}
              economy={economy}
              bandLessons={bandLessons}
              pathData={pathData}
              isReturningStudent={isReturningStudent}
              showWelcomeSpotlight={showWelcomeSpotlight}
              loading={loading}
              handleGoalUpdated={handleGoalUpdated}
            />
          </Suspense>
        )}

        {/* Boss Battle Overlay */}
        <div className="mb-5">
          <BossBattleOverlay onDismiss={() => setShowBossRaid(false)} />
        </div>

        {/* Offline Indicator */}
        <OfflineIndicator silent />

        {/* Daily & Weekly Revision */}
        <div className="mb-5">
          <RevisionCard />
        </div>

        {/* Review Zone (spaced repetition) — ReviewDueBadge scrolls here */}
        <div id="review-zone" className="mb-5 scroll-mt-4">
          <ReviewZone />
        </div>

        {error && !offlineMode && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-md">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4D92] to-[#0d9488] shadow-lg shadow-[#0F4D92]/30 ring-2 ring-white/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-400">{t('student.home.loading')}</span>
          </div>
        ) : (
          <>
            {/* Collaboration notification rail */}
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-lg shadow-[#0F4D92]/5 backdrop-blur-xl animate-game-slide-up">
              <CollaborationBadge
                classId={student?.class_code ? String(student.class_code) : undefined}
                childAdmissionNo={String(student?.admission_no || student?.id || '')}
              />
              <div className="flex-1" />
              <button
                onClick={() => handleTabChange('teams')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#0d9488] to-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-[#0d9488]/25 transition hover:shadow-lg hover:scale-105 active:scale-95"
              >
                <Users className="h-3.5 w-3.5" />
                {t('collab.myTeam', { defaultValue: 'Teams' })}
              </button>
            </div>

            {/* Tabs — game-style pill navigation with live feed badges */}
            <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {(() => {
                const anyGridLesson = bandLessons.length > 0;
                let gridShown = 0;
                return TABS.map((tab, idx) => {
                  const count = tab.view === 'grid' ? bandLessons.filter(tab.filter).length : 0;
                  const hideEmptyGrid = tab.view === 'grid' && count === 0 && (gridShown > 0 || anyGridLesson);
                  if (hideEmptyGrid) return null;
                  if (tab.view === 'grid') gridShown++;
                  
                  const feed = tabFeeds[tab.key];
                  const hasLiveFeed = feed?.hasNew && activeTab !== tab.key;
                  
                  return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-bold transition-all animate-game-slide-up stagger-${Math.min(idx + 1, 12)} ${
                      activeTab === tab.key
                        ? 'bg-gradient-to-r from-[#0F4D92] to-[#0d9488] text-white shadow-lg shadow-[#0F4D92]/25 scale-105 ring-2 ring-white/30'
                        : 'bg-white/80 backdrop-blur-sm text-gray-600 hover:bg-white hover:shadow-md border border-gray-100'
                    }`}
                  >
                    {tab.icon}
                    {t(tab.labelKey)}
                    {tab.view === 'grid' && (
                      <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.key ? 'bg-white/20' : 'bg-gray-100'}`}>
                        {count}
                      </span>
                    )}
                    {/* Live feed indicator — pulsing dot for new content */}
                    {hasLiveFeed && (
                      <span className="absolute -right-1 -top-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white" />
                      </span>
                    )}
                  </button>
                  );
                });
              })()}
            </div>

            {activeTab === 'festival' ? (
              <StudentFestival onGoPlay={() => navigate('/student')} />
            ) : activeTab === 'leaderboard' ? (
              <StudentLeaderboardPanel />
            ) : activeTab === 'teams' ? (
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
                <TeamsTab student={student} />
              </Suspense>
            ) : activeTab === 'progress' ? (
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
                <StatsTab
                  progress={progress}
                  economy={economy}
                  bandLessons={bandLessons}
                  pathData={pathData}
                  isReturningStudent={isReturningStudent}
                  showWelcomeSpotlight={showWelcomeSpotlight}
                  loading={loading}
                  handleGoalUpdated={handleGoalUpdated}
                />
              </Suspense>
            ) : activeTab === 'path' ? (
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
                <PathTab
                  pathData={pathData}
                  loading={loading}
                  offlineMode={offlineMode}
                  catalogEmpty={catalogEmpty}
                  loadData={loadData}
                  setSubjectFilter={setSubjectFilter}
                  setActiveTab={setActiveTab}
                  openLesson={openLesson}
                />
              </Suspense>
            ) : (
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
                <PlayTab
                  bandLessons={bandLessons}
                  gridLessons={gridLessons}
                  homeItems={homeItems}
                  gameStats={gameStats}
                  subjectFilter={subjectFilter}
                  studentBand={studentBand}
                  loading={loading}
                  offlineMode={offlineMode}
                  catalogEmpty={catalogEmpty}
                  isFlagshipStudent={isFlagshipStudent}
                  colorblindMode={colorblindMode}
                  studentId={String(student?.admission_no || student?.id || '')}
                  seriesNameById={seriesNameById}
                  refreshPath={refreshPath}
                  loadData={loadData}
                  setSubjectFilter={setSubjectFilter}
                  setShowPlacementQuiz={setShowPlacementQuiz}
                />
              </Suspense>
            )}
          </>
        )}
      </main>

      {/* Q1 Companion Shop modal — spend XP earned in games/reviews */}
      <Shop open={showShop} onClose={() => setShowShop(false)} onBalanceChange={handleShopBalance} />

      {/* Q4 Placement quiz — measure + place elder/unmapped children */}
      <PlacementQuiz
        open={showPlacementQuiz}
        onClose={() => setShowPlacementQuiz(false)}
        onPlaced={() => {
          // Placement persisted server-side → refetch catalog + path.
          void loadData();
        }}
      />
    </div>
  );
}
