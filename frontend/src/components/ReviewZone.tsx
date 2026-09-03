import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Star, RefreshCw, ChevronRight, Target, Flame, Trophy, Zap, Sparkles } from 'lucide-react';
import { playTap, playScore } from '@/lib/game/sound-effects';
import { t } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* ── Types ──────────────────────────────────────────────────── */

interface DueReview {
  subject: string;
  topic: string;
  difficulty: number;
  accuracy_7d: number;
  next_review_at: string;
  lesson_id: string;
  lesson_title: string;
}

interface ReviewStats {
  total_reviewed: number;
  due_today: number;
  streak_days: number;
  avg_accuracy: number;
}

/* ── Floating decoration for game feel ─────────────────────── */
function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-30 ${className}`} />
  );
}

export default function ReviewZone() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<DueReview[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // Q1: prefer the v2 (SM-2+) spaced repetition endpoints; fall back to v1.
      let reviewsData: any[] | null = null;
      let statsData: any = null;
      const [v2Today, v2Stats] = await Promise.all([
        apiClient.get(ENDPOINTS.REVIEWS_V2.TODAY).catch(() => ({ data: { data: null } })),
        apiClient.get(ENDPOINTS.REVIEWS_V2.STATS).catch(() => ({ data: { data: null } })),
      ]);
      if (v2Today.data?.data) {
        const v2 = v2Today.data.data;
        // Map v2 review items into the existing render contract.
        reviewsData = (v2.reviews || []).map((r: any) => ({
          subject: r.skill_key || 'general',
          topic: r.skill_key || '', // skill_key doubles as the topic label
          difficulty: r.mastery_probability ? Math.max(1, Math.min(5, Math.round(Number(r.mastery_probability) * 5))) : 3,
          accuracy_7d: r.quality_last != null ? Number(r.quality_last) * 20 : 0,
          next_review_at: r.next_review_at,
          lesson_id: r.lesson_id || r.item_id,
          lesson_title: r.lesson_title,
        }));
        const s = v2Stats.data?.data;
        if (s) {
          statsData = {
            total_reviewed: Number(s.total_items || 0),
            due_today: Number(v2.due_count != null ? v2.due_count : s.due_today || 0),
            streak_days: Number(s.streak_days || 0),
            avg_accuracy: Number(s.avg_accuracy || 0),
          };
        }
      }
      if (!reviewsData) {
        // Fallback to v1
        const [v1Due, v1Stats] = await Promise.all([
          apiClient.get(ENDPOINTS.REVIEWS.DUE).catch(() => ({ data: { data: [] } })),
          apiClient.get(ENDPOINTS.REVIEWS.STATS).catch(() => ({ data: { data: null } })),
        ]);
        reviewsData = v1Due.data?.data || [];
        statsData = v1Stats.data?.data || null;
      }
      setReviews(reviewsData || []);
      setStats(statsData || null);
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleStartReview = (review: DueReview) => {
    playTap();
    navigate(`/student/game/${review.lesson_id}?mode=practice`);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  const accuracy = stats ? Math.round(Number(stats.avg_accuracy) || 0) : 0;
  const safeAccuracy = Number.isFinite(accuracy) ? accuracy : 0;

  return (
    <div className="space-y-4">
      {/* Header — game-style glassmorphism panel */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0F4D92]/5 via-[#0d9488]/5 to-amber-50/50 backdrop-blur-xl border border-white/60 p-5 shadow-xl shadow-[#0F4D92]/5">
        <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-orange-400 to-amber-400" />
        <FloatingDeco className="-left-6 -bottom-6 h-20 w-20 bg-gradient-to-br from-pink-400 to-rose-400" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-500 shadow-xl shadow-orange-300/50 ring-2 ring-white/50">
              <Target className="h-6 w-6 text-white drop-shadow-lg" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-gray-800">{t('reviewZone.title')}</h3>
              <p className="text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">Spaced repetition power-up</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-white/70 backdrop-blur-sm border border-white/80 hover:bg-white transition shadow-lg shadow-[#0F4D92]/5 disabled:opacity-50 active:scale-90 hover:scale-105"
          >
            <RefreshCw className={`h-4 w-4 text-[#0d9488] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats — 4-card game dashboard */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Due Today — Fire */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-500 p-4 text-center text-white shadow-xl shadow-orange-300/40 group hover:scale-[1.04] transition-transform duration-300">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/15 blur-xl" />
            <div className="absolute -left-3 -bottom-3 h-14 w-14 rounded-full bg-white/10 blur-lg" />
            <div className="absolute top-2 right-3 h-2 w-2 rounded-full bg-white/40 animate-pulse" />
            <Flame className="mx-auto mb-2 h-8 w-8 drop-shadow-lg group-hover:animate-bounce" />
            <div className="text-3xl font-black drop-shadow-sm">{stats.due_today}</div>
            <div className="mt-1 text-[10px] font-bold text-white/80 uppercase tracking-wider">{t('reviewZone.dueToday')}</div>
          </div>

          {/* Reviewed — Trophy */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500 p-4 text-center text-white shadow-xl shadow-green-300/40 group hover:scale-[1.04] transition-transform duration-300">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/15 blur-xl" />
            <div className="absolute -left-3 -bottom-3 h-14 w-14 rounded-full bg-white/10 blur-lg" />
            <div className="absolute top-2 right-3 h-2 w-2 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: '0.5s' }} />
            <Trophy className="mx-auto mb-2 h-8 w-8 drop-shadow-lg group-hover:animate-bounce" />
            <div className="text-3xl font-black drop-shadow-sm">{stats.total_reviewed}</div>
            <div className="mt-1 text-[10px] font-bold text-white/80 uppercase tracking-wider">{t('reviewZone.reviewed')}</div>
          </div>

          {/* Day Streak — Lightning */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-500 p-4 text-center text-white shadow-xl shadow-blue-300/40 group hover:scale-[1.04] transition-transform duration-300">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/15 blur-xl" />
            <div className="absolute -left-3 -bottom-3 h-14 w-14 rounded-full bg-white/10 blur-lg" />
            <div className="absolute top-2 right-3 h-2 w-2 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: '1s' }} />
            <Zap className="mx-auto mb-2 h-8 w-8 drop-shadow-lg group-hover:animate-bounce" />
            <div className="text-3xl font-black drop-shadow-sm">{stats.streak_days}</div>
            <div className="mt-1 text-[10px] font-bold text-white/80 uppercase tracking-wider">{t('student.home.dayStreak')}</div>
          </div>

          {/* Accuracy — Sparkles (NaN-safe) */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-400 via-rose-500 to-red-500 p-4 text-center text-white shadow-xl shadow-pink-300/40 group hover:scale-[1.04] transition-transform duration-300">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/15 blur-xl" />
            <div className="absolute -left-3 -bottom-3 h-14 w-14 rounded-full bg-white/10 blur-lg" />
            <div className="absolute top-2 right-3 h-2 w-2 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: '1.5s' }} />
            <Sparkles className="mx-auto mb-2 h-8 w-8 drop-shadow-lg group-hover:animate-bounce" />
            <div className="text-3xl font-black drop-shadow-sm">{safeAccuracy}%</div>
            <div className="mt-1 text-[10px] font-bold text-white/80 uppercase tracking-wider">{t('reviewZone.accuracy')}</div>
          </div>
        </div>
      )}

      {/* Due Reviews */}
      {reviews.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-[#0d9488]/20 bg-gradient-to-br from-[#0d9488]/5 via-teal-50 to-emerald-50 p-10 text-center shadow-inner">
          <FloatingDeco className="-right-6 -top-6 h-28 w-28 bg-gradient-to-br from-[#0d9488] to-teal-400" />
          <FloatingDeco className="-left-4 -bottom-4 h-20 w-20 bg-gradient-to-br from-emerald-400 to-green-400" />
          <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d9488] to-emerald-500 shadow-xl shadow-[#0d9488]/30 ring-2 ring-white/60">
            <BookOpen className="h-8 w-8 text-white drop-shadow" />
          </div>
          <p className="relative text-lg font-extrabold text-gray-800">{t('reviewZone.empty')}</p>
          <p className="relative mt-1 text-sm text-gray-500">{t('reviewZone.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review, idx) => (
            <button
              key={`${review.subject}-${review.topic}`}
              onClick={() => handleStartReview(review)}
              className="w-full flex items-center gap-4 rounded-3xl border-2 border-[#0d9488]/10 bg-gradient-to-r from-white via-[#0d9488]/[0.02] to-teal-50/30 p-4 text-left transition-all hover:border-[#0d9488]/30 hover:shadow-xl hover:shadow-[#0d9488]/10 hover:scale-[1.01] active:scale-[0.99] group"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d9488] to-emerald-500 shadow-lg shadow-[#0d9488]/30 group-hover:scale-110 group-hover:rotate-3 transition-transform">
                <Star className="h-6 w-6 text-white drop-shadow" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-800 truncate">{review.lesson_title || review.topic}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#0d9488]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0d9488]">
                    {review.subject}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                    Lvl {review.difficulty}/5
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-bold text-green-700">
                    {Math.round(Number(review.accuracy_7d) || 0)}% ✓
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#0d9488] to-emerald-500 px-4 py-2.5 text-[11px] font-bold text-white shadow-lg shadow-[#0d9488]/30 group-hover:shadow-[#0d9488]/40 group-hover:scale-105 transition-all">
                  <Clock className="h-3.5 w-3.5" />
                  {t('reviewZone.dueNow')}
                </div>
                <ChevronRight className="h-5 w-5 text-[#0d9488]/40 group-hover:text-[#0d9488] group-hover:translate-x-1 transition-all" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
