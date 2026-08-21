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
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { playTap } from '@/lib/utils/sound';
import A11ySettings from '@/components/A11ySettings';
import SpeechSettings from '@/components/SpeechSettings';
import OnboardingTour from '@/components/OnboardingTour';
import CompanionSelect, { CompanionBubble } from '@/components/CompanionSelect';
import GardenScene from '@/components/GardenScene';
import { AGE_LEVEL_COLORS } from '@/lib/utils/accessibility';
import { useA11yStore } from '@/lib/utils/a11y-store';
import { recordPlayDay, getStreak, getStreakEmoji } from '@/lib/utils/streak';

/* ── Types ────────────────────────────────────────────────────── */

interface LessonCard {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  created_at: string;
  has_games: boolean;
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
  label: string;
  icon: React.ReactNode;
  filter: (l: LessonCard) => boolean;
}

const TABS: Tab[] = [
  { key: 'all', label: 'All Games', icon: <Gamepad2 className="h-4 w-4" />, filter: () => true },
  { key: 'numbers', label: 'Numbers', icon: <Hash className="h-4 w-4" />, filter: (l) => /count|number|math|drag-sort/i.test(l.subject + l.title) },
  { key: 'letters', label: 'Letters', icon: <BookOpen className="h-4 w-4" />, filter: (l) => /abc|letter|english|phon/i.test(l.subject + l.title) },
  { key: 'colors', label: 'Colors', icon: <Palette className="h-4 w-4" />, filter: (l) => /color|art|creati/i.test(l.subject + l.title) },
  { key: 'shapes', label: 'Shapes', icon: <Shapes className="h-4 w-4" />, filter: (l) => /shape|pattern|geom/i.test(l.subject + l.title) },
  { key: 'animals', label: 'Animals', icon: <PawPrint className="h-4 w-4" />, filter: (l) => /animal|pet|farm/i.test(l.subject + l.title) },
  { key: 'food', label: 'Food', icon: <Apple className="h-4 w-4" />, filter: (l) => /fruit|veggie|food|eat/i.test(l.subject + l.title) },
];

/* ── Age-level badge colors (from accessibility palette) ── */

function getAgeColor(ageLevel: string, colorblind: boolean): string {
  const entry = AGE_LEVEL_COLORS[ageLevel];
  if (!entry) return 'bg-gray-100 text-gray-600';
  return colorblind ? entry.colorblind : entry.standard;
}

/** Map a student's class_name to the lesson age_level category.
 * e.g. "Nursery 1" → "Nursery", "KG1A" → "KG1", "Primary 3" → "Primary"
 */
function classToAgeLevel(className: string | null | undefined): string | null {
  if (!className) return null;
  const normalized = className.trim().toLowerCase();
  if (/pre.?nursery|creche/.test(normalized)) return 'Creche';
  if (/nursery/.test(normalized)) return 'Nursery';
  if (/kg1|kindergarten.?1/.test(normalized)) return 'KG1';
  if (/kg2|kindergarten.?2/.test(normalized)) return 'KG2';
  if (/primary|basic/.test(normalized)) return 'Primary';
  if (/jss|js[1-3]|junior/.test(normalized)) return 'Primary'; // secondary uses primary-level kids games
  if (/sss|ss[1-3]|senior/.test(normalized)) return 'Primary';
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [companion, setCompanion] = useState<any>(null);
  const [showCompanionSelect, setShowCompanionSelect] = useState(false);
  const [streak, setStreak] = useState(() => getStreak());
  const { colorblindMode } = useA11yStore();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
      const decoded = decodeToken(token);
      setStudent(decoded);

      const admissionNo = decoded?.admission_no || decoded?.id;

      const lessonsRes = await apiClient.get(ENDPOINTS.LESSONS.LIST, {
        params: { content_state: 'published' },
      }).catch(() => ({ data: { data: [] } }));
      setLessons(lessonsRes.data?.data || []);

      if (admissionNo) {
        const progressRes = await apiClient.get(ENDPOINTS.PROGRESS.CHILD(admissionNo));
        setProgress(progressRes.data?.data || { total_xp: 0, total_stars: 0, games_completed: 0, game_stats: {}, games: [] });

        // Check onboarding status
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
    } catch (err: any) {
      setError(err?.message || 'Unable to load your games.');
    } finally {
      setLoading(false);
      // Record daily play for streak tracking
      const updatedStreak = recordPlayDay();
      setStreak(updatedStreak);
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
    // If student has a recognized class, only show matching lessons
    const classFiltered = studentAgeLevel
      ? lessons.filter((l) => l.age_level === studentAgeLevel)
      : lessons;
    const tab = TABS.find((t) => t.key === activeTab);
    return tab ? classFiltered.filter(tab.filter) : classFiltered;
  }, [lessons, activeTab, student?.class_name]);

  const displayName = student?.student_name || student?.name || student?.admission_no || 'Student';
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Elite Kids" className="h-10 w-10 rounded-full object-contain" />
            <div>
              <h1 className="text-lg font-bold leading-tight text-[#0F4D92] animate-game-slide-left">Elite Kids</h1>
              <p className="text-xs text-gray-500">Hello, {displayName}!</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <A11ySettings />
            <SpeechSettings />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

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
            <p className="text-[10px] text-gray-500">Day Streak</p>
          </div>
          <div className="text-center animate-game-zoom-in stagger-1">
            <div className="flex items-center justify-center gap-1 text-2xl font-bold text-amber-500">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              {summary.total_stars}
            </div>
            <p className="text-xs text-gray-500">Stars Earned</p>
          </div>
          <div className="text-center animate-game-zoom-in stagger-2">
            <div className="flex items-center justify-center gap-1 text-2xl font-bold text-[#0F4D92]">
              <Zap className="h-5 w-5" />
              {summary.total_xp}
            </div>
            <p className="text-xs text-gray-500">XP Points</p>
          </div>
          <div className="text-center animate-game-zoom-in stagger-3">
            <div className="flex items-center justify-center gap-1 text-2xl font-bold text-gray-700">
              <Gamepad2 className="h-5 w-5" />
              {summary.games_completed}
            </div>
            <p className="text-xs text-gray-500">Games Played</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading games...
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
                    {tab.label}
                    <span className={`ml-0.5 rounded-full px-1.5 text-xs ${activeTab === tab.key ? 'bg-white/20' : 'bg-gray-100'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Section header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {TABS.find((t) => t.key === activeTab)?.label || 'All Games'}
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
                <h3 className="font-semibold text-gray-700">No games in this category yet</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                  Check back soon — your teacher is preparing fun games!
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
                    <Link
                      key={lesson.id}
                      to={`/student/game/${lesson.id}`}
                      onClick={() => playTap()}
                      className={`game-card-hover block rounded-2xl border p-5 text-left no-underline shadow-sm animate-game-slide-up stagger-${Math.min(cardIdx + 1, 12)} ${played > 0 ? 'border-green-200 bg-green-50/30' : 'border-[#0F4D92]/10 bg-white'}`}
                    >
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
                            ✓ Played {played}×
                          </span>
                        ) : lesson.has_games ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                            ▶ Play Now
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                            Coming Soon
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
                      {/* Per-game stats */}
                      {played > 0 && (
                        <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-2.5">
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <RotateCcw className="h-3 w-3" />
                            <span className="font-semibold text-gray-700">{played}</span> play{played !== 1 ? 's' : ''}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Trophy className="h-3 w-3" />
                            <span className="font-semibold text-amber-600">{bestScore}</span> best
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500">
                            <Star className="h-3 w-3" />
                            <span className="font-semibold text-gray-700">{stat?.total_stars || 0}</span> ★
                          </div>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
