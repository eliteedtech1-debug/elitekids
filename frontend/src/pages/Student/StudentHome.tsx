import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  Loader2,
  LogOut,
  ShoppingBag,
  Route,
  BookOpen,
  Mic,
  Users,
  Home,
  User,
} from 'lucide-react';

/* ── Lazy-loaded tab components (code-split per tab) ────────── */
const HomeTab = lazy(() => import('./tabs/HomeTab'));
const PlayTab = lazy(() => import('./tabs/PlayTab'));
const PathTab = lazy(() => import('./tabs/PathTab'));
const ReviewTab = lazy(() => import('./tabs/ReviewTab'));
const MeTab = lazy(() => import('./tabs/MeTab'));
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import BossBattleOverlay from '@/components/BossBattleOverlay';
import OfflineIndicator from '@/components/OfflineIndicator';
import { playTap } from '@/lib/utils/sound';
import A11ySettings from '@/components/A11ySettings';
import SpeechSettings from '@/components/SpeechSettings';
import AppSwitcher from '@/components/AppSwitcher';
import OnboardingTour from '@/components/OnboardingTour';
import WelcomeSpotlight from '@/components/WelcomeSpotlight';
import CompanionSelect from '@/components/CompanionSelect';
import KidPageBackground from '@/components/KidPageBackground';
import StudentFestival from '@/components/StudentFestival';
import StudentLiveBar from '@/components/StudentLiveBar';
import StudentQuickNav from '@/components/StudentQuickNav';
import PlacementQuiz from '@/components/PlacementQuiz';
import PlacementIntro from '@/components/PlacementIntro';
import { useA11yStore } from '@/lib/utils/a11y-store';
import { recordPlayDay, getStreakLocal } from '@/lib/utils/streak';
import Shop, { SKIN_META, THEME_HEADER } from '@/components/Shop';
import ReviewDueBadge from '@/components/ReviewDueBadge';
import { warmCache, extractCacheableUrls } from '@/lib/utils/asset-cache';
import { offlineContent, isPrefetchRateLimited, markRateLimited } from '@/lib/offline/content';
import { t } from '@/lib/i18n';
import {
  classToAgeLevel,
  filterInBand,
  flattenUnits,
  normalizeBand,
  type GameMode,
  type LearningPathData,
  type WeeklyGoal,
} from '@/lib/utils/learningPath';
import CollaborationBadge from '@/components/CollaborationBadge';
import { FloatingDeco, SUBJECT_FILTERS } from './utils/helpers';
import type { LessonCard, ProgressData, HomeGridItem } from './tabs/types';

/* ── Tab definitions ────────────────────────────────────────── */

interface Tab {
  key: string;
  labelKey: string;
  icon: React.ReactNode;
  /** 'path' renders the LearningPath dashboard; 'grid' tabs list lessons. */
  view: 'path' | 'grid' | 'special';
  filter: (l: LessonCard) => boolean;
}

/**
 * The 5 tabs (STUDENT-TAB-RESTRUCTURE.md): HOME motivates, PLAY picks a game,
 * LEARN follows the path, REVIEW revises, ME shows progress & social.
 * One tab = one job — no component renders in two tabs, and every key below
 * has its own explicit branch in the render (no fallback `else`).
 */
const TABS: Tab[] = [
  { key: 'home', labelKey: 'student.tab.home', icon: <Home className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'play', labelKey: 'student.tab.play', icon: <Gamepad2 className="h-4 w-4" />, view: 'grid', filter: () => true },
  { key: 'path', labelKey: 'student.tab.learn', icon: <Route className="h-4 w-4" />, view: 'path', filter: () => false },
  { key: 'review', labelKey: 'student.tab.review', icon: <BookOpen className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'me', labelKey: 'student.tab.me', icon: <User className="h-4 w-4" />, view: 'special', filter: () => true },
];

/* ── Main Component ─────────────────────────────────────────── */

/**
 * Warm the assets of ONE lesson — the child's very next game — so offline play
 * of that game is instant. Warming the whole catalog means hundreds of /media
 * requests, which are proxied to the same backend and counted by the same
 * per-IP rate limit (see the class-load budget note in loadData).
 */
async function warmNextLessonAssets(lessonId?: string): Promise<void> {
  if (!lessonId) return;
  try {
    const res: any = await apiClient.get(ENDPOINTS.LESSONS.GAME(lessonId)).catch(() => null);
    const gameData: any = (res?.data as any)?.data || res?.data;
    if (gameData?.template) {
      offlineContent.saveGamePayload(lessonId, gameData).catch(() => {});
    }
    const urls = gameData?.config_json ? extractCacheableUrls(gameData.config_json).slice(0, 8) : [];
    if (urls.length > 0) {
      warmCache(urls)
        .then((r) => {
          if (r.cached > 0) console.log(`[AssetCache] Warmed ${r.cached} assets`);
        })
        .catch(() => {});
    }
  } catch {
    // Non-blocking — asset warming is optional
  }
}

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
  // Subject chip on the PLAY grid — 'all' lists every in-band game.
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
  /** Pending deferred offline sweep (cancelled on unmount). */
  const offlineTimer = useRef<number | null>(null);
  /** Team lookup is lazy — only the ME tab needs it. */
  const [teamLoaded, setTeamLoaded] = useState(false);

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
    /** Progress row already fetched for the returning-student check. */
    let progressPrefetch: ProgressData | null = null;
    try {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
      decoded = decodeToken(token);
      setStudent(decoded);

      const admissionNo = decoded?.admission_no || decoded?.id;

      // NOTE: team membership is NOT fetched here any more. Only the ME tab's
      // social board needs it, so it loads when that tab is opened (see the
      // lazy effect below) — this was one request on every dashboard load for
      // every child in the school.

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
        // Onboarding is immutable once completed, so remember it locally and
        // skip the call on every later load (one request per child per load).
        const onbKey = `elitekids-onboarding-done:${admissionNo}`;
        let completed = false;
        try {
          completed = localStorage.getItem(onbKey) === '1';
        } catch { /* storage unavailable */ }
        if (!completed) {
          const onbRes = await apiClient
            .get(ENDPOINTS.ONBOARDING.STATUS(admissionNo))
            .catch(() => ({ data: { data: { completed: false } } }));
          completed = Boolean(onbRes.data?.data?.completed);
          if (completed) {
            try { localStorage.setItem(onbKey, '1'); } catch { /* non-fatal */ }
          }
        }
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
          // Hand the progress row to the main fetch below instead of asking the
          // API for the very same thing twice in one load.
          progressPrefetch = progRes?.data?.data || null;
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
          const progressData = progressPrefetch || (await apiClient.get(ENDPOINTS.PROGRESS.CHILD(admissionNo))).data?.data || {
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
      // ── Offline warming: deferred, jittered, tiny ───────────────────────
      // Nothing here is needed for first paint, and a class that logs in
      // together must not fire its sweeps in the same second — the API allows
      // 300 req/min per IP and the whole school shares one. So the sweep waits
      // 20–60s (jittered), warms ONE lesson's assets (the child's next game),
      // and lets prefetchAll walk the catalog a few lessons per visit.
      const schoolId = String(decoded?.school_id || '');
      if (schoolId && navigator.onLine && lessonsData.length > 0) {
        const delay = 20000 + Math.floor(Math.random() * 40000);
        offlineTimer.current = window.setTimeout(() => {
          if (isPrefetchRateLimited()) return; // API already asked us to back off
          void warmNextLessonAssets(lessonsData[0]?.id);
          offlineContent
            .prefetchAll(schoolId, { lessons: lessonsData })
            .then((n) => {
              if (n > 0) console.log(`[Offline] Prefetched ${n} lessons`);
            })
            .catch(() => {});
        }, delay);
      }
    }
  }, []);

  // Cancel a pending offline sweep when the dashboard unmounts.
  useEffect(
    () => () => {
      if (offlineTimer.current) window.clearTimeout(offlineTimer.current);
    },
    [],
  );

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Live feed polling ─────────────────────────────────────────────────
   * Cheap on purpose. This used to poll three endpoints every 30s — six
   * requests per minute, per child, from one school IP that the API caps at
   * 300 req/min in total, i.e. 30 kids watching their badges could throttle
   * the whole class. Now: one endpoint every 3 minutes, the heavier learning
   * path every third tick (~9 min), nothing at all while the tab is hidden or
   * while the API has asked us to back off. Team activity is no longer polled
   * — it comes from the lazy ME-tab lookup below.
   */
  useEffect(() => {
    if (!student) return;
    const admissionNo = String(student?.admission_no || student?.id || '');
    if (!admissionNo) return;

    let tick = 0;
    const checkFeeds = async () => {
      if (document.hidden || isPrefetchRateLimited()) return;
      tick += 1;
      try {
        // New reviews due — the only badge that changes minute to minute.
        const reviewRes: any = await apiClient
          .get(ENDPOINTS.REVIEWS_V2.TODAY)
          .catch((err: any) => ({ status: err?.response?.status, data: null }));
        if (reviewRes?.status === 429) {
          markRateLimited();
          return;
        }
        const newReviewDue = Number(reviewRes?.data?.data?.due_count) || 0;

        // New units unlocked — heavy (the whole path), so every third tick.
        let newUnitsUnlocked = false;
        if (tick % 3 === 0) {
          const pathRes = await apiClient.get(ENDPOINTS.LEARNING_PATH(admissionNo)).catch(() => null);
          const newPathData = pathRes?.data?.data;
          newUnitsUnlocked =
            newPathData?.path?.some((s: any) =>
              s.units?.some((u: any) => !u.locked && u.lessons?.some((l: any) => l.state === 'new')),
            ) || false;
        }

        // Feed keys mirror the tab keys, so the badge lookup stays a plain
        // `tabFeeds[tab.key]` in the tab bar below.
        setTabFeeds((prev) => ({
          ...prev,
          review: {
            hasNew: newReviewDue > (prev.review?.count || 0) && newReviewDue > 0,
            count: newReviewDue,
          },
          ...(tick % 3 === 0
            ? {
                path: {
                  hasNew: newUnitsUnlocked && !prev.path?.viewed,
                  count: newUnitsUnlocked ? 1 : 0,
                },
              }
            : {}),
        }));
      } catch {
        // Non-blocking — feed updates are optional
      }
    };

    const interval = setInterval(checkFeeds, 180000);
    return () => clearInterval(interval);
  }, [student]);

  /* ── ME tab: lazy team lookup ──────────────────────────────────────────
   * Team membership is only used by the social board on the ME tab, so it is
   * fetched when that tab is first opened rather than on every dashboard load.
   */
  useEffect(() => {
    if (activeTab !== 'me' || teamLoaded) return;
    const admissionNo = String(student?.admission_no || student?.id || '');
    if (!admissionNo) return;
    let alive = true;
    apiClient
      .get(ENDPOINTS.COLLAB.TEAMS_MINE)
      .then((res) => {
        if (!alive) return;
        setTeamLoaded(true);
        const team = res?.data?.data;
        if (team) {
          setStudent((prev) =>
            prev ? { ...prev, team_id: team.id, class_code: team.class_id || prev.class_code } : prev,
          );
          setTabFeeds((prev) => ({
            ...prev,
            me: { hasNew: !prev.me?.viewed, count: 1 },
          }));
        }
      })
      .catch(() => {
        if (alive) setTeamLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, teamLoaded, student?.admission_no, student?.id]);

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
  // Both branches yield a canonical NERDC band, the same vocabulary the lesson
  // rows carry — no legacy/storage round-trip (that conversion is what let the
  // ceiling and the catalog disagree and blanked PLAY for Nursery children).
  const studentBand = useMemo(() => {
    if (placement.placed && placement.nerdc_band) {
      const placed = normalizeBand(placement.nerdc_band);
      if (placed) return placed;
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

  /**
   * Review is its own tab now, so "go to review" switches tab first and only
   * then scrolls — the lazy tab needs a beat to mount its #review-zone anchor.
   */
  const scrollToReviewZone = useCallback(() => {
    handleTabChange('review');
    setTimeout(() => {
      document.getElementById('review-zone')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, [handleTabChange]);

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
  // Per-game stats are rendered by the PLAY cards; the ME tab shows the
  // per-game progress list (StatsTab computes it from `progress`).
  const gameStats = progress?.game_stats || {};

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
          // PLAY is the one grid tab — switch to it, then scroll to its grid.
          handleTabChange('play');
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
        <WelcomeSpotlight
          onClose={() => setShowWelcomeSpotlight(false)}
          onOpenGoal={() => {
            // The weekly goal card lives in ME — take the child there and let
            // the card's own picker auto-open (see GoalCard autoOpenPicker).
            handleTabChange('me');
            setTimeout(() => {
              document
                .getElementById('welcome-goal-card')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 120);
          }}
        />
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
        {/* ── HOME (special): companion greeting, streak, garden ── */}
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
              onPickGame={() => handleTabChange('play')}
            />
          </Suspense>
        )}

        {/* Boss Battle Overlay */}
        <div className="mb-5">
          <BossBattleOverlay onDismiss={() => setShowBossRaid(false)} />
        </div>

        {/* Offline Indicator */}
        <OfflineIndicator silent />

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
                onClick={() => handleTabChange('me')}
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

            {/* Each tab key has exactly ONE branch — no fallback `else`, so a
                tab can never render another tab's content. */}

            {/* PLAY — pick a game (subject chips + cards + festival banner) */}
            {activeTab === 'play' && (
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
                  festivalBanner={
                    <StudentFestival
                      variant="banner"
                      onGoPlay={() => {
                        document.getElementById('games-grid-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    />
                  }
                />
              </Suspense>
            )}

            {/* LEARN — the structured learning path */}
            {activeTab === 'path' && (
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
                <PathTab
                  pathData={pathData}
                  loading={loading}
                  offlineMode={offlineMode}
                  catalogEmpty={catalogEmpty}
                  loadData={loadData}
                  setSubjectFilter={setSubjectFilter}
                  setActiveTab={handleTabChange}
                  openLesson={openLesson}
                />
              </Suspense>
            )}

            {/* REVIEW — revision card + spaced-repetition zone */}
            {activeTab === 'review' && (
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
                <ReviewTab />
              </Suspense>
            )}

            {/* ME — progress, goals, per-game scores, trophy board, teams */}
            {activeTab === 'me' && (
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">{t('student.home.loading')}</div>}>
                <MeTab
                  progress={progress}
                  economy={economy}
                  bandLessons={bandLessons}
                  pathData={pathData}
                  isReturningStudent={isReturningStudent}
                  showWelcomeSpotlight={showWelcomeSpotlight}
                  loading={loading}
                  handleGoalUpdated={handleGoalUpdated}
                  student={student}
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
