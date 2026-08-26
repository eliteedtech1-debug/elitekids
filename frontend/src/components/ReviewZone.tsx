import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Star, RefreshCw, ChevronRight } from 'lucide-react';
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

export default function ReviewZone() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<DueReview[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [reviewsRes, statsRes] = await Promise.all([
        apiClient.get(ENDPOINTS.REVIEWS.DUE).catch(() => ({ data: { data: [] } })),
        apiClient.get(ENDPOINTS.REVIEWS.STATS).catch(() => ({ data: { data: null } })),
      ]);
      setReviews(reviewsRes.data?.data || []);
      setStats(statsRes.data?.data || null);
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
    navigate(`/student/play/${review.lesson_id}?mode=practice`);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-bold text-gray-800">{t('reviewZone.title')}</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.due_today}</div>
            <div className="text-xs text-amber-700">{t('reviewZone.dueToday')}</div>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.total_reviewed}</div>
            <div className="text-xs text-green-700">{t('reviewZone.reviewed')}</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.streak_days}</div>
            <div className="text-xs text-blue-700">{t('student.home.dayStreak')}</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-purple-600">{Math.round(stats.avg_accuracy)}%</div>
            <div className="text-xs text-purple-700">{t('reviewZone.accuracy')}</div>
          </div>
        </div>
      )}

      {/* Due Reviews */}
      {reviews.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">{t('reviewZone.empty')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('reviewZone.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map((review) => (
            <button
              key={`${review.subject}-${review.topic}`}
              onClick={() => handleStartReview(review)}
              className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 
                         hover:border-amber-300 hover:bg-amber-50 transition text-left group"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Star className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-800 truncate">{review.lesson_title || review.topic}</div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="capitalize">{review.subject}</span>
                  <span>·</span>
                  <span>{t('reviewZone.difficulty', { difficulty: review.difficulty })}</span>
                  <span>·</span>
                  <span>{t('reviewZone.accuracyPct', { accuracy: Math.round(review.accuracy_7d) })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="h-3 w-3" />
                <span>{t('reviewZone.dueNow')}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-amber-500 transition" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
