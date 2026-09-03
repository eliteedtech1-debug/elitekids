import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  Flame,
  Heart,
  Play,
  Snowflake,
  Sparkles,
  Sprout,
  Sun,
  Trophy,
} from 'lucide-react';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import type { StreakState } from '@/lib/utils/streak';

interface StreakReminderProps {
  state: StreakState | null;
  /** Number of streak freezes the child still has (from Q1 economy). */
  freezeCount?: number;
  /** If true, the child already played today → suppress the reminder. */
  playedToday?: boolean;
  /** True if this is the child's very first time on the dashboard. */
  isFirstSession?: boolean;
  /** Lesson id to focus the CTA on (first lesson from the path). */
  firstLessonId?: string | null;
}

type Mood = 'never_started' | 'broken' | 'in_danger' | 'comeback' | 'on_fire' | 'legend';

interface ReminderContent {
  mood: Mood;
  Icon: typeof Flame;
  iconClass: string;
  ringClass: string;
  titleKey: string;
  bodyKey: string;
  ctaKey: string;
  defaultTitle: string;
  defaultBody: string;
  defaultCta: string;
}

/**
 * Days-since-last-play classification. `lastPlayDate` is YYYY-MM-DD; if empty
 * or unparseable we treat it as "never played" so new students still see a
 * friendly invite rather than a blank slate.
 */
function daysSinceLastPlay(state: StreakState | null, now = new Date()): number {
  if (!state?.lastPlayDate) return Number.POSITIVE_INFINITY;
  const last = new Date(`${state.lastPlayDate}T00:00:00`);
  if (Number.isNaN(last.getTime())) return Number.POSITIVE_INFINITY;
  const ms = now.getTime() - last.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function todayKey(now = new Date()): string {
  return now.toISOString().split('T')[0];
}

function pickContent(
  state: StreakState | null,
  playedToday: boolean,
  isFirstSession: boolean,
  freezeCount: number,
): ReminderContent | null {
  if (playedToday) return null;
  const current = state?.currentStreak ?? 0;
  const longest = state?.longestStreak ?? 0;
  const days = daysSinceLastPlay(state);

  // ── Never played at all (new students)
  if (current === 0 && !state?.lastPlayDate) {
    return {
      mood: 'never_started',
      Icon: Sprout,
      iconClass: 'bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-emerald-300/40',
      ringClass: 'ring-emerald-300/50',
      titleKey: 'student.streakReminder.neverStarted.title',
      bodyKey: 'student.streakReminder.neverStarted.body',
      ctaKey: 'student.streakReminder.neverStarted.cta',
      defaultTitle: 'Ready to plant your first day? 🌱',
      defaultBody:
        'Every champion starts with a single tap. Play one game today to grow your streak — and unlock a Seed Starter sticker!',
      defaultCta: 'Plant my first day',
    };
  }

  // ── Streak broken (>1 day gap, or current reset to 1 already)
  if (days >= 2) {
    const hasFreeze = freezeCount > 0;
    return {
      mood: 'broken',
      Icon: hasFreeze ? Snowflake : Heart,
      iconClass: hasFreeze
        ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-sky-300/40'
        : 'bg-gradient-to-br from-pink-400 to-rose-500 text-white shadow-rose-300/40',
      ringClass: hasFreeze ? 'ring-sky-300/50' : 'ring-rose-300/50',
      titleKey: hasFreeze ? 'student.streakReminder.brokenFreeze.title' : 'student.streakReminder.broken.title',
      bodyKey: hasFreeze ? 'student.streakReminder.brokenFreeze.body' : 'student.streakReminder.broken.body',
      ctaKey: hasFreeze ? 'student.streakReminder.brokenFreeze.cta' : 'student.streakReminder.broken.cta',
      defaultTitle: hasFreeze ? 'No worries — your freeze saved you ❄️' : 'We missed you! Come back stronger 💛',
      defaultBody: hasFreeze
        ? `Your streak freeze kicked in. You're still at ${current} day${
            current === 1 ? '' : 's'
          } — play today to keep climbing!`
        : `Your ${current}-day streak ended, but your ${longest}-day best is still waiting. A fresh start is one game away!`,
      defaultCta: 'Start fresh today',
    };
  }

  // ── In danger: played yesterday but not today, streak would break tomorrow
  if (days === 1) {
    return {
      mood: 'in_danger',
      Icon: AlertTriangle,
      iconClass: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-300/40',
      ringClass: 'ring-amber-300/60 animate-game-pulse',
      titleKey: 'student.streakReminder.inDanger.title',
      bodyKey: 'student.streakReminder.inDanger.body',
      ctaKey: 'student.streakReminder.inDanger.cta',
      defaultTitle: `${current} days strong! Don't let it slip 🔥`,
      defaultBody:
        'One quick game today keeps your streak alive and your XP multiplier rolling. You\'ve got this!',
      defaultCta: 'Play one game now',
    };
  }

  // ── 0-day gap but no current play (edge case: should be playedToday=true, but
  //    if we get here, just nudge)
  if (current >= 30) {
    return {
      mood: 'legend',
      Icon: Trophy,
      iconClass: 'bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-purple-300/40',
      ringClass: 'ring-purple-300/60',
      titleKey: 'student.streakReminder.legend.title',
      bodyKey: 'student.streakReminder.legend.body',
      ctaKey: 'student.streakReminder.legend.cta',
      defaultTitle: `${current}-day legend! 🌈`,
      defaultBody:
        'You\'re in the top tier of EliteKids. One more game today keeps the legend alive and the XP multiplier at 3×!',
      defaultCta: 'Keep the legend going',
    };
  }

  if (current >= 7) {
    return {
      mood: 'on_fire',
      Icon: Flame,
      iconClass: 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-orange-300/40',
      ringClass: 'ring-orange-300/60',
      titleKey: 'student.streakReminder.onFire.title',
      bodyKey: 'student.streakReminder.onFire.body',
      ctaKey: 'student.streakReminder.onFire.cta',
      defaultTitle: `You\'re on fire! ${current} days in a row 🔥`,
      defaultBody: 'Your XP multiplier is boosted. Tap in for a quick game and keep the flame alive!',
      defaultCta: 'Keep the flame burning',
    };
  }

  if (current >= 1) {
    return {
      mood: 'comeback',
      Icon: Sun,
      iconClass: 'bg-gradient-to-br from-amber-300 to-orange-400 text-white shadow-amber-200/40',
      ringClass: 'ring-amber-200/60',
      titleKey: 'student.streakReminder.comeback.title',
      bodyKey: 'student.streakReminder.comeback.body',
      ctaKey: 'student.streakReminder.comeback.cta',
      defaultTitle: `Day ${current} — nice work! 🌟`,
      defaultBody:
        "You're building a real habit. One more game today and you'll be halfway to a Super Star sticker!",
      defaultCta: 'Add to my streak',
    };
  }

  // Should not reach here if playedToday=false, but be safe.
  return null;
}

export default function StreakReminder({
  state,
  freezeCount = 0,
  playedToday = false,
  isFirstSession = false,
  firstLessonId = null,
}: StreakReminderProps) {
  const navigate = useNavigate();
  const content = useMemo(
    () => pickContent(state, playedToday, isFirstSession, freezeCount),
    [state, playedToday, isFirstSession, freezeCount],
  );

  if (!content) return null;

  const handleCta = () => {
    playTap();
    if (firstLessonId) {
      navigate(`/student/game/${firstLessonId}?mode=learning`);
    } else {
      // Scroll to the path area; the LearningPath renders lessons below.
      document
        .getElementById('welcome-learning-path')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const current = state?.currentStreak ?? 0;
  const longest = state?.longestStreak ?? 0;
  const s = current === 1 ? '' : 's';

  const title = t(content.titleKey, {
    current,
    longest,
    s,
    defaultValue: content.defaultTitle,
  });
  const body = t(content.bodyKey, {
    current,
    longest,
    s,
    defaultValue: content.defaultBody,
  });
  const cta = t(content.ctaKey, {
    current,
    longest,
    s,
    defaultValue: content.defaultCta,
  });

  return (
    <div
      className={`mb-4 relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-white via-white to-amber-50/40 p-4 shadow-xl ring-2 ${content.ringClass} backdrop-blur-xl animate-game-slide-up`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl shadow-lg ${content.iconClass}`}
          aria-hidden="true"
        >
          <content.Icon className="h-7 w-7 drop-shadow" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-extrabold leading-tight text-gray-800">{title}</h3>
            {content.mood === 'in_danger' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                <Calendar className="h-3 w-3" />
                {t('student.streakReminder.tonight', { defaultValue: 'Tonight' })}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-gray-500">{body}</p>
        </div>
        <button
          type="button"
          onClick={handleCta}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2.5 text-sm font-black text-white shadow-md shadow-orange-500/30 transition-all hover:brightness-110 hover:shadow-lg active:scale-95"
        >
          <Play className="h-4 w-4 fill-white" />
          {cta}
        </button>
      </div>

      {/* Decorative streak flames in the corner for emotional flavour */}
      {content.mood === 'on_fire' && (
        <>
          <Flame className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 text-orange-300/30" />
          <Flame className="pointer-events-none absolute -bottom-6 -left-2 h-16 w-16 text-red-300/20" />
        </>
      )}
      {content.mood === 'legend' && (
        <>
          <Sparkles className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 text-purple-300/30" />
          <Trophy className="pointer-events-none absolute -bottom-4 -left-2 h-16 w-16 text-indigo-300/20" />
        </>
      )}
    </div>
  );
}

// Re-export small helper for callers that want to know "did this child play
// today" without re-implementing the date math.
export function hasPlayedToday(state: StreakState | null, now = new Date()): boolean {
  if (!state?.lastPlayDate) return false;
  return state.lastPlayDate === todayKey(now);
}
