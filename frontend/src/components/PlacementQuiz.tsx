import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import { playCorrect, playTap } from '@/lib/utils/sound';
import { haptic } from '@/lib/utils/haptic';

/**
 * PlacementQuiz — "measure the child, place the child" (Q4).
 *
 * Short multiple-choice quiz built from published games of each band
 * (ascending). On submit the server scores it and persists a band placement
 * that outranks class names + tour declarations (kids_band_placements →
 * ageBand.resolveBandForAdmission). Shown on the student dashboard whenever
 * the game catalog would otherwise be empty (elder/unmapped classes) or when
 * the child taps the placement CTA.
 *
 * Kid-friendly: big tap targets, playful copy, progress dots, and the same
 * sounds as the games — this should feel like a game, not an exam.
 */

interface PlacementQuestion {
  id: string;
  band: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
}

interface PlacementResult {
  band: string;
  score_pct: number;
}

const BAND_EMOJI: Record<string, string> = {
  Creche: '🐣',
  Nursery: '🎈',
  KG1: '🧩',
  KG2: '🚀',
  Primary: '🌟',
};

export default function PlacementQuiz({
  open,
  onClose,
  onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful placement so the dashboard can refresh. */
  onPlaced?: (band: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<PlacementQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setQuestions(null);
    setAnswers({});
    setIdx(0);
    setResult(null);
    try {
      const res = await apiClient.get(ENDPOINTS.PLACEMENT.QUIZ);
      const data = res.data?.data;
      if (!mounted.current) return;
      if (Array.isArray(data?.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        setError(t('placement.noneAvailable'));
      }
    } catch {
      if (mounted.current) setError(t('placement.loadFailed'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const q = questions && idx < questions.length ? questions[idx] : null;
  const picked = q ? answers[q.id] : undefined;

  const pick = (optionIndex: number) => {
    if (!q || submitting) return;
    haptic('light');
    setAnswers((prev) => ({ ...prev, [q.id]: optionIndex }));
  };

  const next = async () => {
    if (!q || picked === undefined) return;
    playTap();
    if (idx + 1 < (questions?.length || 0)) {
      setIdx(idx + 1);
      return;
    }
    // Last question → submit
    setSubmitting(true);
    try {
      const res = await apiClient.post(ENDPOINTS.PLACEMENT.SUBMIT, { answers });
      const data = res.data?.data;
      if (mounted.current && data?.band) {
        playCorrect();
        setResult({ band: data.band, score_pct: data.score_pct });
        onPlaced?.(data.band);
      } else if (mounted.current) {
        setError(t('placement.loadFailed'));
      }
    } catch {
      if (mounted.current) setError(t('placement.submitFailed'));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-label={t('placement.title')}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl animate-game-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-[#0F4D92]/5 to-teal-500/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <h2 className="text-base font-bold text-gray-800">{t('placement.title')}</h2>
          </div>
          <button
            onClick={() => { playTap(); onClose(); }}
            className="rounded-full bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200"
            aria-label={t('speech.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="text-4xl animate-game-bounce">🎯</span>
              <p className="text-sm font-medium text-gray-500">{t('placement.loading')}</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="text-4xl">🙈</span>
              <p className="text-sm text-gray-500">{error}</p>
              <button
                onClick={() => void load()}
                className="rounded-xl bg-[#0F4D92] px-4 py-2 text-xs font-bold text-white hover:bg-[#0D3F7A]"
              >
                {t('placement.tryAgain')}
              </button>
            </div>
          )}

          {!loading && !error && result && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <span className="text-6xl animate-game-pop">{BAND_EMOJI[result.band] || '🎉'}</span>
              <h3 className="text-xl font-extrabold text-gray-800">{t('placement.doneTitle')}</h3>
              <p className="max-w-sm text-sm text-gray-500">{t('placement.doneBody', { score: result.score_pct })}</p>
              <div className="rounded-2xl bg-[#0F4D92]/5 px-6 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#0F4D92]/60">{t('placement.yourLevel')}</p>
                <p className="text-lg font-black text-[#0F4D92]">{result.band}</p>
              </div>
              <button
                onClick={() => { playTap(); onClose(); }}
                className="mt-2 rounded-xl bg-[#0d9488] px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 active:scale-95"
              >
                {t('placement.letsPlay')} 🎮
              </button>
            </div>
          )}

          {!loading && !error && questions && q && !result && (
            <>
              {/* Progress dots */}
              <div className="mb-4 flex items-center justify-center gap-1.5">
                {questions.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-[#0F4D92]' : i < idx ? 'w-2 bg-[#0d9488]' : 'w-2 bg-gray-200'}`}
                  />
                ))}
              </div>
              <p className="mb-1 text-center text-xs font-bold uppercase tracking-wide text-gray-400">
                {t('placement.questionOf', { current: idx + 1, total: questions.length })}
              </p>
              <h3 className="mb-5 text-center text-lg font-bold text-gray-800">{q.prompt}</h3>
              <div className="grid gap-2.5">
                {q.options.map((opt, i) => (
                  <button
                    key={opt.id}
                    onClick={() => pick(i)}
                    className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm font-semibold transition-all active:scale-[0.98] ${
                      picked === i
                        ? 'border-[#0F4D92] bg-[#0F4D92]/5 text-[#0F4D92] shadow-md'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-[#0F4D92]/30 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                        picked === i ? 'bg-[#0F4D92] text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-base">{opt.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => void next()}
                disabled={picked === undefined || submitting}
                className="mt-5 w-full rounded-2xl bg-[#0F4D92] py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#0D3F7A] active:scale-[0.98] disabled:opacity-40"
              >
                {submitting ? t('placement.saving') : idx + 1 < questions.length ? t('placement.nextQuestion') : t('placement.finish')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
