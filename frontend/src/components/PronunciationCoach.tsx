import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Keyboard, CheckCircle2, XCircle, RotateCcw, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import { getRecognition, stopRecognition, type SpeechRecognitionLike } from '@/lib/utils/speechRecognition';
import { bandForScore, type CoachItem } from '@/lib/utils/speechCoach';

/**
 * PronunciationCoach (Q2-F leaf, brief q2-opencode-lowdep.md Q25).
 *
 * Per-item coach: shows one target word/phrase, the kid speaks (or types) it,
 * the transcript is scored by POST /kids/speech/assess, and the kid gets
 * banded feedback (word accuracy / letter accuracy / fluency) with a
 * "try again" vs "great → next" loop. Same Web Speech pattern as SpeechGame,
 * same endpoint — every attempt is logged server-side.
 */

interface AssessResult {
  overall: number;
  passed: boolean;
  band: string;
  message: string;
  word_accuracy: number;
  letter_accuracy: number;
  fluency: number;
}

interface PronunciationCoachProps {
  items: CoachItem[];
  /** Called when the whole pack finishes. */
  onComplete?: (passedCount: number) => void;
}

export default function PronunciationCoach({ items, onComplete }: PronunciationCoachProps) {
  const [idx, setIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [typedMode, setTypedMode] = useState(false);
  const [typedValue, setTypedValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssessResult | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef<number>(0);

  const item = items[idx];

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
          band: String(data?.data?.band ?? 'try_again'),
          message: String(data?.data?.message ?? ''),
          word_accuracy: Number(data?.data?.word_accuracy ?? 0),
          letter_accuracy: Number(data?.data?.letter_accuracy ?? 0),
          fluency: Number(data?.data?.fluency ?? 0),
        };
        setResult(r);
        if (r.passed) setPassedCount((p) => p + 1);
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
    setResult(null);
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

  const retry = useCallback(() => {
    playTap();
    setResult(null);
    setTypedValue('');
    setTypedMode(false);
  }, []);

  const next = useCallback(() => {
    playTap();
    setResult(null);
    setTypedValue('');
    setTypedMode(false);
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
    } else {
      onComplete?.(passedCount);
      toast.success(t('speechCoach.done', { defaultValue: 'Coach finished — amazing work! 🌟' }));
    }
  }, [idx, items.length, passedCount, onComplete]);

  if (!item) return null;

  const band = result ? bandForScore(result.overall) : null;

  return (
    <div className="mx-auto mb-4 max-w-md rounded-3xl border border-teal-200/60 bg-gradient-to-br from-white via-teal-50/60 to-emerald-50/40 p-5 shadow-lg backdrop-blur-xl">
      <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-wider text-teal-600">
        {t('speechCoach.item', { current: idx + 1, total: items.length })}
      </p>
      <h2 className="mb-2 text-center text-lg font-black text-gray-800">{t('speechCoach.title', { defaultValue: 'Pronunciation Coach' })}</h2>
      <p className="mb-4 text-center text-xs font-semibold text-teal-600/80">{t('speechCoach.subtitle', { defaultValue: 'Tap the mic and say it like a star!' })}</p>

      {/* The prompt */}
      <div className="rounded-2xl bg-white/90 p-6 text-center shadow-inner">
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-500">{t('speechCoach.sayThis', { defaultValue: 'Say this!' })}</p>
        <p className={`mt-2 font-black text-gray-800 ${item.mode === 'sentence' ? 'text-xl leading-snug' : 'text-5xl tracking-wide'}`}>
          {item.expected_text}
        </p>
      </div>

      {/* Answer area */}
      {!result && (
        <>
          {!typedMode ? (
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={startListening}
                disabled={busy || listening}
                className={`inline-flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-all active:scale-95 disabled:opacity-70 ${
                  listening
                    ? 'animate-game-pulse bg-gradient-to-br from-rose-500 to-red-500 shadow-rose-300/50'
                    : 'bg-gradient-to-br from-teal-400 to-emerald-500 shadow-teal-300/50 hover:brightness-110'
                }`}
                aria-label={listening ? t('speechCoach.listening', { defaultValue: 'Listening…' }) : t('speechCoach.tapToSpeak', { defaultValue: 'Tap to speak' })}
              >
                <Mic className="h-9 w-9" />
              </button>
              <p className="text-xs font-bold text-teal-700">
                {listening ? t('speechCoach.listening', { defaultValue: 'Listening…' }) : t('speechCoach.tapToSpeak', { defaultValue: 'Tap to speak' })}
              </p>
              <button
                type="button"
                onClick={() => { playTap(); setTypedMode(true); }}
                className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <Keyboard className="h-3.5 w-3.5" />
                {t('speechCoach.typeInstead', { defaultValue: 'Type it instead' })}
              </button>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
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
                className="flex-1 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-500 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? '…' : t('speechCoach.checkAnswer', { defaultValue: 'Check my answer' })}
              </button>
              <button
                type="button"
                onClick={() => { playTap(); setTypedMode(false); }}
                className="inline-flex items-center justify-center gap-1 rounded-2xl border border-teal-200 px-3 py-2 text-[11px] font-bold text-teal-600 transition hover:bg-teal-50"
              >
                <Mic className="h-4 w-4" />
                {t('speech.useVoice', { defaultValue: 'Use voice' })}
              </button>
            </div>
          )}
        </>
      )}

      {/* Banded feedback */}
      {result && band && (
        <div className={`mt-5 rounded-2xl border p-4 text-center ${result.passed ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'}`}>
          <div className="flex items-center justify-center gap-2">
            {result.passed ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <XCircle className="h-6 w-6 text-amber-500" />}
            <span className={`text-3xl font-black ${result.passed ? 'text-emerald-600' : 'text-amber-600'}`}>{result.overall}%</span>
            <span className="text-xl">{band.stars === 3 ? '⭐⭐⭐' : band.stars === 2 ? '⭐⭐' : '⭐'}</span>
          </div>
          <p className="mt-1 text-sm font-bold text-gray-700">{result.message}</p>

          {/* accuracy bars */}
          <div className="mt-3 space-y-1.5 text-left">
            {[
              { label: t('speechCoach.wordAccuracy', { defaultValue: 'Word accuracy' }), v: result.word_accuracy },
              { label: t('speechCoach.letterAccuracy', { defaultValue: 'Letter accuracy' }), v: result.letter_accuracy },
              { label: t('speechCoach.fluency', { defaultValue: 'Fluency' }), v: result.fluency },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-[11px] font-bold text-gray-600">{row.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, row.v))}%` }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-[11px] font-black text-gray-700">{Math.round(row.v)}%</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            {!result.passed && (
              <button
                type="button"
                onClick={retry}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-amber-600 shadow-sm transition hover:bg-amber-50 active:scale-95"
              >
                <RotateCcw className="h-4 w-4" />
                {t('speechCoach.tryAgain', { defaultValue: 'Try again' })}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 ${result.passed ? 'w-full' : ''}`}
            >
              {idx + 1 < items.length ? (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  {t('speechCoach.nextOne', { defaultValue: 'Next one!' })}
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  {t('speechCoach.finish', { defaultValue: 'All done!' })}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}