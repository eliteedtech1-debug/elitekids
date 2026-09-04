import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Keyboard, CheckCircle2, XCircle, Flame, Clock3, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import { getRecognition, stopRecognition, type SpeechRecognitionLike } from '@/lib/utils/speechRecognition';
import {
  readingMinutes,
  readingStreak,
  todayRollup,
  type CoachItem,
  type ProgressDay,
} from '@/lib/utils/speechCoach';

/**
 * ReadingTracker (Q2-F leaf, brief q2-opencode-lowdep.md Q25).
 *
 * Read-a-thon tracker: the kid reads a pack of sentences out loud, each one
 * graded by POST /kids/speech/assess (server-logged). Shows per-item pass
 * chips, minutes read today (passing attempts only), and a streak spark built
 * from GET /kids/speech/progress day rows. Purely client + live endpoints —
 * no backend changes.
 */

interface AssessResult {
  overall: number;
  passed: boolean;
  message: string;
}

interface AttemptRecord {
  item: CoachItem;
  passed: boolean;
  duration_ms: number;
  score: number;
}

interface ReadingTrackerProps {
  items: CoachItem[];
  /** Called when the whole pack finishes. */
  onComplete?: (passedCount: number) => void;
}

export default function ReadingTracker({ items, onComplete }: ReadingTrackerProps) {
  const [idx, setIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [typedMode, setTypedMode] = useState(false);
  const [typedValue, setTypedValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [progress, setProgress] = useState<ProgressDay[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef<number>(0);

  const item = items[idx];
  const done = idx >= items.length;

  // Load today's rollup + streak from the live progress endpoint.
  useEffect(() => {
    let alive = true;
    apiClient
      .get('/kids/speech/progress', { params: { days: 30 } })
      .then((r) => {
        if (!alive) return;
        const days = Array.isArray(r?.data?.data?.days) ? r.data.data.days : [];
        setProgress(days.map((d: any) => ({
          day: String(d.day || ''),
          attempts: Number(d.attempts || 0),
          passed: Number(d.passed || 0),
          avg_score: Number(d.avg_score || 0),
        })));
      })
      .catch(() => { /* keep empty — spark shows 0 */ })
      .finally(() => alive && setProgressLoading(false));
    return () => { alive = false; };
  }, []);

  const cleanup = useCallback(() => {
    stopRecognition(recRef.current);
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const submit = useCallback(
    async (text: string, durationMs: number) => {
      if (!text.trim()) {
        toast.error(t('speech.noSpeech', { defaultValue: 'I didn’t hear anything — try again! 🎤' }));
        return;
      }
      setBusy(true);
      try {
        const { data } = await apiClient.post('/kids/speech/assess', {
          expected_text: item.expected_text,
          transcript: text,
          mode: item.mode,
          duration_ms: Math.max(0, Math.round(durationMs)),
          template: item.mode === 'letter' ? 'speech-letter' : item.mode === 'sentence' ? 'speech-sentence' : 'speech-word',
        });
        const r: AssessResult = {
          overall: Number(data?.data?.overall ?? 0),
          passed: Boolean(data?.data?.passed),
          message: String(data?.data?.message ?? ''),
        };
        setAttempts((a) => [...a, { item, passed: r.passed, duration_ms: Math.max(0, Math.round(durationMs)), score: r.overall }]);
        setIdx((i) => i + 1);
      } catch {
        toast.error(t('speech.saveError', { defaultValue: 'Could not check your answer — check your connection. 💛' }));
      } finally {
        setBusy(false);
      }
    },
    [item],
  );

  const startListening = useCallback(() => {
    playTap();
    const rec = getRecognition();
    if (!rec) {
      setTypedMode(true);
      toast.error(t('speech.unsupported', { defaultValue: 'Voice is not supported here — you can type it instead! ⌨️' }));
      return;
    }
    cleanup();
    recRef.current = rec;
    startedAtRef.current = Date.now();
    rec.onresult = (e: any) => {
      const text = e?.results?.[0]?.[0]?.transcript || '';
      cleanup();
      void submit(text, Date.now() - startedAtRef.current);
    };
    rec.onerror = (e: any) => {
      cleanup();
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setTypedMode(true);
        toast.error(t('speech.micBlocked', { defaultValue: 'Microphone is blocked — type your answer instead ⌨️' }));
      } else {
        toast.error(t('speech.noSpeech', { defaultValue: 'I didn’t hear anything — try again! 🎤' }));
      }
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [cleanup, submit]);

  const submitTyped = useCallback(() => {
    playTap();
    void submit(typedValue, 0);
  }, [submit, typedValue]);

  const finish = useCallback(() => {
    playTap();
    const passed = attempts.filter((a) => a.passed).length;
    onComplete?.(passed);
    toast.success(t('readingTracker.done', { passed, total: items.length, defaultValue: 'Read-a-thon complete — {passed} of {total} passed!' }));
  }, [attempts, items.length, onComplete]);

  const today = todayRollup(progress);
  const streak = readingStreak(progress);
  const mins = readingMinutes(attempts);

  return (
    <div className="mx-auto mb-4 max-w-md rounded-3xl border border-teal-200/60 bg-gradient-to-br from-white via-teal-50/60 to-emerald-50/40 p-5 shadow-lg backdrop-blur-xl">
      <h2 className="text-center text-lg font-black text-gray-800">{t('readingTracker.title', { defaultValue: 'Reading Tracker' })}</h2>
      <p className="mb-3 text-center text-xs font-semibold text-teal-600/80">{t('readingTracker.subtitle', { defaultValue: 'Read-a-thon! Read sentences out loud.' })}</p>

      {/* Stats row: today reads, minutes, streak */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white/90 p-3 text-center shadow-sm">
          <BookOpen className="mx-auto h-4 w-4 text-teal-500" />
          <p className="mt-1 text-lg font-black text-gray-800">{progressLoading ? '…' : `${today.passed}/${today.attempts || 0}`}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{t('readingTracker.todayAttempts', { count: today.attempts || 0, defaultValue: '{count} reads today' })}</p>
        </div>
        <div className="rounded-2xl bg-white/90 p-3 text-center shadow-sm">
          <Clock3 className="mx-auto h-4 w-4 text-teal-500" />
          <p className="mt-1 text-lg font-black text-gray-800">{mins}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{t('readingTracker.minutesToday', { count: String(mins).replace(' min', '') || 0, defaultValue: '{count} min today' })}</p>
        </div>
        <div className="rounded-2xl bg-white/90 p-3 text-center shadow-sm">
          <Flame className={`mx-auto h-4 w-4 ${streak > 0 ? 'text-orange-500' : 'text-gray-300'}`} />
          <p className="mt-1 text-lg font-black text-gray-800">{streak > 0 ? `🔥${streak}` : '—'}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{t('readingTracker.streakDays', { count: streak, defaultValue: '{count}-day streak' })}</p>
        </div>
      </div>

      {/* Per-item pass chips */}
      {attempts.length > 0 && (
        <div className="mb-4 flex flex-wrap justify-center gap-1.5">
          {attempts.map((a, i) => (
            <span
              key={`${a.item.id}-${i}`}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
                a.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
              title={a.item.expected_text}
            >
              {a.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {a.passed ? t('readingTracker.passedChip', { defaultValue: '✓ Passed' }) : `${a.score}%`}
            </span>
          ))}
        </div>
      )}

      {/* Current item OR completion */}
      {!done && item ? (
        <>
          <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-teal-600">
            {t('readingTracker.item', { current: idx + 1, total: items.length })}
          </p>
          <div className="rounded-2xl bg-white/90 p-6 text-center shadow-inner">
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-500">{t('readingTracker.readThis', { defaultValue: 'Read this!' })}</p>
            <p className={`mt-2 font-black text-gray-800 ${item.mode === 'sentence' ? 'text-xl leading-snug' : 'text-5xl tracking-wide'}`}>
              {item.expected_text}
            </p>
          </div>

          {!typedMode ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={startListening}
                disabled={busy || listening}
                className={`inline-flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl transition-all active:scale-95 disabled:opacity-70 ${
                  listening
                    ? 'animate-game-pulse bg-gradient-to-br from-rose-500 to-red-500 shadow-rose-300/50'
                    : 'bg-gradient-to-br from-teal-400 to-emerald-500 shadow-teal-300/50 hover:brightness-110'
                }`}
                aria-label={listening ? t('readingTracker.listening', { defaultValue: 'Listening…' }) : t('readingTracker.tapToRead', { defaultValue: 'Tap to read' })}
              >
                <Mic className="h-7 w-7" />
              </button>
              <p className="text-xs font-bold text-teal-700">
                {listening ? t('readingTracker.listening', { defaultValue: 'Listening…' }) : t('readingTracker.tapToRead', { defaultValue: 'Tap to read' })}
              </p>
              <button
                type="button"
                onClick={() => { playTap(); setTypedMode(true); }}
                className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <Keyboard className="h-3.5 w-3.5" />
                {t('speech.typeInstead', { defaultValue: 'Type it instead' })}
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <input
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitTyped()}
                placeholder={t('speech.typePlaceholder', { defaultValue: 'Type what you would say…' })}
                className="w-full rounded-2xl border border-teal-200 bg-white px-4 py-3 text-center text-lg font-bold text-gray-800 outline-none focus:border-teal-400"
                autoFocus
              />
              <button
                type="button"
                onClick={submitTyped}
                disabled={busy || !typedValue.trim()}
                className="rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-500 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? '…' : t('speech.checkAnswer', { defaultValue: 'Check my answer' })}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl bg-emerald-50/80 p-6 text-center border border-emerald-200">
          <p className="text-2xl">🎉</p>
          <p className="mt-1 text-sm font-black text-emerald-700">
            {t('readingTracker.done', { passed: attempts.filter((a) => a.passed).length, total: items.length, defaultValue: 'Read-a-thon complete — {passed} of {total} passed!' })}
          </p>
          <button
            type="button"
            onClick={finish}
            className="mt-3 inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95"
          >
            {t('readingTracker.finish', { defaultValue: 'Finished!' })}
          </button>
        </div>
      )}
    </div>
  );
}