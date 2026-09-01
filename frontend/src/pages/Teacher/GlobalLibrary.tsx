import { useState, useEffect, useCallback } from 'react';
import { Globe, Search, BookOpen, ChevronRight, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { t } from '@/lib/i18n';

interface Series {
  id: string;
  name: string;
  category: string;
  description?: string;
  subject_code?: string;
  school_id?: string;
  lesson_count?: number;
}

interface DomesticatedMap {
  [seriesId: string]: boolean;
}

const SUBJECT_OPTIONS = [
  'MATHEMATICS', 'ENGLISH', 'SCIENCE', 'SOCIAL_STUDIES',
  'CCR', 'VOCABULARY', 'GENERAL_KNOWLEDGE', 'CREATIVE_ARTS',
  'CULTURAL_STUDIES', 'PHYSICAL_EDUCATION', 'MORAL_INSTRUCTION',
];

export default function GlobalLibrary() {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [domesticated, setDomesticated] = useState<DomesticatedMap>({});
  const [domesticating, setDomesticating] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Record<string, string>>({});
  const [showSubjectPicker, setShowSubjectPicker] = useState<string | null>(null);

  const loadSeries = useCallback(async () => {
    try {
      const res = await apiClient.get('/kids/series');
      const list = res.data?.data || [];
      setSeries(list);
      // Check which are already domesticated
      const domRes = await apiClient.get('/kids/series-domestications').catch(() => ({ data: { data: [] } }));
      const domList = domRes.data?.data || [];
      const map: DomesticatedMap = {};
      for (const d of domList) map[d.series_id] = true;
      setDomesticated(map);
    } catch {
      toast.error(t('globalLibrary.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSeries(); }, [loadSeries]);

  const handleDomesticate = useCallback(async (seriesId: string) => {
    const subject = selectedSubject[showSubjectPicker || seriesId];
    if (!subject) {
      toast.error(t('globalLibrary.selectSubject'));
      return;
    }
    setDomesticating(seriesId);
    try {
      await apiClient.post(`/kids/series/${seriesId}/domesticate`, { subject_code: subject });
      setDomesticated((prev) => ({ ...prev, [seriesId]: true }));
      toast.success(t('globalLibrary.domesticated'));
      setShowSubjectPicker(null);
    } catch (err: any) {
      toast.error(err?.message || t('globalLibrary.domesticateFailed'));
    } finally {
      setDomesticating(null);
    }
  }, [selectedSubject, showSubjectPicker]);

  const filtered = series.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
            <Globe className="h-6 w-6 text-blue-500" />
            {t('globalLibrary.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('globalLibrary.subtitle')}</p>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('globalLibrary.searchPlaceholder')}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-blue-300 focus:outline-none"
          />
        </div>

        {/* Series List */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <BookOpen className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-sm font-bold text-gray-600">{t('globalLibrary.noResults')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => {
              const isDom = domesticated[s.id];
              const isPicking = showSubjectPicker === s.id;
              return (
                <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg">
                      📚
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-extrabold text-gray-800">{s.name}</h3>
                        {isDom && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600">
                            <Check className="h-3 w-3" /> {t('globalLibrary.added')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{s.category}{s.lesson_count ? ` · ${s.lesson_count} games` : ''}</p>
                      {s.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{s.description}</p>
                      )}
                    </div>
                    {!isDom && (
                      <div className="flex shrink-0 items-center gap-2">
                        {isPicking ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={selectedSubject[s.id] || ''}
                              onChange={(e) => setSelectedSubject((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                            >
                              <option value="">{t('globalLibrary.pickSubject')}</option>
                              {SUBJECT_OPTIONS.map((sub) => (
                                <option key={sub} value={sub}>{sub}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleDomesticate(s.id)}
                              disabled={domesticating === s.id}
                              className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50"
                            >
                              {domesticating === s.id ? '...' : t('globalLibrary.addToMySubjects')}
                            </button>
                            <button
                              onClick={() => setShowSubjectPicker(null)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowSubjectPicker(s.id)}
                            className="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100"
                          >
                            {t('globalLibrary.browse')} <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
