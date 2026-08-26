import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Baby,
  BookOpen,
  Gamepad2,
  Loader2,
  LogOut,
  RefreshCw,
  Star,
  Zap,
  Eye,
  ArrowLeft,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t } from '@/lib/i18n';

interface LessonActivity {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  created_at: string;
  has_games: boolean;
  has_scenes: boolean;
  nerdc_code?: string;
  nerdc_strand?: string;
  nerdc_sub_strand?: string;
}

interface ProgressSummary {
  total_xp: number;
  total_stars: number;
  games_completed: number;
}

interface ChildActivity {
  child: {
    id: string;
    admission_no: string;
    full_name: string;
    age_level: string;
    class_code: string | null;
    avatar_url?: string | null;
    status: string;
  };
  progress: ProgressSummary;
  lessons: LessonActivity[];
  total_published: number;
}

const AVATAR_COLORS = ['bg-[#0F4D92]', 'bg-emerald-600', 'bg-amber-500', 'bg-rose-500', 'bg-violet-600'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function ParentActivities() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ChildActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/kids/parent/activities');
      setActivities(res.data?.data || []);
    } catch (err: any) {
      setError(err?.message || t('parent.loadActivitiesError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
    localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_BRANCH);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    navigate('/login');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      {/* Header */}
      <header className="border-b border-[#0F4D92]/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Elite Kids" className="h-10 w-10 rounded-full object-contain" />
            <div>
              <h1 className="text-lg font-bold leading-tight text-[#0F4D92]">Elite Kids</h1>
              <p className="text-xs text-gray-500">{t('parent.activitiesSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5"
            >
              <ArrowLeft className="h-4 w-4" /> {t('parent.dashboard')}
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> {t('parent.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">{t('parent.activitiesTitle')}</h2>
            <p className="text-sm text-gray-500">{t('parent.activitiesDescription')}</p>
          </div>
          <button
            onClick={loadActivities}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#0F4D92]/20 px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> {t('parent.loadingActivities')}
          </div>
        ) : activities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0F4D92]/30 bg-white p-10 text-center">
            <Baby className="mx-auto mb-3 h-10 w-10 text-[#0F4D92]/40" />
            <h3 className="font-semibold text-gray-700">{t('parent.noChildren')}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
              {t('parent.noChildrenHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {activities.map((item) => {
              const child = item.child;
              const progress = item.progress;
              const inactive = String(child.status || '').toLowerCase() !== 'active';

              return (
                <div key={child.id} className="rounded-2xl border border-[#0F4D92]/10 bg-white p-5 shadow-sm">
                  {/* Child header */}
                  <div className="flex items-start gap-3">
                    {child.avatar_url ? (
                      <img
                        src={child.avatar_url}
                        alt={child.full_name}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white ${colorFor(child.full_name)}`}
                      >
                        {initials(child.full_name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="flex items-center gap-2 truncate font-semibold text-gray-800">
                        {child.full_name}
                        {inactive && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                            {t('parent.inactive')}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {child.age_level}
                        {child.class_code ? ` · ${child.class_code}` : ''} · {child.admission_no}
                      </p>
                    </div>
                  </div>

                  {/* Progress strip */}
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#0F4D92]/5 p-3">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-lg font-bold text-amber-500">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {progress.total_stars}
                      </div>
                      <p className="text-[11px] text-gray-500">{t('parent.stars')}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-lg font-bold text-[#0F4D92]">
                        <Zap className="h-4 w-4" />
                        {progress.total_xp}
                      </div>
                      <p className="text-[11px] text-gray-500">{t('parent.xp')}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-lg font-bold text-gray-700">
                        <Gamepad2 className="h-4 w-4" />
                        {progress.games_completed}
                      </div>
                      <p className="text-[11px] text-gray-500">{t('parent.games')}</p>
                    </div>
                  </div>

                  {/* Published lessons */}
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-semibold text-gray-700">
                      {t('parent.publishedLessons', { count: item.total_published })}
                    </h4>
                    {item.lessons.length === 0 ? (
                      <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-400 text-center">
                        {t('parent.noLessons')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {item.lessons.map((lesson) => (
                          <div
                            key={lesson.id}
                            className="flex items-center gap-3 rounded-xl border border-[#0F4D92]/5 bg-[#0F4D92]/[0.02] p-3 transition hover:bg-[#0F4D92]/[0.04]"
                          >
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F4D92]/10 text-[#0F4D92]">
                              {lesson.lesson_type === 'game' ? (
                                <Gamepad2 className="h-4 w-4" />
                              ) : (
                                <BookOpen className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-800">{lesson.title}</p>
                              <p className="text-[11px] text-gray-500">
                                {lesson.subject} · {lesson.age_level}
                                {lesson.has_games && lesson.has_scenes && ` · ${t('parent.interactive')}`}
                              </p>
                              {(lesson.nerdc_code || lesson.nerdc_strand) && (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {lesson.nerdc_code && (
                                    <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">📘 {lesson.nerdc_code}</span>
                                  )}
                                  {lesson.nerdc_strand && (
                                    <span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-600">
                                      {lesson.nerdc_strand}{lesson.nerdc_sub_strand ? ` · ${lesson.nerdc_sub_strand}` : ''}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {lesson.has_games && (
                                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                  {t('parent.game')}
                                </span>
                              )}
                              {lesson.has_scenes && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                  {t('parent.scenes')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Read-only notice */}
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    {t('parent.activitiesNotice')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
