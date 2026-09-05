import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flame,
  Gamepad2,
  Loader2,
  LogOut,
  RefreshCw,
  ShoppingBag,
  Route,
  Star,
  Zap,
  BookOpen,
  Shapes,
  Palette,
  Hash,
  PawPrint,
  Apple,
  Trophy,
  RotateCcw,
  Swords,
  Sparkles,
  Mic,
  ChevronDown,
  Users,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import RevisionCard from '@/components/RevisionCard';
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

const TABS: Tab[] = [
  { key: 'path', labelKey: 'student.tab.path', icon: <Route className="h-4 w-4" />, view: 'path', filter: () => false },
  { key: 'numbers', labelKey: 'student.tab.numbers', icon: <Hash className="h-4 w-4" />, view: 'grid', filter: (l) => /count|number|math|drag-sort/i.test(l.subject + l.title) },
  { key: 'letters', labelKey: 'student.tab.letters', icon: <BookOpen className="h-4 w-4" />, view: 'grid', filter: (l) => /abc|letter|english|phon/i.test(l.subject + l.title) },
  { key: 'colors', labelKey: 'student.tab.colors', icon: <Palette className="h-4 w-4" />, view: 'grid', filter: (l) => /color|art|creati/i.test(l.subject + l.title) },
  { key: 'shapes', labelKey: 'student.tab.shapes', icon: <Shapes className="h-4 w-4" />, view: 'grid', filter: (l) => /shape|pattern|geom/i.test(l.subject + l.title) },
  { key: 'animals', labelKey: 'student.tab.animals', icon: <PawPrint className="h-4 w-4" />, view: 'grid', filter: (l) => /animal|pet|farm/i.test(l.subject + l.title) },
  { key: 'food', labelKey: 'student.tab.food', icon: <Apple className="h-4 w-4" />, view: 'grid', filter: (l) => /fruit|veggie|food|eat/i.test(l.subject + l.title) },
  { key: 'festival', labelKey: 'student.tab.festival', icon: <Swords className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'leaderboard', labelKey: 'student.tab.leaderboard', icon: <Trophy className="h-4 w-4" />, view: 'special', filter: () => true },
  { key: 'teams', labelKey: 'collab.myTeam', icon: <Users className="h-4 w-4" />, view: 'special', filter: () => true },
];

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
  const [activeTab, setActiveTab] = useState('path');
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

  const studentBand = useMemo(() => classToAgeLevel(student?.class_name), [student?.class_name]);

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
    return tab && tab.view === 'grid' ? bandLessons.filter(tab.filter) : bandLessons;
  }, [bandLessons, activeTab]);

  /** Open a lesson from the path in the mode its state calls for. */
  const openLesson = useCallback((lessonId: string, mode: GameMode) => {
    playTap();
    navigate(`/student/game/${lessonId}?mode=${mode}`);
  }, [navigate]);

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
        {/* Companion greeting */}
        {companion && !showOnboarding && !showCompanionSelect && (
          <div className="mb-4">
            <CompanionBubble companion={companion} context="returning" skin={skin} />
          </div>
        )}

        {/* Daily streak reminder — emotional nudge for kids who haven't
            played today. Returning students get mood-specific copy
            (in-danger / on-fire / legend); new students get a friendly
            "plant your first day" invite. Suppressed once they play. */}
        <StreakReminder
          state={{
            currentStreak: streak.currentStreak,
            longestStreak: streak.longestStreak,
            lastPlayDate: streak.lastPlayDate,
            totalDaysPlayed: streak.totalDaysPlayed,
            milestones: streak.milestones,
          }}
          freezeCount={economy?.streak?.freeze_count ?? 0}
          playedToday={hasPlayedToday({
            currentStreak: streak.currentStreak,
            longestStreak: streak.longestStreak,
            lastPlayDate: streak.lastPlayDate,
            totalDaysPlayed: streak.totalDaysPlayed,
            milestones: streak.milestones,
          })}
          isFirstSession={!isReturningStudent}
          firstLessonId={
            pathData?.path?.[0]?.units?.[0]?.lessons?.[0]?.lesson_id
              ? String(pathData.path[0].units[0].lessons[0].lesson_id)
              : null
          }
        />

        {/* Garden preview */}
        <div className="mb-4">
          <GardenScene compact equippedDecorations={equippedItems} />
        </div>

        {/* Progress summary + streak — game-style gradient cards with glassmorphism */}
        <div className="relative mb-5 grid grid-cols-4 gap-2.5 overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl p-4 shadow-xl shadow-[#0F4D92]/5 border border-white/60">
          <FloatingDeco className="-right-6 -top-6 h-20 w-20 bg-gradient-to-br from-orange-400/20 to-amber-400/20" />
          <FloatingDeco className="-left-4 -bottom-4 h-16 w-16 bg-gradient-to-br from-[#0F4D92]/15 to-indigo-400/15" />
          <div className="relative text-center animate-game-zoom-in stagger-0 group">
            <div
              className={`flex items-center justify-center gap-1 text-2xl font-black bg-gradient-to-br from-orange-500 to-red-500 bg-clip-text text-transparent ${
                streak.currentStreak > 0 ? 'animate-game-pulse' : ''
              }`}
            >
              <span className="group-hover:animate-bounce">{getStreakEmoji(streak.currentStreak)}</span>
              {streak.currentStreak}
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.dayStreak')}</p>
          </div>
          <div className="relative text-center animate-game-zoom-in stagger-1 group">
            <div className="flex items-center justify-center gap-1 text-2xl font-black bg-gradient-to-br from-amber-400 to-yellow-500 bg-clip-text text-transparent">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400 group-hover:animate-bounce" />
              {summary.total_stars}
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.starsEarned')}</p>
          </div>
          <div className="relative text-center animate-game-zoom-in stagger-2 group">
            <div
              className={`flex items-center justify-center gap-1 text-2xl font-black bg-clip-text text-transparent ${
                summary.total_xp > 0
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-500'
                  : 'bg-gradient-to-br from-blue-300 to-indigo-300'
              }`}
            >
              {summary.total_xp > 0 ? (
                <Zap className="h-5 w-5 text-blue-500 group-hover:animate-bounce" />
              ) : (
                <span className="text-base">💤</span>
              )}
              {summary.total_xp}
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.xpPoints')}</p>
          </div>
          <div className="relative text-center animate-game-zoom-in stagger-3 group">
            <div className="flex items-center justify-center gap-1 text-2xl font-black bg-gradient-to-br from-purple-500 to-pink-500 bg-clip-text text-transparent">
              {summary.games_completed > 0 ? (
                <Gamepad2 className="h-5 w-5 text-purple-500 group-hover:animate-bounce" />
              ) : (
                <span className="text-base">🎮</span>
              )}
              {summary.games_completed}
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.gamesPlayed')}</p>
          </div>
        </div>

        {/* Q1 engagement economy — one quiet summary chip; the full level
            bar + streak details open on tap (sequential, less text at once). */}
        {economy && (
          <div className="mb-5">
            <button
              onClick={() => { playTap(); setShowProgressDetail((v) => !v); }}
              aria-expanded={showProgressDetail}
              className="flex w-full items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-2.5 shadow-lg shadow-[#0F4D92]/5 backdrop-blur-xl transition hover:bg-white/85 active:scale-[0.99]"
            >
              <span className="flex items-center gap-2 text-sm font-extrabold text-gray-700">
                <Sparkles className="h-4 w-4 text-amber-400" />
                Level {economy.level}{economy.level_name ? ` · ${economy.level_name}` : ''}
              </span>
              <span className="flex items-center gap-2 text-xs font-bold text-gray-400">
                <span className="flex items-center gap-0.5"><Flame className="h-3.5 w-3.5 text-orange-400" />{economy.streak.current}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showProgressDetail ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {showProgressDetail && (
              <div className="mt-2 grid gap-3 md:grid-cols-2 animate-game-slide-down">
                <XPBar xpTotal={economy.xp_total} streakDays={economy.streak.current} />
                <StreakCounter
                  current={economy.streak.current}
                  longest={economy.streak.longest}
                  freezeCount={economy.streak.freeze_count}
                />
              </div>
            )}
          </div>
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
                onClick={() => { playTap(); setActiveTab('teams'); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#0d9488] to-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-[#0d9488]/25 transition hover:shadow-lg hover:scale-105 active:scale-95"
              >
                <Users className="h-3.5 w-3.5" />
                {t('collab.myTeam', { defaultValue: 'Teams' })}
              </button>
            </div>

            {/* Tabs — game-style pill navigation (Learning Path is the default) */}
            <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {/* Keep at least ONE subject pill visible even when every subject
                  has 0 in-band lessons, so the LearningPath empty-state shortcut
                  ('explore subject games') never dead-ends. */}
              {(() => {
                const anyGridLesson = bandLessons.length > 0;
                let gridShown = 0;
                return TABS.map((tab, idx) => {
                  // Subject pills hide when the child has no in-band lessons there,
                  // UNLESS nothing else is playable — then show the first subject
                  // pill so kids always have a tab to explore.
                  const count = tab.view === 'grid' ? bandLessons.filter(tab.filter).length : 0;
                  const hideEmptyGrid = tab.view === 'grid' && count === 0 && (gridShown > 0 || anyGridLesson);
                  if (hideEmptyGrid) return null;
                  if (tab.view === 'grid') gridShown++;
                  return (
                  <button
                    key={tab.key}
                    onClick={() => { playTap(); setActiveTab(tab.key); }}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-bold transition-all animate-game-slide-up stagger-${Math.min(idx + 1, 12)} ${
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
              <div className="space-y-5 animate-game-slide-up">
                {student?.class_code && (
                  <ClassQuest
                    classId={String(student.class_code)}
                    childAdmissionNo={String(student.admission_no || student.id || '')}
                  />
                )}
                {student?.team_id && (
                  <TeamChallenge
                    teamId={Number(student.team_id)}
                    classId={String(student.class_code)}
                    childAdmissionNo={String(student.admission_no || student.id || '')}
                  />
                )}
                {student?.class_code && (
                  <PeerTeachingBoard
                    classId={String(student.class_code)}
                    childAdmissionNo={String(student.admission_no || student.id || '')}
                  />
                )}
              </div>
            ) : activeTab === 'path' ? (
              <>
                {/* Path header + refresh */}
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-800">{t('student.tab.path')}</h2>
                  <button
                    onClick={loadData}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 backdrop-blur-sm border border-[#0F4D92]/15 px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 hover:shadow-md disabled:opacity-50 active:scale-95"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Weekly goal banner — RETURNING students only (≥1 game
                    played). New students see a friendly "let's start your
                    first lesson" hint card instead so the path is the very
                    first thing they interact with. */}
                {isReturningStudent ? (
                  <div
                    id="welcome-goal-card"
                    className={`mb-4 ${showWelcomeSpotlight ? 'relative z-50' : ''}`}
                  >
                    <GoalCard
                      admissionNo={String(student?.admission_no || student?.id || '')}
                      goal={pathData?.goal || null}
                      loading={loading}
                      onUpdated={handleGoalUpdated}
                      autoOpenPicker={showWelcomeSpotlight}
                    />
                  </div>
                ) : (
                  <div className="mb-4 flex items-center gap-3 rounded-3xl border border-[#0F4D92]/15 bg-white/80 p-4 shadow-lg backdrop-blur-xl animate-game-slide-up">
                    <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white shadow-md">
                      <Sparkles className="h-6 w-6" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-extrabold text-gray-800">
                        {t('student.welcome.firstTitle', { defaultValue: 'Welcome to EliteKids! 🌟' })}
                      </p>
                      <p className="text-xs font-medium text-gray-500">
                        {t('student.welcome.firstBody', {
                          defaultValue: "Pick your first lesson below to start earning XP. A weekly goal will unlock after your first game!",
                        })}
                      </p>
                    </div>
                  </div>
                )}

                {/* The journey — server-ordered, band-capped, locked-gated */}
                <div id="welcome-learning-path">
                  <LearningPath
                    data={pathData}
                    loading={loading}
                    offline={offlineMode}
                    onOpenLesson={openLesson}
                    onExploreSubjects={() => setActiveTab('numbers')}
                    onRefresh={loadData}
                    catalogEmpty={catalogEmpty}
                  />
                </div>
              </>
            ) : (
            <>
            {/* Quick-nav scroll anchor for the 'Jump to Games' shortcut */}
            <div id="games-grid-anchor" className="scroll-mt-4" />
            {/* Section header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {t(TABS.find((tb) => tb.key === activeTab)!.labelKey)}
                <span className="ml-2 text-sm font-normal text-gray-400">({gridLessons.length})</span>
              </h2>
              <button
                onClick={loadData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 backdrop-blur-sm border border-[#0F4D92]/15 px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 hover:shadow-md disabled:opacity-50 active:scale-95"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Game cards grid (subject browse — in-band only) */}
            {gridLessons.length === 0 ? (
              <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-[#0F4D92]/20 bg-white/80 backdrop-blur-xl p-10 text-center shadow-lg">
                <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-[#0F4D92]/15 to-[#0d9488]/15" />
                <Gamepad2 className="mx-auto mb-3 h-10 w-10 text-[#0F4D92]/40" />
                <h3 className="font-bold text-gray-700">
                  {offlineMode ? t('offline.mode.noGamesTitle') : t('student.home.noGamesTitle')}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                  {offlineMode
                    ? t('offline.mode.noGamesDesc')
                    : catalogEmpty
                      ? t('student.home.noGamesBodySoon', {
                          defaultValue: 'Check back soon — your teacher is preparing fun games!',
                        })
                      : t('student.home.noGamesBody')}
                </p>
                {/* Placement quiz CTA — measure the child, place the child.
                    Offered whenever a tab looks empty and the platform is
                    reachable (never offline — the quiz needs the catalog). */}
                {!offlineMode && (
                  <button
                    onClick={() => { playTap(); setShowPlacementQuiz(true); }}
                    className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-[#0F4D92] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-[#0D3F7A] active:scale-95"
                  >
                    🎯 {t('placement.cta')}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gridLessons.map((lesson, cardIdx) => {
                  const ageColor = getAgeColor(lesson.age_level, colorblindMode);
                  const stat = gameStats[lesson.id];
                  const played = stat?.times_played || 0;
                  const avgScore = stat?.avg_score || 0;
                  const bestScore = stat?.best_score || 0;
                  return (
                    <div
                      key={lesson.id}
                      className={`game-card-hover relative overflow-hidden rounded-3xl border p-5 shadow-lg animate-game-slide-up stagger-${Math.min(cardIdx + 1, 12)} transition-all hover:shadow-xl hover:scale-[1.02] ${
                        played > 0
                          ? 'border-green-200/60 bg-gradient-to-br from-white via-green-50/30 to-emerald-50/40'
                          : 'border-white/60 bg-white/80 backdrop-blur-xl'
                      }`}
                    >
                      {played > 0 && (
                        <>
                          <FloatingDeco className="-right-4 -top-4 h-16 w-16 bg-gradient-to-br from-green-300/20 to-emerald-300/20" />
                          <FloatingDeco className="-left-3 -bottom-3 h-12 w-12 bg-gradient-to-br from-green-200/15 to-teal-200/15" />
                        </>
                      )}
                      {!played && (
                        <FloatingDeco className="-right-4 -top-4 h-16 w-16 bg-gradient-to-br from-[#0F4D92]/10 to-[#0d9488]/10" />
                      )}
                      {/* Card top: icon + badge */}
                      <div className="relative mb-3 flex items-center justify-between">
                        <div className="relative">
                          <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-md ${
                            played > 0
                              ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-300/30'
                              : 'bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white shadow-[#0F4D92]/20'
                          }`}>
                            {lesson.lesson_type === 'game' ? (
                              <Gamepad2 className="h-6 w-6 drop-shadow" />
                            ) : (
                              <BookOpen className="h-6 w-6 drop-shadow" />
                            )}
                          </span>
                          {played > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white shadow-md animate-game-pop ring-2 ring-white">
                              ✓
                            </span>
                          )}
                        </div>
                        {played > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100/80 px-2.5 py-1 text-[11px] font-bold text-green-700 shadow-sm">
                            {t('student.home.playedCount', { count: played })}
                          </span>
                        ) : lesson.has_games ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#0d9488]/10 px-2.5 py-1 text-[11px] font-bold text-[#0d9488] shadow-sm">
                            {t('student.home.playNow')}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100/80 px-2.5 py-1 text-[11px] font-bold text-gray-500 shadow-sm">
                            {t('student.home.comingSoon')}
                          </span>
                        )}
                      </div>
                      <h3 className="relative font-bold text-gray-800">{lesson.title}</h3>
                      <div className="relative mt-2 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ageColor}`}>
                          {lesson.age_level}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">{lesson.subject}</span>
                      </div>
                      {(lesson.nerdc_code || lesson.nerdc_strand) && (
                        <div className="relative mt-1.5 flex flex-wrap items-center gap-1.5">
                          {lesson.nerdc_code && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#0F4D92]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#0F4D92]">
                              📘 {lesson.nerdc_code}
                            </span>
                          )}
                          {lesson.nerdc_strand && (
                            <span className="inline-flex items-center rounded-md bg-[#0d9488]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#0d9488]">
                              {lesson.nerdc_strand}{lesson.nerdc_sub_strand ? ` · ${lesson.nerdc_sub_strand}` : ''}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Per-game stats */}
                      {played > 0 && (
                        <div className="relative mt-3 flex items-center gap-3 border-t border-green-100/60 pt-2.5">
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <RotateCcw className="h-3 w-3" />
                            <span className="font-bold text-gray-700">{tN('student.home.plays', played)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Trophy className="h-3 w-3" />
                            <span className="font-bold text-amber-600">{bestScore}</span> {t('student.home.best')}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Star className="h-3 w-3" />
                            <span className="font-bold text-gray-700">{stat?.total_stars || 0}</span> ★
                          </div>
                        </div>
                      )}
                      {/* Quick mode select */}
                      {lesson.has_games && (
                        <div className="relative mt-3 flex gap-1.5 border-t border-gray-100/60 pt-3">
                          <Link
                            to={`/student/game/${lesson.id}?mode=learning`}
                            onClick={(e) => { e.stopPropagation(); playTap(); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 py-2.5 text-xs font-bold text-purple-600 border border-purple-100/60 hover:bg-purple-100 hover:shadow-md active:scale-95 transition-all"
                          >
                            {t('student.home.learn')}
                          </Link>
                          <Link
                            to={`/student/game/${lesson.id}?mode=practice`}
                            onClick={(e) => { e.stopPropagation(); playTap(); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 py-2.5 text-xs font-bold text-green-600 border border-green-100/60 hover:bg-green-100 hover:shadow-md active:scale-95 transition-all"
                          >
                            {t('student.home.practice')}
                          </Link>
                          <Link
                            to={`/student/game/${lesson.id}?mode=test`}
                            onClick={(e) => { e.stopPropagation(); playTap(); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 py-2.5 text-xs font-bold text-blue-600 border border-blue-100/60 hover:bg-blue-100 hover:shadow-md active:scale-95 transition-all"
                          >
                            {t('student.home.test')}
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
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
