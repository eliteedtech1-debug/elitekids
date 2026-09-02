import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  Loader2,
  LogOut,
  RefreshCw,
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
import CompanionSelect, { CompanionBubble } from '@/components/CompanionSelect';
import GardenScene from '@/components/GardenScene';
import StudentLeaderboardPanel from './StudentLeaderboardPanel';
import StudentFestival from '@/components/StudentFestival';
import StudentLiveBar from '@/components/StudentLiveBar';
import { AGE_LEVEL_COLORS } from '@/lib/utils/accessibility';
import { useA11yStore } from '@/lib/utils/a11y-store';
import { recordPlayDay, getStreakLocal, getStreakEmoji } from '@/lib/utils/streak';
import { warmCache, extractCacheableUrls } from '@/lib/utils/asset-cache';
import { offlineContent } from '@/lib/offline/content';
import { t, tN } from '@/lib/i18n';

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
  filter: (l: LessonCard) => boolean;
  special?: boolean;
}

const TABS: Tab[] = [
  { key: 'all', labelKey: 'student.tab.all', icon: <Gamepad2 className="h-4 w-4" />, filter: () => true },
  { key: 'numbers', labelKey: 'student.tab.numbers', icon: <Hash className="h-4 w-4" />, filter: (l) => /count|number|math|drag-sort/i.test(l.subject + l.title) },
  { key: 'letters', labelKey: 'student.tab.letters', icon: <BookOpen className="h-4 w-4" />, filter: (l) => /abc|letter|english|phon/i.test(l.subject + l.title) },
  { key: 'colors', labelKey: 'student.tab.colors', icon: <Palette className="h-4 w-4" />, filter: (l) => /color|art|creati/i.test(l.subject + l.title) },
  { key: 'shapes', labelKey: 'student.tab.shapes', icon: <Shapes className="h-4 w-4" />, filter: (l) => /shape|pattern|geom/i.test(l.subject + l.title) },
  { key: 'animals', labelKey: 'student.tab.animals', icon: <PawPrint className="h-4 w-4" />, filter: (l) => /animal|pet|farm/i.test(l.subject + l.title) },
  { key: 'food', labelKey: 'student.tab.food', icon: <Apple className="h-4 w-4" />, filter: (l) => /fruit|veggie|food|eat/i.test(l.subject + l.title) },
  { key: 'festival', labelKey: 'student.tab.festival', icon: <Swords className="h-4 w-4" />, filter: () => true, special: true },
  { key: 'leaderboard', labelKey: 'student.tab.leaderboard', icon: <Trophy className="h-4 w-4" />, filter: () => true, special: true },
];

/* ── Age-level badge colors (from accessibility palette) ── */

function getAgeColor(ageLevel: string, colorblind: boolean): string {
  const entry = AGE_LEVEL_COLORS[ageLevel];
  if (!entry) return 'bg-gray-100 text-gray-600';
  return colorblind ? entry.colorblind : entry.standard;
}

/** Map a student's class_name to the lesson age_level category.
 *
 * Uses flexible fuzzy matching to handle Nigerian school naming:
 *   BASIC 1-6, JSS 1-3, SSS 1-3, HADANA, Islamiyya, KG1, Nursery, etc.
 *
 * Returns null only if truly unrecognizable → shows ALL lessons as fallback.
 */
function classToAgeLevel(className: string | null | undefined): string | null {
  if (!className) return null;

  // Normalize: lowercase, strip extra spaces, remove class codes like CLS0007
  const raw = className.trim();
  const normalized = raw
    .toLowerCase()
    .replace(/cls\d+/g, '')           // remove CLS codes
    .replace(/[^a-z0-9\s]/g, ' ')     // remove special chars
    .replace(/\s+/g, ' ')             // collapse spaces
    .trim();

  if (!normalized) return null;

  // ── Tier 1: Explicit keyword matches (most reliable) ──
  if (/creche|pre.?nursery|pre.?school/.test(normalized)) return 'Creche';
  if (/nursery|nurs/.test(normalized)) return 'Nursery';
  if (/\bkg1\b|kindergarten.?1|\bkg.?1\b/.test(normalized)) return 'KG1';
  if (/\bkg2\b|kindergarten.?2|\bkg.?2\b/.test(normalized)) return 'KG2';
  if (/\bkg3\b|kindergarten.?3|\bkg.?3\b/.test(normalized)) return 'Primary';

  // ── Tier 2: Nigerian school naming patterns ──
  // BASIC 1-2 → KG1/KG2, BASIC 3-6 → Primary
  const basicMatch = normalized.match(/\bbasic\s*(\d+)/);
  if (basicMatch) {
    const num = parseInt(basicMatch[1]);
    if (num <= 1) return 'KG1';
    if (num <= 2) return 'KG2';
    return 'Primary';
  }

  // JSS 1-3 (Junior Secondary) → Primary-level kids games
  if (/\bjss\s*\d|\bjunior\s*sec|\bjunior\b/.test(normalized)) return 'Primary';

  // SSS 1-3 (Senior Secondary) → Primary-level kids games  
  if (/\bsss\s*\d|\bsenior\s*sec|\bsenior\b/.test(normalized)) return 'Primary';

  // ── Tier 3: Islamic/Arabic school patterns ──
  if (/hadana|hifz|huffaz|halkat/.test(normalized)) return 'Primary';
  if (/islamiyya|islamic|madrasa|madrasah|tarbiyah/.test(normalized)) return 'Primary';
  if (/quran|koran|tajweed/.test(normalized)) return 'Primary';

  // ── Tier 4: Generic level extraction ──
  // Match any word + number pattern: "Level 3", "Class 2", "Grade 1", etc.
  const levelMatch = normalized.match(/\b(?:level|class|grade|form|form|std|standard|year|stage)\s*(\d+)/);
  if (levelMatch) {
    const num = parseInt(levelMatch[1]);
    if (num <= 1) return 'Creche';
    if (num <= 2) return 'Nursery';
    if (num <= 3) return 'KG1';
    if (num <= 4) return 'KG2';
    return 'Primary';
  }

  // ── Tier 5: Bare number at end → treat as level ──
  const bareNum = normalized.match(/(\d+)\s*$/);
  if (bareNum) {
    const num = parseInt(bareNum[1]);
    if (num <= 1) return 'KG1';
    if (num <= 2) return 'KG2';
    return 'Primary';
  }

  // ── Tier 6: Partial keyword fuzzy match ──
  if (/primar|basic|element|junior/.test(normalized)) return 'Primary';
  if (/nurs|toddler|baby|infant/.test(normalized)) return 'Nursery';
  if (/pre/.test(normalized)) return 'Creche';

  // ── Fallback: return null → shows ALL lessons (no filtering) ──
  return null;
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
  const [activeTab, setActiveTab] = useState('all');
  const [showBossRaid, setShowBossRaid] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [companion, setCompanion] = useState<any>(null);
  const [showCompanionSelect, setShowCompanionSelect] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [streak, setStreak] = useState(() => getStreakLocal());
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

      const lessonsRes = await apiClient
        .get(ENDPOINTS.LESSONS.LIST, { params: { content_state: 'published' } })
        .catch(() => null);
      if (lessonsRes) {
        lessonsData = lessonsRes.data?.data || [];
        setLessons(lessonsData);
        // E3-offline: keep the catalog fresh for offline sessions
        offlineContent.saveCatalog(lessonsData).catch(() => {});
      } else {
        // E3-offline: hydrate from the downloaded catalog instead of an empty shell
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
          // E3-offline: cache summary so XP/stars still render offline
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

        // Check onboarding status + companion — skipped while offline so the
        // first-run tour can't block gameplay over a failed status probe
        if (!offlineHydrated) {
          const onbRes = await apiClient.get(ENDPOINTS.ONBOARDING.STATUS(admissionNo)).catch(() => ({ data: { data: { completed: false } } }));
          if (!onbRes.data?.data?.completed) {
            setShowOnboarding(true);
          }

          // Fetch companion
          const compRes = await apiClient.get(ENDPOINTS.COMPANION.GET(admissionNo)).catch(() => ({ data: { data: null } }));
          if (compRes.data?.data) {
            setCompanion(compRes.data.data);
          } else if (onbRes.data?.data?.completed) {
            // Onboarding done but no companion → prompt selection
            setShowCompanionSelect(true);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || t('student.home.loadFailed'));
    } finally {
      setLoading(false);
      // Record daily play for streak tracking
      const admissionNo = student?.admission_no || student?.id || '';
      recordPlayDay(admissionNo).then(setStreak).catch(() => {});
      // Warm IndexedDB cache with game assets in background
      try {
        if (!navigator.onLine) throw new Error('offline — skipping cache warm');
        const allUrls: string[] = [];
        for (const lesson of lessonsData) {
          // Fetch game config to extract image URLs + persist payload for offline play
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
      // E3-offline: pre-cache all published lessons for offline play
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
    localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
    localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_BRANCH);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    navigate('/login');
  }, [navigate]);

  // Filter lessons by student's class/age level first, then by tab
  const filteredLessons = useMemo(() => {
    const studentAgeLevel = classToAgeLevel(student?.class_name);

    // Age level hierarchy for fallback matching
    const AGE_HIERARCHY = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];
    const getAdjacentLevels = (level: string): string[] => {
      const idx = AGE_HIERARCHY.indexOf(level);
      if (idx === -1) return AGE_HIERARCHY; // unknown → show all
      // Include self + neighbors (e.g. KG1 → [Nursery, KG1, KG2])
      const adjacent = [AGE_HIERARCHY[idx]];
      if (idx > 0) adjacent.push(AGE_HIERARCHY[idx - 1]);
      if (idx < AGE_HIERARCHY.length - 1) adjacent.push(AGE_HIERARCHY[idx + 1]);
      return adjacent;
    };

    let classFiltered: typeof lessons;
    if (studentAgeLevel) {
      // Try exact match first
      const exact = lessons.filter((l) => l.age_level === studentAgeLevel);
      if (exact.length > 0) {
        classFiltered = exact;
      } else {
        // No exact match → show adjacent age levels (nearby fallback)
        const adjacent = getAdjacentLevels(studentAgeLevel);
        classFiltered = lessons.filter((l) => adjacent.includes(l.age_level));
        // If still nothing, show all lessons
        if (classFiltered.length === 0) classFiltered = lessons;
      }
    } else {
      // Unrecognized class → show all lessons
      classFiltered = lessons;
    }

    const tab = TABS.find((t) => t.key === activeTab);
    return tab ? classFiltered.filter(tab.filter) : classFiltered;
  }, [lessons, activeTab, student?.class_name]);

  const displayName = student?.student_name || student?.name || student?.admission_no || t('student.home.defaultName');
  const summary = progress || { total_xp: 0, total_stars: 0, games_completed: 0, game_stats: {} } as ProgressData;
  const gameStats = progress?.game_stats || {};

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      {/* Onboarding Tour (first-time only) */}
      {showOnboarding && (
        <OnboardingTour onComplete={() => {
          setShowOnboarding(false);
          // After onboarding, prompt companion selection
          if (!companion) setShowCompanionSelect(true);
        }} />
      )}
      {/* Companion Select (first-time choosing) */}
      {showCompanionSelect && (
        <CompanionSelect onComplete={() => {
          setShowCompanionSelect(false);
          // Re-fetch companion
          const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
          try {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
            const id = decoded.admission_no || decoded.id;
            apiClient.get(ENDPOINTS.COMPANION.GET(id)).then((r) => setCompanion(r.data?.data)).catch(() => {});
          } catch {}
        }} />
      )}
      {/* Header */}
      <header className="border-b border-[#0F4D92]/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src="/logo.svg" alt={t('login.brand')} className="h-10 w-10 rounded-full object-contain" />
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight text-[#0F4D92] animate-game-slide-left">{t('login.brand')}</h1>
              <p className="text-[11px] sm:text-xs text-gray-500">{t('student.home.hello', { name: displayName })}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <AppSwitcher />
            <A11ySettings />
            <SpeechSettings />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-2.5 py-2 sm:px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 active:scale-95"
            >
              <LogOut className="h-5 w-5" /> <span className="hidden sm:inline">{t('dashboard.signOut')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Live audio bar — teacher/parent speaking indicator + mic reply */}
      <StudentLiveBar />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Companion greeting */}
        {companion && !showOnboarding && !showCompanionSelect && (
          <div className="mb-4">
            <CompanionBubble companion={companion} context="returning" />
          </div>
        )}
        {/* Garden preview */}
        <div className="mb-4">
          <GardenScene compact />
        </div>
        {/* Progress summary + streak */}
        <div className="mb-5 grid grid-cols-4 gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-center animate-game-zoom-in stagger-0">
            <div className="flex items-center justify-center gap-1 text-2xl font-bold text-orange-500">
              <span>{getStreakEmoji(streak.currentStreak)}</span>
              {streak.currentStreak}
            </div>
            <p className="text-[10px] text-gray-500">{t('student.home.dayStreak')}</p>
          </div>
          <div className="text-center animate-game-zoom-in stagger-1">
            <div className="flex items-center justify-center gap-1 text-2xl font-bold text-amber-500">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              {summary.total_stars}
            </div>
            <p className="text-xs text-gray-500">{t('student.home.starsEarned')}</p>
          </div>
          <div className="text-center animate-game-zoom-in stagger-2">
            <div className="flex items-center justify-center gap-1 text-2xl font-bold text-[#0F4D92]">
              <Zap className="h-5 w-5" />
              {summary.total_xp}
            </div>
            <p className="text-xs text-gray-500">{t('student.home.xpPoints')}</p>
          </div>
          <div className="text-center animate-game-zoom-in stagger-3">
            <div className="flex items-center justify-center gap-1 text-2xl font-bold text-gray-700">
              <Gamepad2 className="h-5 w-5" />
              {summary.games_completed}
            </div>
            <p className="text-xs text-gray-500">{t('student.home.gamesPlayed')}</p>
          </div>
        </div>

        {/* Boss Battle Overlay (self-contained — fetches raid data, renders if active) */}
        <div className="mb-5">
          <BossBattleOverlay onDismiss={() => setShowBossRaid(false)} />
        </div>

        {/* Offline Indicator — silent for kids: no online/offline badge, no
            manual sync button. The sync service auto-drains on reconnect. */}
        <OfflineIndicator silent />

        {/* Daily & Weekly Revision */}
        <div className="mb-5">
          <RevisionCard />
        </div>

        {/* Review Zone (spaced repetition) */}
        <div className="mb-5">
          <ReviewZone />
        </div>

        {error && !offlineMode && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> {t('student.home.loading')}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-5 flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
              {TABS.map((tab, idx) => {
                const count = lessons.filter(tab.filter).length;
                if (tab.key !== 'all' && count === 0) return null;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { playTap(); setActiveTab(tab.key); }}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all animate-game-slide-up stagger-${Math.min(idx + 1, 12)} ${
                      activeTab === tab.key
                        ? 'bg-[#0F4D92] text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
                    }`}
                  >
                    {tab.icon}
                    {t(tab.labelKey)}
                    <span className={`ml-0.5 rounded-full px-1.5 text-xs ${activeTab === tab.key ? 'bg-white/20' : 'bg-gray-100'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'festival' ? (
              <StudentFestival onGoPlay={() => navigate('/student')} />
            ) : activeTab === 'leaderboard' ? (
              <StudentLeaderboardPanel />
            ) : (
            <>
            {/* Section header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {TABS.find((t) => t.key === activeTab) ? t(TABS.find((t) => t.key === activeTab)!.labelKey) : t('student.tab.all')}
                <span className="ml-2 text-sm font-normal text-gray-400">({filteredLessons.length})</span>
              </h2>
              <button
                onClick={loadData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#0F4D92]/20 px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Game cards grid */}
            {filteredLessons.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#0F4D92]/30 bg-white p-10 text-center">
                <Gamepad2 className="mx-auto mb-3 h-10 w-10 text-[#0F4D92]/40" />
                <h3 className="font-semibold text-gray-700">
                  {offlineMode ? t('offline.mode.noGamesTitle') : t('student.home.noGamesTitle')}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                  {offlineMode
                    ? t('offline.mode.noGamesDesc')
                    : t('student.home.noGamesBody')}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLessons.map((lesson, cardIdx) => {
                  const ageColor = getAgeColor(lesson.age_level, colorblindMode);
                  const stat = gameStats[lesson.id];
                  const played = stat?.times_played || 0;
                  const avgScore = stat?.avg_score || 0;
                  const bestScore = stat?.best_score || 0;
                  return (
                    <div
                      key={lesson.id}
                      className={`game-card-hover rounded-2xl border p-5 shadow-sm animate-game-slide-up stagger-${Math.min(cardIdx + 1, 12)} ${played > 0 ? 'border-green-200 bg-green-50/30' : 'border-[#0F4D92]/10 bg-white'}`}
                    >
                      {/* Card top: icon + badge */}
                      <div className="mb-3 flex items-center justify-between">
                        <div className="relative">
                          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${played > 0 ? 'bg-green-100 text-green-600' : 'bg-[#0F4D92]/10 text-[#0F4D92]'}`}>
                            {lesson.lesson_type === 'game' ? (
                              <Gamepad2 className="h-6 w-6" />
                            ) : (
                              <BookOpen className="h-6 w-6" />
                            )}
                          </span>
                          {played > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white shadow-md animate-game-pop">
                              ✓
                            </span>
                          )}
                        </div>
                        {played > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                            {t('student.home.playedCount', { count: played })}
                          </span>
                        ) : lesson.has_games ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                            {t('student.home.playNow')}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                            {t('student.home.comingSoon')}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-800">{lesson.title}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ageColor}`}>
                          {lesson.age_level}
                        </span>
                        <span className="text-xs text-gray-400">{lesson.subject}</span>
                      </div>
                      {(lesson.nerdc_code || lesson.nerdc_strand) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {lesson.nerdc_code && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">
                              📘 {lesson.nerdc_code}
                            </span>
                          )}
                          {lesson.nerdc_strand && (
                            <span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-600">
                              {lesson.nerdc_strand}{lesson.nerdc_sub_strand ? ` · ${lesson.nerdc_sub_strand}` : ''}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Per-game stats */}
                      {played > 0 && (
                        <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-2.5">
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <RotateCcw className="h-3 w-3" />
                            <span className="font-semibold text-gray-700">{tN('student.home.plays', played)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Trophy className="h-3 w-3" />
                            <span className="font-semibold text-amber-600">{bestScore}</span> {t('student.home.best')}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Star className="h-3 w-3" />
                            <span className="font-semibold text-gray-700">{stat?.total_stars || 0}</span> ★
                          </div>
                        </div>
                      )}
                      {/* Quick mode select — tap to jump directly to that mode */}
                      {lesson.has_games && (
                        <div className="mt-3 flex gap-1.5 border-t border-gray-100 pt-3">
                          <Link
                            to={`/student/game/${lesson.id}?mode=learning`}
                            onClick={(e) => { e.stopPropagation(); playTap(); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-purple-50 py-2 text-xs font-semibold text-purple-600 border border-purple-100 hover:bg-purple-100 hover:shadow-sm active:scale-95 transition-all"
                          >
                            {t('student.home.learn')}
                          </Link>
                          <Link
                            to={`/student/game/${lesson.id}?mode=practice`}
                            onClick={(e) => { e.stopPropagation(); playTap(); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-green-50 py-2 text-xs font-semibold text-green-600 border border-green-100 hover:bg-green-100 hover:shadow-sm active:scale-95 transition-all"
                          >
                            {t('student.home.practice')}
                          </Link>
                          <Link
                            to={`/student/game/${lesson.id}?mode=test`}
                            onClick={(e) => { e.stopPropagation(); playTap(); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-blue-50 py-2 text-xs font-semibold text-blue-600 border border-blue-100 hover:bg-blue-100 hover:shadow-sm active:scale-95 transition-all"
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
    </div>
  );
}
